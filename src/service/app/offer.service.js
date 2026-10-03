const mongoose = require('mongoose');
const offerModel = require('../../model/offer.model');
const materialListingModel = require('../../model/materialListing.model');
const sellerBankAccountModel = require('../../model/sellerBankAccount.model');
const storeProfileModel = require('../../model/storeProfile.model');
const configenv = require('../../config/env.config');
const { notifyAdmins } = require('../admin/adminNotification.service');
const deleteConstants = require('../../constants/delete.constants');
const { LISTING_STATES } = require('../../constants/materialListing.constants');
const { OFFER_STATES, OFFER_TERMINAL_STATES, DEFAULT_OFFER_EXPIRY_HOURS } = require('../../constants/offer.constants');
const { SELLER_PAYOUT_READINESS } = require('../../constants/payout.constants');
const userModel = require('../../model/user.model');
const { resolvePayoutReadiness } = require('./payout.service');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');
const transactionModel = require('../../model/transaction.model');
const { TRANSACTION_STATES, RESERVATION_EXPIRY_HOURS } = require('../../constants/transaction.constants')
const { toPaise, fromPaise, unitPriceFromAmount } = require('../../helper/money.helper');
const notificationService = require('./notification.service');
const { NOTIFICATION_TYPES } = require('../../constants/notification.constants');
class OfferError extends Error {
  constructor(message, statusCode = 400, errorCode = null) {
    super(message);
    this.name = 'OfferError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

function roleOf(offer, userId) {
  if (String(offer.buyer) === String(userId)) return 'buyer';
  if (String(offer.seller) === String(userId)) return 'seller';
  return null;
}

async function createOffer({ buyerId, body, req }) {
  if (!mongoose.Types.ObjectId.isValid(body.listing)) {
    throw new OfferError('Invalid listing id');
  }
  // Ownership: an offer can only be linked to one of the buyer's own,
  // active projects.
  if (body.project) {
    const projectModel = require('../../model/project.model');
    const ownProject = mongoose.Types.ObjectId.isValid(body.project) && await projectModel.exists({ _id: body.project, buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED });
    if (!ownProject) throw new OfferError('Project not found', 404);
  }

  const listing = await materialListingModel.findOne({
    _id: body.listing,
    is_deleted: deleteConstants.NOT_DELETED,
  });

  if (!listing) {
    throw new OfferError('Listing not found', 404);
  }

  if (listing.status !== LISTING_STATES.LIVE) {
    throw new OfferError(
      'This listing is not currently accepting offers',
      409
    );
  }

  if (String(listing.seller) === String(buyerId)) {
    throw new OfferError(
      'You cannot make an offer on your own listing',
      403
    );
  }

  // A suspended seller can't respond or be settled — don't let buyers
  // start negotiations that can never complete.
  const sellerAccount = await userModel.findById(listing.seller).select('status is_deleted').lean();
  if (!sellerAccount || sellerAccount.status === 'suspended' || sellerAccount.is_deleted === deleteConstants.DELETED) {
    throw new OfferError('This seller is not accepting offers right now', 409);
  }

  const available =
    listing.availableQuantity ?? listing.quantity;

  if (body.quantity > available) {
    throw new OfferError(
      `Only ${available} ${listing.unit} available`,
      400
    );
  }

  const expectedTotal = fromPaise(
    Math.round(
      toPaise(listing.price) * Number(body.quantity)
    )
  );

  if (
    !listing.negotiable &&
    fromPaise(toPaise(body.amount)) !== expectedTotal
  ) {
    throw new OfferError(
      `This listing is not negotiable — offer must be ₹${expectedTotal} (₹${listing.price}/${listing.unit} × ${body.quantity})`,
      400
    );
  }

  const existing = await offerModel.findOne({
    listing: listing._id,
    buyer: buyerId,
    status: { $nin: OFFER_TERMINAL_STATES },
    is_deleted: deleteConstants.NOT_DELETED,
  });

  if (existing) {
    throw new OfferError(
      'You already have an active offer on this listing',
      409
    );
  }

  const offer = await offerModel.create({
    listing: listing._id,
    buyer: buyerId,
    seller: listing.seller,

    // Project linked to this material requirement.
    // Optional — normal marketplace offers can still have null.
    project: body.project || null,

    listedPrice: listing.price,
    quantity: body.quantity,
    currentAmount: body.amount,
    lastActionBy: 'buyer',
    status: OFFER_STATES.PENDING,

    history: [
      {
        version: 1,
        action: 'OFFER',
        by: 'buyer',
        actorId: buyerId,
        amount: body.amount,
        unitPrice: unitPriceFromAmount(
          body.amount,
          body.quantity
        ),
        message: body.message || '',
      },
    ],

    expiresAt: new Date(
      Date.now() +
        DEFAULT_OFFER_EXPIRY_HOURS * 60 * 60 * 1000
    ),
  });

  await createAuditLog({
    req,
    userId: buyerId,
    action: auditLogConstants.OFFER_CREATED,
    entity: 'offers',
    entityId: offer._id,
  });

  await notificationService.createNotification({
    recipientId: listing.seller,
    actorId: buyerId,
    type: NOTIFICATION_TYPES.OFFER_RECEIVED,
    title: 'New offer received',
    message: (actorName) => `${actorName || 'A buyer'} made an offer of ₹${body.amount} for your listing "${listing.title}"`,
    entityType: 'offer',
    entityId: offer._id,
    entityName: listing.title,
  });

  return offer;
}

async function respondToOffer({ userId, offerId, action, amount, message, req }) {
  if (!mongoose.Types.ObjectId.isValid(offerId)) throw new OfferError('Invalid offer id');
  const offer = await offerModel.findOne({ _id: offerId, is_deleted: deleteConstants.NOT_DELETED });
  if (!offer) throw new OfferError('Offer not found', 404);

  const role = roleOf(offer, userId);
  if (!role) throw new OfferError('Offer not found', 404); // never confirm someone else's offer exists
  if (OFFER_TERMINAL_STATES.includes(offer.status)) {
    throw new OfferError(`This offer is already ${offer.status.toLowerCase()}`, 409);
  }
  // The expiry sweep only runs every 15 minutes — an offer past its
  // deadline must not be acceptable/counterable in that gap.
  if (action !== 'CANCEL' && offer.expiresAt && new Date(offer.expiresAt) < new Date()) {
    throw new OfferError('This offer has expired — make a new offer to continue', 409, 'OFFER_EXPIRED');
  }

  // Entity name for the notification text (spec section 6/7) — cheap
  // single lookup, reused by whichever branch below fires.
  await offer.populate('listing', 'title negotiable');
  const listingTitle = offer.listing?.title || 'the listing';
  const listingNegotiable = offer.listing?.negotiable !== false;
  // The party who is NOT performing this action — CANCEL/REJECT/ACCEPT all
  // notify them, never the actor themself (spec section 8).
  const otherParty = role === 'buyer' ? offer.seller : offer.buyer;
  // Built per branch, sent only AFTER the state change is saved — a
  // concurrent-edit conflict must never notify about a change that didn't happen.
  let pendingNotification = null;

  if (action === 'CANCEL') {
    // Either party can withdraw at any non-terminal point — spec section
    // 18 lists CANCELLED as a distinct terminal state from REJECTED so a
    // withdrawal isn't recorded as if the other side turned it down.
    offer.status = OFFER_STATES.CANCELLED;
    offer.history.push({ version: offer.history.length + 1, action: 'CANCEL', by: role, actorId: userId, message: message || '' });
    pendingNotification = {
      type: NOTIFICATION_TYPES.OFFER_CANCELLED,
      title: 'Offer withdrawn', message: (actorName) => `${actorName || 'The other party'} withdrew from the negotiation on "${listingTitle}"`,
    };
  } else if (action === 'REJECT') {
    // Rejecting is a response to the OTHER side's latest terms; walking away
    // from your own open offer is a CANCEL.
    if (offer.lastActionBy === role) {
      throw new OfferError('You can only reject the other party\'s offer — use Withdraw to cancel your own', 409);
    }
    offer.status = OFFER_STATES.REJECTED;
    offer.history.push({ version: offer.history.length + 1, action: 'REJECT', by: role, actorId: userId, message: message || '' });
    pendingNotification = {
      type: NOTIFICATION_TYPES.OFFER_REJECTED,
      title: 'Offer rejected', message: (actorName) => `${actorName || 'The other party'} rejected your offer on "${listingTitle}"`,
    };
  } else {
    if (offer.lastActionBy === role) {
      throw new OfferError('Waiting on the other party to respond to your last offer', 409);
    }
    if (action === 'ACCEPT') {
      await assertSellerPayoutReady(offer.seller);
      // Claim the offer FIRST with a conditional update on the exact
      // version/status just read — two racing ACCEPTs (or ACCEPT vs a
      // counter) can't both win, and nothing is reserved for a loser.
      const previousStatus = offer.status;
      const accepted = await offerModel.findOneAndUpdate(
        { _id: offer._id, __v: offer.__v, status: previousStatus },
        {
          $set: { status: OFFER_STATES.ACCEPTED },
          $push: { history: { version: offer.history.length + 1, action: 'ACCEPT', by: role, actorId: userId, amount: offer.currentAmount, unitPrice: unitPriceFromAmount(offer.currentAmount, offer.quantity), message: message || '' } },
          $inc: { __v: 1 },
        },
        { new: true }
      );
      if (!accepted) throw new OfferError('This offer was just updated — refresh and try again', 409, 'CONCURRENT_UPDATE');
      const undoAccept = () => offerModel.updateOne(
        { _id: accepted._id, status: OFFER_STATES.ACCEPTED },
        { $set: { status: previousStatus }, $pop: { history: 1 }, $inc: { __v: 1 } }
      );

      let listing;
      let transaction;
      try {
        listing = await reserveInventoryForAccept(accepted, req);
      } catch (err) {
        await undoAccept();
        throw err;
      }
      try {
        // Releases the reservation itself on failure (see below).
        transaction = await createTransactionForAccept(accepted, listing, req);
      } catch (err) {
        await undoAccept();
        throw err;
      }
      await createAuditLog({ req, userId, action: auditLogConstants.OFFER_ACCEPTED, entity: 'offers', entityId: offer._id });
      // Large deals are where fraud and disputes cost most — give ops a heads-up.
      const highValueThreshold = Number(configenv.ADMIN_HIGH_VALUE_DEAL_INR) || 500000;
      if (Number(accepted.currentAmount) >= highValueThreshold) {
        await notifyAdmins('HIGH_VALUE_DEAL', {
          title: 'High-value deal agreed',
          message: `₹${Number(accepted.currentAmount).toLocaleString('en-IN')} for ${accepted.quantity} units of "${listingTitle}" — awaiting buyer payment.`,
          entityType: 'transaction', entityId: transaction._id, entityName: listingTitle, userId: accepted.seller,
        });
      }
      await notificationService.createNotification({
        recipientId: otherParty, actorId: userId, type: NOTIFICATION_TYPES.OFFER_ACCEPTED,
        title: 'Offer accepted', message: (actorName) => `${actorName || 'The other party'} accepted the offer for ${offer.quantity} units of "${listingTitle}" — proceed to payment`,
        entityType: 'transaction', entityId: transaction._id, entityName: listingTitle,
      });
      return accepted;
    } else if (action === 'COUNTER') {
      // Fixed-price listings can be accepted or declined, never haggled —
      // createOffer already enforces the exact price on the opening offer.
      if (!listingNegotiable) {
        throw new OfferError('This listing has a fixed price — counter-offers are not allowed', 409, 'LISTING_NOT_NEGOTIABLE');
      }
      // Same number back just hands the turn over without negotiating.
      if (toPaise(amount) === toPaise(offer.currentAmount)) {
        throw new OfferError('Your counter is the same as the current offer — accept it instead, or propose a different amount', 400, 'COUNTER_UNCHANGED');
      }
      offer.status = OFFER_STATES.COUNTERED;
      offer.currentAmount = amount;
      offer.lastActionBy = role;
      // Each counter restarts the response window. Previously expiry was
      // fixed at creation + 72h, so a counter sent late in that window
      // expired before the other side could possibly answer it.
      offer.expiresAt = new Date(Date.now() + DEFAULT_OFFER_EXPIRY_HOURS * 60 * 60 * 1000);
      offer.history.push({ version: offer.history.length + 1, action: 'COUNTER', by: role, actorId: userId, amount, unitPrice: unitPriceFromAmount(amount, offer.quantity), message: message || '' });
      const unitText = fromPaise(Math.round(toPaise(amount) / offer.quantity));
      pendingNotification = {
        type: NOTIFICATION_TYPES.OFFER_COUNTERED,
        title: 'Counter-offer received',
        message: (actorName) => `${actorName || 'The other party'} countered with ₹${Number(amount).toLocaleString('en-IN')} (≈ ₹${unitText}/unit) on "${listingTitle}"`,
      };
    } else {
      throw new OfferError('Unknown action');
    }
  }

  await offer.save();
  if (pendingNotification) {
    await notificationService.createNotification({
      recipientId: otherParty, actorId: userId, entityType: 'offer', entityId: offer._id, entityName: listingTitle,
      ...pendingNotification,
    });
  }
  const auditActionMap = {
    ACCEPT: auditLogConstants.OFFER_ACCEPTED,
    COUNTER: auditLogConstants.OFFER_COUNTERED,
    REJECT: auditLogConstants.OFFER_REJECTED,
    CANCEL: auditLogConstants.OFFER_CANCELLED,
  };
  await createAuditLog({ req, userId, action: auditActionMap[action], entity: 'offers', entityId: offer._id });
  return offer;
}

// Blocks ACCEPT before any money or inventory moves — a buyer's payment
// must never be taken for a seller who cannot ultimately be settled.
// Spec section 5 (critical requirement): the seller needs a verified
// payout account BEFORE accepting, not merely before the eventual payout
// (payout.service.js already holds unverified payouts, but that lets a
// buyer's ₹ sit in limbo indefinitely — better to block it up front).
async function assertSellerPayoutReady(sellerId) {
  const [bankAccount, seller] = await Promise.all([
    sellerBankAccountModel.findOne({ seller: sellerId, is_deleted: deleteConstants.NOT_DELETED }),
    userModel.findById(sellerId).select('status').lean(),
  ]);
  const readiness = resolvePayoutReadiness({ bankAccount, sellerStatus: seller?.status });
  if (readiness !== SELLER_PAYOUT_READINESS.READY) {
    const err = new OfferError(
      'Complete payout setup before accepting this offer.',
      409,
      'SELLER_PAYOUT_SETUP_REQUIRED'
    );
    err.readiness = readiness;
    throw err;
  }
}

// Atomic single-document update — no reservation is possible unless
// enough availableQuantity exists at the instant of the update, which is
// what prevents two buyers from both reserving the same units.
async function reserveInventoryForAccept(offer, req) {
  const listing = await materialListingModel.findOneAndUpdate(
    // status LIVE: a listing the seller paused/archived after the offer was
    // made must not have stock reserved against it.
    { _id: offer.listing, status: LISTING_STATES.LIVE, availableQuantity: { $gte: offer.quantity }, is_deleted: deleteConstants.NOT_DELETED },
    { $inc: { availableQuantity: -offer.quantity, reservedQuantity: offer.quantity } },
    { new: true }
  );
  if (!listing) {
    const current = await materialListingModel.findById(offer.listing).select('status availableQuantity unit').lean();
    if (current && current.status !== LISTING_STATES.LIVE && current.status !== LISTING_STATES.SOLD_OUT) {
      throw new OfferError('This listing is not available right now (paused or under review)', 409, 'LISTING_NOT_AVAILABLE');
    }
    throw new OfferError(`Not enough stock left — only ${current?.availableQuantity ?? 0} ${current?.unit || 'units'} available`, 409, 'INSUFFICIENT_INVENTORY');
  }
  await createAuditLog({ req, userId: offer.seller, action: auditLogConstants.INVENTORY_RESERVED, entity: 'material_listings', entityId: listing._id, metadata: { offerId: offer._id, quantity: offer.quantity } });

  if (listing.availableQuantity === 0 && listing.status === LISTING_STATES.LIVE) {
    listing.status = LISTING_STATES.SOLD_OUT;
    listing.stateHistory.push({ fromStatus: LISTING_STATES.LIVE, toStatus: LISTING_STATES.SOLD_OUT, changedByType: 'system', reason: 'Available quantity reached zero' });
    await listing.save();
    await createAuditLog({ req, userId: offer.seller, action: auditLogConstants.LISTING_SOLD_OUT, entity: 'material_listings', entityId: listing._id });
  }
  return listing;
}

// Compensates the reservation above if transaction creation fails, since
// this project doesn't use multi-document Mongo transactions elsewhere —
// this keeps listing inventory as the single source of truth even without one.
async function createTransactionForAccept(
  offer,
  listing,
  req
) {
  try {
    const transaction = await transactionModel.create({
      listing: listing._id,
      offer: offer._id,
      project: offer.project,

      buyer: offer.buyer,
      seller: offer.seller,

      agreedQuantity: offer.quantity,
      agreedAmount: offer.currentAmount,
      unitPrice: unitPriceFromAmount(
        offer.currentAmount,
        offer.quantity
      ),

      status: TRANSACTION_STATES.PAYMENT_PENDING,

      reservationExpiresAt: new Date(
        Date.now() +
          RESERVATION_EXPIRY_HOURS * 60 * 60 * 1000
      ),

      history: [
        {
          action: 'CREATED',
          by: 'system',
          note: 'Created on offer acceptance',
        },
      ],
    });

    await createAuditLog({
      req,
      userId: offer.seller,
      action: auditLogConstants.TRANSACTION_CREATED,
      entity: 'transactions',
      entityId: transaction._id,
    });

    return transaction;
  } catch (err) {
    await materialListingModel.updateOne(
      { _id: listing._id },
      {
        $inc: {
          availableQuantity: offer.quantity,
          reservedQuantity: -offer.quantity,
        },
        ...(listing.status === LISTING_STATES.SOLD_OUT
          ? { status: LISTING_STATES.LIVE }
          : {}),
      }
    );

    throw err;
  }
}

async function getOne({ offerId, userId, isAdmin }) {
  if (!mongoose.Types.ObjectId.isValid(offerId)) throw new OfferError('Invalid offer id', 404);
  const offer = await offerModel.findOne({ _id: offerId, is_deleted: deleteConstants.NOT_DELETED }).populate('listing', 'title images price unit');
  if (!offer) throw new OfferError('Offer not found', 404);
  if (!isAdmin && !roleOf(offer, userId)) throw new OfferError('Offer not found', 404);
  return offer;
}

const OPEN_STATES = [OFFER_STATES.PENDING, OFFER_STATES.COUNTERED];

// "Whose turn is it" views for the offers inbox, from the perspective of
// `role`. `action` = the other side moved last and the offer is still live.
function viewFilter(view, role) {
  switch (view) {
    case 'action': return { status: { $in: OPEN_STATES }, lastActionBy: { $ne: role }, expiresAt: { $gt: new Date() } };
    case 'waiting': return { status: { $in: OPEN_STATES }, lastActionBy: role };
    case 'accepted': return { status: OFFER_STATES.ACCEPTED };
    case 'closed': return { status: { $in: [OFFER_STATES.REJECTED, OFFER_STATES.EXPIRED, OFFER_STATES.CANCELLED] } };
    default: return {};
  }
}

async function myOffers({ userId, role, status, view, page = 1, limit = 20 }) {
  const party = role === 'seller' ? 'seller' : 'buyer';
  const base = { is_deleted: deleteConstants.NOT_DELETED, [party]: userId };
  const query = { ...base, ...viewFilter(view, party) };
  if (status) query.status = status;
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);
  const counterparty = party === 'seller' ? 'buyer' : 'seller';

  const [rows, count, ...viewCounts] = await Promise.all([
    offerModel.find(query)
      .populate('listing', 'title images price unit status negotiable availableQuantity storeProfile')
      // Display name only — never contact details before a deal exists.
      .populate(counterparty, 'fullName sellerType')
      .sort({ updatedAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    offerModel.countDocuments(query),
    ...['action', 'waiting', 'accepted', 'closed'].map((v) => offerModel.countDocuments({ ...base, ...viewFilter(v, party) })),
  ]);

  const acceptedIds = rows.filter((o) => o.status === OFFER_STATES.ACCEPTED).map((o) => o._id);
  const transactions = acceptedIds.length
    ? await transactionModel.find({ offer: { $in: acceptedIds } }).select('offer status escrowStatus agreedQuantity agreedAmount unitPrice currency platformCommissionPct platformCommissionAmount sellerSettlementAmount').lean()
    : [];
  const txByOfferId = new Map(transactions.map((t) => [String(t.offer), t]));

  // Buyers see the store name for Business/Store sellers.
  const storeIds = party === 'buyer' ? [...new Set(rows.map((o) => o.listing?.storeProfile).filter(Boolean).map(String))] : [];
  const stores = storeIds.length ? await storeProfileModel.find({ _id: { $in: storeIds } }).select('storeName').lean() : [];
  const storeNameById = new Map(stores.map((s) => [String(s._id), s.storeName]));

  const getData = rows.map((o) => {
    const other = o[counterparty];
    const storeName = o.listing?.storeProfile ? storeNameById.get(String(o.listing.storeProfile)) : null;
    return {
      ...o,
      [counterparty]: other?._id || o[counterparty],
      counterparty: {
        role: counterparty,
        name: storeName || (other?.fullName ? other.fullName.trim().split(/\s+/)[0] : (counterparty === 'buyer' ? 'Buyer' : 'Seller')),
        isStore: Boolean(storeName),
      },
      yourTurn: OPEN_STATES.includes(o.status) && o.lastActionBy !== party && new Date(o.expiresAt) > new Date(),
      transaction: txByOfferId.get(String(o._id)) || null,
    };
  });
  const [action, waiting, accepted, closed] = viewCounts;
  return { getData, count, page: pageNum, limit: pageLimit, counts: { action, waiting, accepted, closed } };
}

// Scheduled every 15 minutes from app.js. Per-offer conditional updates
// (instead of one updateMany) so each expired offer gets a proper history
// `version`, an optimistic-concurrency bump, and both parties are told —
// previously offers just silently flipped to EXPIRED.
async function expireStaleOffers() {
  const stale = await offerModel.find({ status: { $in: OPEN_STATES }, expiresAt: { $lt: new Date() }, is_deleted: deleteConstants.NOT_DELETED })
    .select('_id __v status history buyer seller listing').populate('listing', 'title').limit(500);
  let modified = 0;
  for (const offer of stale) {
    const updated = await offerModel.findOneAndUpdate(
      { _id: offer._id, __v: offer.__v, status: offer.status },
      {
        $set: { status: OFFER_STATES.EXPIRED },
        $push: { history: { version: offer.history.length + 1, action: 'EXPIRE', by: 'system', at: new Date() } },
        $inc: { __v: 1 },
      },
      { new: true }
    );
    if (!updated) continue; // someone acted on it in the meantime
    modified += 1;
    const listingTitle = offer.listing?.title || 'the listing';
    for (const recipientId of [offer.buyer, offer.seller]) {
      await notificationService.createNotification({
        recipientId, type: NOTIFICATION_TYPES.OFFER_EXPIRED,
        title: 'Offer expired', message: `The negotiation on "${listingTitle}" expired without a response. Make a new offer to continue.`,
        entityType: 'offer', entityId: offer._id, entityName: listingTitle,
      });
    }
  }
  return { matched: stale.length, modified };
}

module.exports = { OfferError, createOffer, respondToOffer, getOne, myOffers, expireStaleOffers };
