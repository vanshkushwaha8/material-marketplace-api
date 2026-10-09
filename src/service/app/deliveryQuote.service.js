const mongoose = require('mongoose');
const transactionModel = require('../../model/transaction.model');
const deleteConstants = require('../../constants/delete.constants');
const { TRANSACTION_STATES } = require('../../constants/transaction.constants');
const {
  DELIVERY_QUOTE_STATES: D, DELIVERY_QUOTE_TRANSITIONS, DELIVERY_QUOTE_LABELS,
  SELLER_QUOTE_SLA_HOURS, BUYER_QUOTE_WINDOW_HOURS, MAX_DELIVERY_CHARGE,
} = require('../../constants/delivery.constants');
const { toPaise, fromPaise } = require('../../helper/money.helper');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');
const notificationService = require('./notification.service');
const { NOTIFICATION_TYPES } = require('../../constants/notification.constants');
const vehicleTypeService = require('./vehicleType.service');

// Seller-quoted delivery for one order — see delivery.constants.js for the
// state machine. This is NOT an Offer: the product price is already fixed
// on the transaction; only the delivery vehicle and charge are agreed here.
//
// Money rule: the seller's quote is stored as delivery.charge (a proposal).
// transaction.deliveryCharge / totalPayable change ONLY in accept(), as a
// compare-and-set on the exact quote version the buyer reviewed — so a
// buyer can never pay a quote they didn't see, and a seller can't change a
// quote after the buyer agreed to it.

class DeliveryQuoteError extends Error {
  constructor(message, statusCode = 400, code = null) {
    super(message);
    this.name = 'DeliveryQuoteError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const HOUR_MS = 60 * 60 * 1000;
// Re-requesting a quote resets the hold timer; this caps how long one
// unpaid order can keep stock reserved in total.
const MAX_RESERVATION_MS = 7 * 24 * HOUR_MS;

function holdUntil(txn, hours) {
  const want = Date.now() + hours * HOUR_MS;
  const cap = new Date(txn.createdAt || Date.now()).getTime() + MAX_RESERVATION_MS;
  return new Date(Math.min(want, cap));
}

// Product price + convenience fee + delivery.
const totalWith = (txn, deliveryCharge) => fromPaise(toPaise(txn.agreedAmount) + toPaise(txn.buyerFeeAmount || 0) + toPaise(deliveryCharge || 0));

const statusOf = (txn) => txn.delivery?.status || D.NOT_REQUIRED;

/**
 * May this order be paid now? Pickup: yes. Delivery: only once the buyer
 * accepted a seller quote. A DELIVERY order still at NOT_REQUIRED was priced
 * by the old rate card before seller quotes existed — its charge was shown
 * to the buyer at checkout, so it stays payable.
 */
function readyForPayment(txn) {
  if (txn.fulfilment?.method !== 'DELIVERY') return true;
  return [D.ACCEPTED, D.NOT_REQUIRED].includes(statusOf(txn));
}

function canTransition(current, action) {
  const rule = DELIVERY_QUOTE_TRANSITIONS[action];
  return Boolean(rule && rule.from.includes(current));
}

/** Actions the given party can take right now (drives which buttons the UI shows). */
function allowedActions(txn, role) {
  if (txn.status !== TRANSACTION_STATES.PAYMENT_PENDING || txn.fulfilment?.method !== 'DELIVERY') return [];
  const current = statusOf(txn);
  return Object.entries(DELIVERY_QUOTE_TRANSITIONS)
    .filter(([action, r]) => r.actor === role && r.from.includes(current) && !['REQUEST', 'SWITCH_TO_PICKUP'].includes(action))
    .map(([action]) => action);
}

// Legacy rows have no `delivery` at all — match "missing" as the default.
const eqOrMissing = (value, dflt) => (value === dflt ? { $in: [dflt, null] } : value);

/**
 * Apply one delivery-quote transition atomically.
 * @param {object} p
 * @param {string} p.transactionId
 * @param {string} p.action           key of DELIVERY_QUOTE_TRANSITIONS
 * @param {'buyer'|'seller'} p.by
 * @param {string} p.actorId
 * @param {number|null} [p.expectVersion] refuse if the quote version moved
 * @param {(current: object) => object} [p.set] dotted-path $set built from the current row
 * @param {object|(current: object) => object} [p.event] extra fields for the delivery.history row
 * @param {string} [p.note]           order history note
 * @param {string} p.auditAction
 * @param {object} [p.req]
 */
async function transition({ transactionId, action, by, actorId, expectVersion = null, set = () => ({}), event = {}, note = '', auditAction, req }) {
  const rule = DELIVERY_QUOTE_TRANSITIONS[action];
  if (!rule) throw new DeliveryQuoteError(`Unknown delivery action ${action}`, 500);
  if (!mongoose.Types.ObjectId.isValid(transactionId)) throw new DeliveryQuoteError('Order not found', 404);

  const current = await transactionModel.findOne({ _id: transactionId, is_deleted: deleteConstants.NOT_DELETED }).lean();
  if (!current) throw new DeliveryQuoteError('Order not found', 404);
  // Ownership — never reveal another party's order.
  const party = by === 'seller' ? current.seller : current.buyer;
  if (String(party) !== String(actorId)) throw new DeliveryQuoteError('Order not found', 404);
  if (current.status !== TRANSACTION_STATES.PAYMENT_PENDING) {
    throw new DeliveryQuoteError('This order is no longer awaiting payment — delivery can\'t be changed now', 409, 'ORDER_NOT_PENDING');
  }

  const from = statusOf(current);
  if (!rule.from.includes(from)) {
    const msg = from === D.ACCEPTED
      ? 'Delivery for this order is already agreed. To change it, cancel the order and buy again.'
      : `Not possible right now — ${DELIVERY_QUOTE_LABELS[from].toLowerCase()}.`;
    throw new DeliveryQuoteError(msg, 409, from === D.ACCEPTED ? 'DELIVERY_LOCKED' : 'INVALID_DELIVERY_TRANSITION');
  }
  const version = current.delivery?.version || 0;
  if (expectVersion != null && Number(expectVersion) !== version) {
    throw new DeliveryQuoteError('The seller just updated the delivery quote — please review the new one.', 409, 'QUOTE_CHANGED');
  }

  const nextVersion = action === 'QUOTE' ? version + 1 : version;
  const extra = typeof event === 'function' ? event(current) : event;
  const row = { action, from, to: rule.to, by, version: nextVersion, at: new Date(), ...extra };
  const updated = await transactionModel.findOneAndUpdate(
    {
      _id: current._id,
      is_deleted: deleteConstants.NOT_DELETED,
      status: TRANSACTION_STATES.PAYMENT_PENDING,
      'delivery.status': eqOrMissing(from, D.NOT_REQUIRED),
      'delivery.version': eqOrMissing(version, 0),
    },
    {
      $set: { ...set(current), 'delivery.status': rule.to, 'delivery.version': nextVersion },
      $push: { 'delivery.history': row, history: { action: `DELIVERY_${action}`, by, note: String(note || '').slice(0, 300) } },
      // Keeps document.save() callers (optimisticConcurrency) from
      // overwriting this change with a stale copy.
      $inc: { __v: 1 },
    },
    { new: true }
  ).lean();
  if (!updated) {
    throw new DeliveryQuoteError('This order was just updated — refresh to see the latest delivery details.', 409, 'CONCURRENT_UPDATE');
  }

  await createAuditLog({
    req, userId: actorId, action: auditAction, entity: 'transactions', entityId: updated._id,
    fromState: from, toState: rule.to,
    metadata: { version: nextVersion, vehicle: row.vehicle?.code, charge: row.charge ?? undefined },
  });
  return { txn: updated, from, previous: current };
}

async function listingTitle(txn) {
  const listing = await require('../../model/materialListing.model').findById(txn.listing).select('title').lean();
  return listing?.title || 'your order';
}

// --------------------------------------------------------------- buyer --

/**
 * Buyer chose delivery (or changed the address / requested vehicle).
 * Called by transaction.service#setFulfilment, which validated the address
 * and built `fulfilment` + the requirement snapshot.
 */
async function request({ transactionId, buyerId, fulfilment, requirement, requestedVehicle, req }) {
  const now = new Date();
  const { txn, from } = await transition({
    transactionId, action: 'REQUEST', by: 'buyer', actorId: buyerId, auditAction: auditLogConstants.DELIVERY_QUOTE_REQUESTED, req,
    event: { vehicle: requestedVehicle },
    note: requestedVehicle ? `Delivery requested — buyer asked for ${requestedVehicle.name}` : 'Delivery requested — seller to choose the vehicle',
    set: (current) => ({
      fulfilment,
      // Nothing is payable for delivery until a quote is accepted.
      deliveryCharge: 0,
      totalPayable: totalWith(current, 0),
      'delivery.recommendedVehicle': requirement.recommendedVehicle,
      'delivery.multipleTrips': Boolean(requirement.multipleTrips),
      'delivery.buyerRequestedVehicle': requestedVehicle,
      'delivery.sellerApprovedVehicle': null,
      'delivery.vehicleChangeReason': '',
      'delivery.sellerNote': '',
      'delivery.charge': null,
      'delivery.buyerRejectReason': '',
      'delivery.sellerDeclineReason': '',
      'delivery.requestedAt': now,
      'delivery.quotedAt': null,
      'delivery.respondedAt': null,
      // The seller has SELLER_QUOTE_SLA_HOURS to answer, else the order is
      // released by the reservation sweep.
      reservationExpiresAt: holdUntil(current, SELLER_QUOTE_SLA_HOURS),
    }),
  });

  const title = await listingTitle(txn);
  await notificationService.createNotification({
    recipientId: txn.seller, actorId: buyerId, type: NOTIFICATION_TYPES.DELIVERY_QUOTE_REQUESTED,
    title: from === D.QUOTED ? 'Delivery details changed — new quote needed' : 'Delivery quote needed',
    message: (actorName) => `${actorName || 'A buyer'} wants "${title}" delivered${requestedVehicle ? ` by ${requestedVehicle.name}` : ''}. Confirm the vehicle and delivery charge within ${SELLER_QUOTE_SLA_HOURS} hours.`,
    entityType: 'transaction', entityId: txn._id, entityName: title,
  });
  return txn;
}

async function accept({ transactionId, buyerId, version, req }) {
  const now = new Date();
  const { txn } = await transition({
    transactionId, action: 'ACCEPT', by: 'buyer', actorId: buyerId, expectVersion: version,
    auditAction: auditLogConstants.DELIVERY_QUOTE_ACCEPTED, req,
    set: (current) => {
      const charge = Number(current.delivery?.charge);
      if (!Number.isFinite(charge) || charge < 0) throw new DeliveryQuoteError('This quote has no delivery charge — ask the seller to quote again', 409);
      return {
        deliveryCharge: charge,
        totalPayable: totalWith(current, charge),
        'delivery.respondedAt': now,
        reservationExpiresAt: holdUntil(current, BUYER_QUOTE_WINDOW_HOURS),
      };
    },
    event: (current) => ({ charge: current.delivery?.charge ?? null, vehicle: current.delivery?.sellerApprovedVehicle || null }),
    note: 'Buyer accepted the delivery quote',
  });

  const title = await listingTitle(txn);
  await notificationService.createNotification({
    recipientId: txn.seller, actorId: buyerId, type: NOTIFICATION_TYPES.DELIVERY_QUOTE_ACCEPTED,
    title: 'Delivery quote accepted',
    message: (actorName) => `${actorName || 'The buyer'} accepted your ₹${Number(txn.deliveryCharge).toLocaleString('en-IN')} delivery charge for "${title}" — waiting for their payment`,
    entityType: 'transaction', entityId: txn._id, entityName: title,
  });
  return txn;
}

async function reject({ transactionId, buyerId, version, reason = '', req }) {
  const { txn } = await transition({
    transactionId, action: 'REJECT', by: 'buyer', actorId: buyerId, expectVersion: version,
    auditAction: auditLogConstants.DELIVERY_QUOTE_REJECTED, req,
    set: () => ({ 'delivery.buyerRejectReason': reason, 'delivery.respondedAt': new Date() }),
    event: { note: reason }, note: reason ? `Buyer rejected the delivery quote: ${reason}` : 'Buyer rejected the delivery quote',
  });
  const title = await listingTitle(txn);
  await notificationService.createNotification({
    recipientId: txn.seller, actorId: buyerId, type: NOTIFICATION_TYPES.DELIVERY_QUOTE_REJECTED,
    title: 'Delivery quote rejected',
    message: (actorName) => `${actorName || 'The buyer'} rejected the delivery quote for "${title}"${reason ? `: ${reason}` : ''}`,
    entityType: 'transaction', entityId: txn._id, entityName: title,
  });
  return txn;
}

/** Buyer picked pickup instead — called by transaction.service#setFulfilment. */
async function switchToPickup({ transactionId, buyerId, fulfilment, req }) {
  const { txn, from } = await transition({
    transactionId, action: 'SWITCH_TO_PICKUP', by: 'buyer', actorId: buyerId,
    auditAction: auditLogConstants.TRANSACTION_FULFILMENT_SET, req, note: 'Pickup chosen',
    set: (current) => ({
      fulfilment,
      deliveryCharge: 0,
      totalPayable: totalWith(current, 0),
      'delivery.charge': null,
      'delivery.sellerApprovedVehicle': null,
    }),
  });
  // Tell the seller only if they were being asked for a quote.
  if ([D.AWAITING_SELLER, D.QUOTED].includes(from)) {
    const title = await listingTitle(txn);
    await notificationService.createNotification({
      recipientId: txn.seller, actorId: buyerId, type: NOTIFICATION_TYPES.DELIVERY_QUOTE_REJECTED,
      title: 'Buyer will pick up instead',
      message: (actorName) => `${actorName || 'The buyer'} switched "${title}" to pickup — no delivery quote needed`,
      entityType: 'transaction', entityId: txn._id, entityName: title,
    });
  }
  return txn;
}

// -------------------------------------------------------------- seller --

/**
 * Seller confirms (or changes) the vehicle and sets the delivery charge.
 * Also used to revise a quote the buyer hasn't answered yet (QUOTED → QUOTED,
 * version + 1 — the buyer's accept for the old version then fails).
 */
async function quote({ transactionId, sellerId, vehicleCode, charge, vehicleChangeReason = '', sellerNote = '', req }) {
  const vehicle = await vehicleTypeService.findActiveByCode(vehicleCode);
  if (!vehicle) throw new DeliveryQuoteError('Choose a vehicle from the list', 400, 'VEHICLE_INVALID');
  const amount = fromPaise(toPaise(charge));
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_DELIVERY_CHARGE) {
    throw new DeliveryQuoteError(`Enter a delivery charge between ₹0 and ₹${MAX_DELIVERY_CHARGE.toLocaleString('en-IN')}`, 400, 'CHARGE_INVALID');
  }
  const approved = vehicleTypeService.snapshot(vehicle);
  const reason = String(vehicleChangeReason || '').trim();

  const { txn, from } = await transition({
    transactionId, action: 'QUOTE', by: 'seller', actorId: sellerId, auditAction: auditLogConstants.DELIVERY_QUOTED, req,
    event: { vehicle: approved, charge: amount, note: reason },
    note: `Delivery quoted — ${approved.name}, ₹${amount}`,
    set: (current) => {
      const requested = current.delivery?.buyerRequestedVehicle;
      const changed = Boolean(requested && requested.code !== approved.code);
      // The buyer asked for a specific vehicle: replacing it needs a reason
      // they can read before accepting.
      if (changed && reason.length < 5) {
        throw new DeliveryQuoteError(`You changed the buyer's vehicle (${requested.name}) — tell them why (at least 5 characters)`, 400, 'VEHICLE_CHANGE_REASON_REQUIRED');
      }
      return {
        'delivery.sellerApprovedVehicle': approved,
        'delivery.vehicleChangeReason': changed ? reason : '',
        'delivery.sellerNote': String(sellerNote || '').trim(),
        'delivery.charge': amount,
        'delivery.quotedAt': new Date(),
        'delivery.buyerRejectReason': '',
        reservationExpiresAt: holdUntil(current, BUYER_QUOTE_WINDOW_HOURS),
      };
    },
  });

  const title = await listingTitle(txn);
  const changed = Boolean(txn.delivery.vehicleChangeReason);
  await notificationService.createNotification({
    recipientId: txn.buyer, actorId: sellerId, type: NOTIFICATION_TYPES.DELIVERY_QUOTED,
    title: from === D.QUOTED ? 'Delivery quote updated' : 'Delivery charge ready to review',
    message: (actorName) => `${actorName || 'The seller'} quoted ₹${amount.toLocaleString('en-IN')} for delivery of "${title}" by ${approved.name}${changed ? ' (vehicle changed)' : ''}. Review and accept it to pay.`,
    entityType: 'transaction', entityId: txn._id, entityName: title,
  });
  return txn;
}

async function decline({ transactionId, sellerId, reason, req }) {
  const text = String(reason || '').trim();
  if (text.length < 5) throw new DeliveryQuoteError('Tell the buyer why you can\'t deliver (at least 5 characters)', 400);
  const { txn } = await transition({
    transactionId, action: 'DECLINE', by: 'seller', actorId: sellerId, auditAction: auditLogConstants.DELIVERY_DECLINED, req,
    set: () => ({ 'delivery.sellerDeclineReason': text, 'delivery.charge': null }),
    event: { note: text }, note: `Seller can't deliver: ${text}`,
  });
  const title = await listingTitle(txn);
  await notificationService.createNotification({
    recipientId: txn.buyer, actorId: sellerId, type: NOTIFICATION_TYPES.DELIVERY_DECLINED,
    title: 'Seller can\'t deliver this order',
    message: (actorName) => `${actorName || 'The seller'} can't deliver "${title}": ${text}. Switch to pickup or cancel the order.`,
    entityType: 'transaction', entityId: txn._id, entityName: title,
  });
  return txn;
}

// -------------------------------------------------------------- system --

/**
 * The reservation sweep cancelled an order whose quote was still open —
 * record why and tell both sides. Runs after the order is CANCELLED, so it
 * bypasses transition()'s PAYMENT_PENDING guard but is still conditional.
 */
async function markExpired(txn) {
  const from = statusOf(txn);
  if (!canTransition(from, 'EXPIRE')) return false;
  const res = await transactionModel.updateOne(
    { _id: txn._id, 'delivery.status': from },
    {
      $set: { 'delivery.status': D.EXPIRED },
      $push: { 'delivery.history': { action: 'EXPIRE', from, to: D.EXPIRED, by: 'system', version: txn.delivery?.version || 0, at: new Date() } },
      $inc: { __v: 1 },
    }
  );
  if (!res.modifiedCount) return false;
  await createAuditLog({ userId: txn.buyer, action: auditLogConstants.DELIVERY_QUOTE_EXPIRED, entity: 'transactions', entityId: txn._id, fromState: from, toState: D.EXPIRED });
  const title = await listingTitle(txn);
  const why = from === D.AWAITING_SELLER ? 'the seller didn\'t confirm delivery in time' : 'the delivery quote wasn\'t accepted and paid in time';
  for (const recipientId of [txn.buyer, txn.seller]) {
    await notificationService.createNotification({
      recipientId, type: NOTIFICATION_TYPES.DELIVERY_QUOTE_EXPIRED,
      title: 'Order cancelled', message: `The order for "${title}" was cancelled because ${why}. Reserved stock was released.`,
      entityType: 'transaction', entityId: txn._id, entityName: title,
    });
  }
  return true;
}

// ---------------------------------------------------------------- view --

/** What buyer and seller UIs need to show the delivery agreement. */
function view(txn, role) {
  const d = txn.delivery || {};
  const status = statusOf(txn);
  const requested = d.buyerRequestedVehicle || null;
  const approved = d.sellerApprovedVehicle || null;
  return {
    status,
    label: DELIVERY_QUOTE_LABELS[status] || status,
    version: d.version || 0,
    recommendedVehicle: d.recommendedVehicle || null,
    multipleTrips: Boolean(d.multipleTrips),
    buyerRequestedVehicle: requested,
    sellerApprovedVehicle: approved,
    vehicleChanged: Boolean(requested && approved && requested.code !== approved.code),
    vehicleChangeReason: d.vehicleChangeReason || '',
    sellerNote: d.sellerNote || '',
    charge: d.charge ?? null,
    buyerRejectReason: d.buyerRejectReason || '',
    sellerDeclineReason: d.sellerDeclineReason || '',
    requestedAt: d.requestedAt || null,
    quotedAt: d.quotedAt || null,
    respondedAt: d.respondedAt || null,
    weightKg: txn.fulfilment?.weightKg ?? null,
    distanceKm: txn.fulfilment?.distanceKm ?? null,
    readyForPayment: readyForPayment(txn),
    actions: role ? allowedActions(txn, role) : [],
    history: (d.history || []).map((h) => ({ action: h.action, to: h.to, by: h.by, version: h.version, vehicle: h.vehicle || null, charge: h.charge ?? null, note: h.note || '', at: h.at })),
  };
}

module.exports = {
  DeliveryQuoteError, readyForPayment, allowedActions, canTransition, holdUntil, totalWith,
  request, accept, reject, switchToPickup, quote, decline, markExpired, view,
};
