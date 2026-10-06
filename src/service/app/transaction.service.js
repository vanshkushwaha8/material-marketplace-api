const mongoose = require('mongoose');
const transactionModel = require('../../model/transaction.model');
const materialListingModel = require('../../model/materialListing.model');
const deleteConstants = require('../../constants/delete.constants');
const { LISTING_STATES } = require('../../constants/materialListing.constants');
const { TRANSACTION_STATES, TRANSACTION_TERMINAL_STATES, SETTLEMENT_STATES, COMMISSION_STATES } = require('../../constants/transaction.constants');
const { createAuditLog, createAuditLogAdmin } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');
const configenv = require('../../config/env.config');
const { toPaise, fromPaise, calculateCommissionPaise, payableAmount } = require('../../helper/money.helper');
const payoutService = require('./payout.service');
const notificationService = require('./notification.service');
const { NOTIFICATION_TYPES } = require('../../constants/notification.constants');
const { notifyAdmins } = require('../admin/adminNotification.service');
const escrow = require('./escrow.service');
const commissionService = require('./commission.service');
const userModel = require('../../model/user.model');
const { ESCROW_STATES, ESCROW_ACTORS, ESCROW_LABELS } = require('../../constants/escrow.constants');
class TransactionError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = 'TransactionError';
        this.statusCode = statusCode;
    }
}

function roleOf(txn, userId) {
    if (String(txn.buyer) === String(userId)) return 'buyer';
    if (String(txn.seller) === String(userId)) return 'seller';
    return null;
}

async function getOwned(transactionId, userId) {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) throw new TransactionError('Invalid transaction id', 404);
    const txn = await transactionModel.findOne({ _id: transactionId, is_deleted: deleteConstants.NOT_DELETED });
    if (!txn) throw new TransactionError('Transaction not found', 404);
    const role = roleOf(txn, userId);
    // Same answer as a missing transaction — a non-party must not learn it exists.
    if (!role) throw new TransactionError('Transaction not found', 404);
    return { txn, role };
}

// Centralized so 8.9% (or whatever it's changed to) is never hard-coded
// at more than one call site — spec section "8.9% PLATFORM COMMISSION".
async function calculateCommission(amount, sellerType) {
    const { pct, settingId, sellerType: appliedType } = await commissionService.getApplicableCommission(sellerType);
    const { commissionAmountPaise, sellerSettlementPaise } = calculateCommissionPaise(toPaise(amount), pct);
    return { pct, settingId, sellerType: appliedType, commission: fromPaise(commissionAmountPaise), settlement: fromPaise(sellerSettlementPaise) };
}

// Called ONLY from payment.service.js — after the provider has verified
// the payment (checkout callback or webhook), never directly by the
// buyer. Reserved -> Sold happens here, per the spec's numeric example
// under CORE INVENTORY MODEL. Idempotent: re-checks status before acting,
// since payment.service.js may call this from both the callback and a
// racing webhook for the same payment.
//
// Returns { txn, advanced }. `advanced` is true only for the ONE caller whose
// conditional update actually moved PAYMENT_PENDING -> PAYMENT_CONFIRMED.
// The previous read-check-save let a racing callback + webhook both pass the
// status check, moving reserved->sold inventory twice.
async function markPaymentConfirmed({ transactionId, providerPaymentId, req }) {
    const current = await transactionModel.findOne({ _id: transactionId, is_deleted: deleteConstants.NOT_DELETED });
    if (!current) throw new TransactionError('Transaction not found', 404);
    if (current.status !== TRANSACTION_STATES.PAYMENT_PENDING) {
        return { txn: current, advanced: false };
    }

    // Financial lock: the commission that applies to THIS seller's type
    // right now is stored on the transaction (rate + the exact admin
    // setting version). Later admin changes never alter it.
    const seller = await userModel.findById(current.seller).select('sellerType').lean();
    const c = await calculateCommission(current.agreedAmount, seller?.sellerType);
    const now = new Date();

    let paid;
    try {
        // Order status and escrow state move together, atomically, and only
        // from PAYMENT_PENDING — a capture for a cancelled/expired order or a
        // second capture for an already-paid one cannot apply.
        paid = await escrow.transition({
            transactionId: current._id, action: 'PAYMENT_CAPTURED', actor: { type: ESCROW_ACTORS.PROVIDER },
            // Amount captured = product price + buyer fee; commission and
            // settlement (above) stay based on the product price only.
            providerRef: providerPaymentId || '', amount: payableAmount(current),
            where: { status: TRANSACTION_STATES.PAYMENT_PENDING, is_deleted: deleteConstants.NOT_DELETED },
            set: {
                status: TRANSACTION_STATES.PAYMENT_CONFIRMED,
                paymentConfirmedAt: now,
                platformCommissionPct: c.pct,
                platformCommissionAmount: c.commission,
                // The seller delivers, so the delivery charge is theirs —
                // added after commission (commission is on the product only).
                sellerSettlementAmount: fromPaise(toPaise(c.settlement) + toPaise(current.deliveryCharge || 0)),
                commissionSellerType: c.sellerType,
                commissionSetting: c.settingId,
                commissionLockedAt: now,
                commissionStatus: COMMISSION_STATES.COLLECTED,
                settlementStatus: SETTLEMENT_STATES.ON_HOLD,
            },
            push: { history: { action: 'PAYMENT_CONFIRMED', by: 'system' } },
            req,
        });
    } catch (err) {
        if (err instanceof escrow.EscrowTransitionError) return { txn: await transactionModel.findById(current._id), advanced: false };
        throw err;
    }
    if (!paid.applied) return { txn: await transactionModel.findById(current._id), advanced: false };

    // Money is never treated as the seller's on capture: it is HELD until
    // delivery + buyer confirmation.
    await escrow.transition({
        transactionId: current._id, action: 'HOLD', actor: { type: ESCROW_ACTORS.SYSTEM },
        reason: 'Held until the seller delivers and the buyer confirms receipt', amount: payableAmount(current), req,
    });
    const txn = await transactionModel.findById(current._id);

    await materialListingModel.updateOne(
        { _id: txn.listing },
        { $inc: { reservedQuantity: -txn.agreedQuantity, soldQuantity: txn.agreedQuantity } }
    );
    await createAuditLog({ req, userId: txn.buyer, action: auditLogConstants.INVENTORY_SOLD, entity: 'material_listings', entityId: txn.listing, metadata: { transactionId: txn._id, quantity: txn.agreedQuantity } });
    await createAuditLog({ req, userId: txn.buyer, action: auditLogConstants.PAYMENT_CONFIRMED, entity: 'transactions', entityId: txn._id, metadata: { commissionPct: c.pct, commission: c.commission, settlement: c.settlement, sellerType: c.sellerType } });
    return { txn, advanced: true };
}

// Atomically cancels a still-unpaid transaction and returns its reserved
// units to available stock. Status flips FIRST (conditionally) so a payment
// confirmation racing this can never also consume the same reservation —
// whichever conditional update wins decides where the units go.
async function releaseUnpaidReservation(transactionId, { action, by }) {
    let result;
    try {
        result = await escrow.transition({
            transactionId, action: 'CANCEL_UNPAID', actor: { type: by === 'system' ? ESCROW_ACTORS.SYSTEM : ESCROW_ACTORS.BUYER },
            reason: action,
            where: { status: TRANSACTION_STATES.PAYMENT_PENDING },
            set: { status: TRANSACTION_STATES.CANCELLED },
            push: { history: { action, by } },
        });
    } catch (err) {
        if (err instanceof escrow.EscrowTransitionError) return null; // paid / already closed meanwhile
        throw err;
    }
    if (!result.applied) return null;
    const txn = result.txn;
    await materialListingModel.updateOne(
        { _id: txn.listing },
        { $inc: { availableQuantity: txn.agreedQuantity, reservedQuantity: -txn.agreedQuantity } }
    );
    await materialListingModel.updateOne(
        { _id: txn.listing, status: LISTING_STATES.SOLD_OUT, availableQuantity: { $gt: 0 } },
        { $set: { status: LISTING_STATES.LIVE } }
    );
    return txn;
}

async function markHandover({ transactionId, userId, note, evidence, req }) {
    const { txn, role } = await getOwned(transactionId, userId);
    if (role !== 'seller') throw new TransactionError('Only the seller can start handover', 403);
    if (![TRANSACTION_STATES.PAYMENT_CONFIRMED, TRANSACTION_STATES.READY_FOR_HANDOVER, TRANSACTION_STATES.HANDOVER_STARTED].includes(txn.status)) {
        throw new TransactionError(`Cannot start handover from status ${txn.status}`, 409);
    }
    // HELD → DELIVERED. The payment stays protected: delivery alone never
    // releases money — the buyer's confirmation does.
    const set = { status: TRANSACTION_STATES.HANDOVER_STARTED, handoverStartedAt: new Date() };
    if (note) set.handoverNote = note;
    if (Array.isArray(evidence) && evidence.length) set.handoverEvidence = evidence;
    const result = await escrow.transition({
        transactionId: txn._id, action: 'MARK_DELIVERED', actor: { type: ESCROW_ACTORS.SELLER, id: userId },
        reason: note || '', set, where: { status: { $in: [TRANSACTION_STATES.PAYMENT_CONFIRMED, TRANSACTION_STATES.READY_FOR_HANDOVER] } },
        push: { history: { action: 'HANDOVER_STARTED', by: 'seller' } }, req,
    });
    const updated = await transactionModel.findById(txn._id);
    if (!result.applied) return updated; // duplicate request — already delivered, no second notification

    await createAuditLog({ req, userId, action: auditLogConstants.HANDOVER_STARTED, entity: 'transactions', entityId: updated._id, metadata: { evidenceCount: updated.handoverEvidence.length } });
    await updated.populate('listing', 'title');
    await notificationService.createNotification({
        recipientId: updated.buyer, actorId: userId, type: NOTIFICATION_TYPES.HANDOVER_STARTED,
        title: 'Material handed over',
        message: (actorName) => `${actorName || 'The seller'} marked "${updated.listing?.title || 'the material'}" as delivered — your payment stays held until you confirm receipt`,
        entityType: 'transaction', entityId: updated._id, entityName: updated.listing?.title || null,
    });
    return updated;
}

async function confirmReceipt({ transactionId, userId, req }) {
    const { txn, role } = await getOwned(transactionId, userId);
    if (role !== 'buyer') throw new TransactionError('Only the buyer can confirm receipt', 403);
    if (![TRANSACTION_STATES.HANDOVER_STARTED, TRANSACTION_STATES.COMPLETED].includes(txn.status)) {
        throw new TransactionError(`Cannot confirm receipt from status ${txn.status}`, 409);
    }
    const now = new Date();
    const result = await escrow.transition({
        transactionId: txn._id, action: 'BUYER_CONFIRM', actor: { type: ESCROW_ACTORS.BUYER, id: userId },
        where: { status: TRANSACTION_STATES.HANDOVER_STARTED },
        set: { status: TRANSACTION_STATES.COMPLETED, buyerConfirmedAt: now, completedAt: now, settlementStatus: SETTLEMENT_STATES.PENDING },
        push: { history: { $each: [{ action: 'BUYER_CONFIRMED', by: 'buyer' }, { action: 'COMPLETED', by: 'system' }] } },
        req,
    });
    const updated = await transactionModel.findById(txn._id);
    if (!result.applied) return updated; // duplicate confirmation — already processed once

    await createAuditLog({ req, userId, action: auditLogConstants.TRANSACTION_COMPLETED, entity: 'transactions', entityId: updated._id, metadata: { commission: updated.platformCommissionAmount, settlement: updated.sellerSettlementAmount } });
    await updated.populate('listing', 'title');
    await notificationService.createNotification({
        recipientId: updated.seller,
        actorId: userId,
        type: NOTIFICATION_TYPES.RECEIPT_CONFIRMED,
        title: 'Receipt confirmed',
        message: (actorName) => `${actorName || 'The buyer'} confirmed receipt of "${updated.listing?.title || 'the material'}" — your payment is being released`,
        entityType: 'transaction',
        entityId: updated._id,
        entityName: updated.listing?.title || null,
    });

    if (updated.project) {
        const projectService = require('./project.service');
        await projectService.markMaterialSourced({ projectId: updated.project, buyerId: updated.buyer, count: 1 }).catch(() => { });
    }

    await settleConfirmedTransaction({ transactionId: updated._id, actor: { type: ESCROW_ACTORS.SYSTEM }, req });
    return transactionModel.findById(updated._id);
}

// BUYER_CONFIRMED (or admin-approved) → COMMISSION_DEDUCTED → RELEASE_PENDING
// → payout. Amounts were locked at capture time; nothing is recalculated
// here from current rates or from anything the client sent.
async function settleConfirmedTransaction({ transactionId, actor, reason = '', req }) {
    const txn = await escrow.loadWithEscrow(transactionId);
    if (txn.escrowStatus === ESCROW_STATES.BUYER_CONFIRMED) {
        await escrow.transition({
            transactionId, action: 'DEDUCT_COMMISSION', actor, req,
            amount: txn.platformCommissionAmount,
            reason: `${txn.platformCommissionPct}% commission (${txn.commissionSellerType || 'INDIVIDUAL'}) — seller receives ₹${txn.sellerSettlementAmount}`,
            set: { commissionDeductedAt: new Date() },
        });
    }
    const afterDeduct = await escrow.loadWithEscrow(transactionId);
    if (afterDeduct.escrowStatus === ESCROW_STATES.COMMISSION_DEDUCTED) {
        await escrow.transition({
            transactionId, action: 'QUEUE_RELEASE', actor, reason, req,
            amount: afterDeduct.sellerSettlementAmount,
            set: { releaseRequestedAt: new Date(), settlementStatus: SETTLEMENT_STATES.PENDING },
        });
    }
    return payoutService.evaluateAndInitiatePayout({ transactionId, req });
}

// Lets a buyer release inventory early instead of waiting out the full
// reservation window (spec section 37 lists "transaction cancellation" as
// a release trigger distinct from expiry). Only reachable before any money
// has actually moved — once payment is confirmed, cancellation isn't a
// thing, only dispute/refund are.
async function cancelTransaction({ transactionId, userId, req }) {
    const { txn, role } = await getOwned(transactionId, userId);
    if (role !== 'buyer') throw new TransactionError('Only the buyer can cancel a pending transaction', 403);
    if (txn.status !== TRANSACTION_STATES.PAYMENT_PENDING) {
        throw new TransactionError(`Cannot cancel a transaction in status ${txn.status}`, 409);
    }
    // A payment order the buyer may still be completing in another tab
    // would otherwise be captured against a cancelled transaction.
    if (await hasRecentActivePayment(txn._id)) {
        throw new TransactionError('A payment for this transaction is in progress — wait for it to finish before cancelling', 409);
    }
    const cancelled = await releaseUnpaidReservation(txn._id, { action: 'CANCELLED', by: 'buyer' });
    if (!cancelled) {
        throw new TransactionError('This transaction was just paid or updated — refresh to see its current status', 409);
    }
    await createAuditLog({ req, userId, action: auditLogConstants.TRANSACTION_CANCELLED, entity: 'transactions', entityId: cancelled._id });
    await createAuditLog({ req, userId, action: auditLogConstants.INVENTORY_RELEASED, entity: 'material_listings', entityId: cancelled.listing, metadata: { transactionId: cancelled._id, quantity: cancelled.agreedQuantity } });
    return cancelled;
}

// How long an open provider order protects its transaction from reservation
// expiry / buyer cancellation — covers a buyer who is mid-checkout (UPI
// collect, OTP pages) when the reservation window runs out.
const ACTIVE_PAYMENT_GRACE_MS = 30 * 60 * 1000;

async function hasRecentActivePayment(transactionId) {
    // Lazy require — payment.model has no dependency back on this service,
    // but keeping it local mirrors the project.service lazy require below.
    const paymentModel = require('../../model/payment.model');
    const { PAYMENT_STATES } = require('../../constants/payment.constants');
    return Boolean(await paymentModel.exists({
        transaction: transactionId,
        status: { $in: [PAYMENT_STATES.CREATED, PAYMENT_STATES.PENDING, PAYMENT_STATES.PROCESSING] },
        createdAt: { $gt: new Date(Date.now() - ACTIVE_PAYMENT_GRACE_MS) },
        is_deleted: deleteConstants.NOT_DELETED,
    }));
}

// Admin-only resolution of a raised dispute. Never fabricates a payment or
// settlement outcome itself — RELEASE just clears the hold so the normal
// payout.evaluateAndInitiatePayout flow (still going through the real
// payout provider) can proceed; REFUND leaves the money side to the actual
// admin-initiated-refund flow (payment.service.js#initiateAdminRefund),
// this only unblocks/records the transaction-side outcome.
// dispute:resolve covers DISPUTES only. Releasing/refunding any other
// payment needs payment:release / payment:refund (admin payment actions) —
// otherwise this endpoint would be a way around those permissions.
const DISPUTE_RESOLVABLE_ESCROW = ['DISPUTED', 'ADMIN_REVIEW'];

async function resolveDispute({ transactionId, adminId, resolution, note, idempotencyKey = null, req }) {
    if (!['RELEASE', 'REFUND'].includes(resolution)) throw new TransactionError('resolution must be RELEASE or REFUND', 400);
    if (!note || String(note).trim().length < 5) throw new TransactionError('Give a reason of at least 5 characters (recorded in the audit log)', 400);
    if (!mongoose.Types.ObjectId.isValid(transactionId)) throw new TransactionError('Transaction not found', 404);
    const txn = await transactionModel.findOne({ _id: transactionId, is_deleted: deleteConstants.NOT_DELETED }).select('status disputed escrowStatus').lean();
    if (!txn) throw new TransactionError('Transaction not found', 404);
    const underDispute = txn.disputed === true || txn.status === TRANSACTION_STATES.DISPUTED;
    if (!underDispute || (txn.escrowStatus && !DISPUTE_RESOLVABLE_ESCROW.includes(txn.escrowStatus))) {
        throw new TransactionError('This transaction has no open dispute to resolve', 409);
    }
    // The money movement itself (provider refund, or commission + release)
    // is the admin escrow service — same state machine, ledger and audit.
    const adminEscrow = require('../admin/escrow.service');
    const result = await adminEscrow.performAction({
        transactionId, action: resolution === 'RELEASE' ? 'APPROVE_RELEASE' : 'REFUND',
        reason: `Dispute resolved (${resolution}): ${String(note).trim()}`, idempotencyKey, adminId, req,
    });
    return result.transaction;
}

async function raiseDispute({ transactionId, userId, reason, req }) {
    const { txn, role } = await getOwned(transactionId, userId);
    if (TRANSACTION_TERMINAL_STATES.includes(txn.status)) {
        throw new TransactionError(`This transaction is already ${txn.status.toLowerCase()}`, 409);
    }
    if (txn.status === TRANSACTION_STATES.PAYMENT_PENDING) {
        throw new TransactionError('Nothing has been paid yet — cancel the order instead of raising a dispute', 409);
    }
    // PAID / HELD / DELIVERED → DISPUTED: the payment stays held and cannot
    // be released until an admin reviews it.
    const result = await escrow.transition({
        transactionId: txn._id, action: 'RAISE_DISPUTE', actor: { type: role === 'buyer' ? ESCROW_ACTORS.BUYER : ESCROW_ACTORS.SELLER, id: userId },
        reason,
        set: { status: TRANSACTION_STATES.DISPUTED, disputed: true, disputeReason: reason, settlementStatus: SETTLEMENT_STATES.ON_HOLD },
        push: { history: { action: 'DISPUTED', by: role, note: reason } }, req,
    });
    const updated = await transactionModel.findById(txn._id);
    if (!result.applied) return updated;

    await createAuditLog({ req, userId, action: auditLogConstants.TRANSACTION_DISPUTED, entity: 'transactions', entityId: updated._id });
    await notifyAdmins('TRANSACTION_DISPUTED', {
        title: `Dispute raised by the ${role}`,
        message: `₹${Number(updated.agreedAmount).toLocaleString('en-IN')} transaction (${updated.agreedQuantity} units) is on hold: "${String(reason || '').slice(0, 200)}"`,
        entityType: 'transaction', entityId: updated._id, userId,
        metadata: { raisedBy: role },
    });
    const otherParty = role === 'buyer' ? updated.seller : updated.buyer;
    await notificationService.createNotification({
        recipientId: otherParty, actorId: userId, type: NOTIFICATION_TYPES.TRANSACTION_DISPUTED,
        title: 'Dispute raised',
        message: (actorName) => `${actorName || 'The other party'} raised a dispute: ${reason}`,
        entityType: 'transaction', entityId: updated._id,
    });
    return updated;
}

async function getOne({ transactionId, userId }) {
    const { txn } = await getOwned(transactionId, userId);
    await escrow.loadWithEscrow(txn._id); // backfills legacy rows once
    const fresh = await transactionModel.findById(txn._id);
    await fresh.populate('listing', 'title images unit');
    await fresh.populate('buyer', 'fullName');
    await fresh.populate('seller', 'fullName sellerType');
    const payout = await require('../../model/payout.model').findOne({ transaction: fresh._id }).select('status netPayoutAmount processedAt failureReason').lean();
    const view = toPartyView(fresh.toObject(), payout);
    const store = await loadStoreSummary(fresh.seller);
    if (store) {
        // Lets checkout disable delivery up front instead of failing after
        // the buyer picks an address.
        const listing = await materialListingModel.findById(fresh.listing?._id || fresh.listing).select('location.geo').lean();
        store.canPriceDelivery = Boolean(await sellerOriginPoint(fresh.seller._id, listing));
        view.store = store;
    }
    return view;
}

// Store identity + what it offers, for the checkout page and order view.
// City/state only — same public detail the storefront shows.
async function loadStoreSummary(seller) {
    if (seller?.sellerType !== 'BUSINESS_STORE') return null;
    const storeProfileModel = require('../../model/storeProfile.model');
    const store = await storeProfileModel
        .findOne({ seller: seller._id, is_deleted: deleteConstants.NOT_DELETED })
        .select('storeName profileImage verificationStatus pickupAvailable deliveryAvailable location.city location.state')
        .lean();
    if (!store) return null;
    return {
        storeName: store.storeName,
        profileImageUrl: store.profileImage ? `/images/${store.profileImage}` : '',
        verified: store.verificationStatus === 'VERIFIED',
        pickupAvailable: !!store.pickupAvailable,
        deliveryAvailable: !!store.deliveryAvailable,
        city: store.location?.city || '',
        state: store.location?.state || '',
    };
}

async function loadPayableForBuyer(transactionId, userId) {
    const { txn, role } = await getOwned(transactionId, userId);
    if (role !== 'buyer') throw new TransactionError('Transaction not found', 404);
    if (txn.status !== TRANSACTION_STATES.PAYMENT_PENDING) {
        throw new TransactionError('Delivery details can only be changed before payment', 409);
    }
    return txn;
}

// Delivery price for this order to one of the buyer's saved addresses:
// distance from the store's pinned point (falls back to the listing's own
// point for individual sellers) + total weight (listing.weightPerUnitKg ×
// quantity), priced by the admin rate card. Server-side only.
async function priceDelivery(txn, buyerId, addressId) {
    const deliveryRateService = require('./deliveryRate.service');
    if (!mongoose.Types.ObjectId.isValid(addressId)) throw new TransactionError('Choose a delivery address', 400);
    const deliveryLocationModel = require('../../model/deliveryLocation.model');
    const address = await deliveryLocationModel.findOne({ _id: addressId, buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED }).lean();
    if (!address) throw new TransactionError('Delivery address not found', 404);

    const listing = await materialListingModel.findById(txn.listing).select('weightPerUnitKg location.geo').lean();
    const from = await sellerOriginPoint(txn.seller, listing);
    const to = address.latitude != null && address.longitude != null ? [address.longitude, address.latitude] : null;
    const weightKg = (Number(listing?.weightPerUnitKg) || 0) * Number(txn.agreedQuantity || 0);
    try {
        const q = await deliveryRateService.quote({ from, to, weightKg });
        return { quote: q, address, weightKnown: listing?.weightPerUnitKg != null };
    } catch (err) {
        if (err instanceof deliveryRateService.DeliveryRateError) {
            const e = new TransactionError(err.message, err.statusCode);
            e.code = err.code;
            throw e;
        }
        throw err;
    }
}

// Where delivery starts: the store's pinned point, else the listing's own
// point, else the seller's registered account location (all real captured
// coordinates — never a city centroid). null = nothing pinned anywhere.
async function sellerOriginPoint(sellerId, listing) {
    const valid = (c) => (Array.isArray(c) && c.length === 2 ? c : null);
    const storeProfileModel = require('../../model/storeProfile.model');
    const store = await storeProfileModel.findOne({ seller: sellerId, is_deleted: deleteConstants.NOT_DELETED }).select('location.geo').lean();
    const fromStore = valid(store?.location?.geo?.coordinates) || valid(listing?.location?.geo?.coordinates);
    if (fromStore) return fromStore;
    const user = await userModel.findById(sellerId).select('location.geo').lean();
    return valid(user?.location?.geo?.coordinates);
}

const totalsWith = (txn, deliveryCharge) => fromPaise(toPaise(txn.agreedAmount) + toPaise(txn.buyerFeeAmount || 0) + toPaise(deliveryCharge || 0));

// Checkout preview: what delivery to `addressId` would cost and the new
// total. Saves nothing — setFulfilment re-prices when the buyer commits.
async function deliveryQuote({ transactionId, userId, addressId }) {
    const txn = await loadPayableForBuyer(transactionId, userId);
    const { quote, weightKnown } = await priceDelivery(txn, userId, addressId);
    return {
        ...quote,
        weightKnown,
        productAmount: txn.agreedAmount,
        convenienceFee: txn.buyerFeeAmount || 0,
        totalPayable: totalsWith(txn, quote.charge),
    };
}

// Buyer picks delivery / store pickup (and the address + contact for it)
// on the checkout page. Only while the order is still unpaid — after that
// the seller is already acting on what was chosen. Delivery is priced here
// (never from a client-sent amount) and folded into totalPayable.
async function setFulfilment({ transactionId, userId, body, req }) {
    const txn = await loadPayableForBuyer(transactionId, userId);
    const seller = await userModel.findById(txn.seller).select('sellerType').lean();
    const store = await loadStoreSummary({ _id: txn.seller, sellerType: seller?.sellerType });
    // A store that lists what it offers is held to it; one that lists
    // neither leaves both open (arranged with the store).
    if (store && (store.pickupAvailable || store.deliveryAvailable)) {
        if (body.method === 'DELIVERY' && !store.deliveryAvailable) throw new TransactionError('This store does not deliver — choose store pickup', 400);
        if (body.method === 'PICKUP' && !store.pickupAvailable) throw new TransactionError('This store does not offer pickup — choose delivery', 400);
    }

    let delivery = null;
    if (body.method === 'DELIVERY') delivery = await priceDelivery(txn, userId, body.addressId);
    const deliveryCharge = delivery ? delivery.quote.charge : 0; // store pickup is free
    const newTotal = totalsWith(txn, deliveryCharge);

    // The amount is changing under any open payment order for this order.
    // A payment the buyer may be completing right now → refuse; older,
    // never-started orders are cancelled so a fresh one is made at the new
    // total (payment.service also refuses to apply a capture whose amount
    // doesn't match the order).
    const paymentModel = require('../../model/payment.model');
    const { PAYMENT_STATES } = require('../../constants/payment.constants');
    const open = await paymentModel.find({
        transaction: txn._id, status: { $in: [PAYMENT_STATES.CREATED, PAYMENT_STATES.PENDING, PAYMENT_STATES.PROCESSING] }, is_deleted: deleteConstants.NOT_DELETED,
    }).select('status amountPaise createdAt').lean();
    const stale = open.filter((p) => p.amountPaise !== toPaise(newTotal));
    if (stale.some((p) => p.status !== PAYMENT_STATES.CREATED || Date.now() - new Date(p.createdAt).getTime() < ACTIVE_PAYMENT_GRACE_MS)) {
        throw new TransactionError('A payment for this order is in progress — finish it, or try again in a few minutes', 409);
    }
    if (stale.length) {
        await paymentModel.updateMany(
            { _id: { $in: stale.map((p) => p._id) }, status: PAYMENT_STATES.CREATED },
            { $set: { status: PAYMENT_STATES.CANCELLED, failureReason: 'Order total changed at checkout' }, $push: { history: { action: 'CANCELLED_TOTAL_CHANGED' } } }
        );
    }

    txn.fulfilment = {
        method: body.method,
        addressLabel: delivery ? delivery.address.label : '',
        address: delivery ? delivery.address.address : '',
        contactName: body.contactName,
        contactPhone: body.contactPhone,
        note: body.note || '',
        deliveryLocation: delivery ? delivery.address._id : null,
        latitude: delivery ? delivery.address.latitude : null,
        longitude: delivery ? delivery.address.longitude : null,
        distanceKm: delivery ? delivery.quote.distanceKm : null,
        weightKg: delivery ? delivery.quote.weightKg : null,
        rateSetting: delivery ? delivery.quote.rateSettingId : null,
        updatedAt: new Date(),
    };
    txn.deliveryCharge = deliveryCharge;
    txn.totalPayable = newTotal;
    txn.history.push({
        action: 'FULFILMENT_SET', by: 'buyer',
        note: delivery ? `Delivery chosen — ${delivery.quote.distanceKm} km, ₹${deliveryCharge}` : 'Store pickup chosen',
    });
    await txn.save();
    await createAuditLog({ req, userId, action: auditLogConstants.TRANSACTION_FULFILMENT_SET, entity: 'transactions', entityId: txn._id, metadata: { fulfilment: body.method, deliveryCharge } });
    return { fulfilment: txn.fulfilment, deliveryCharge, totalPayable: newTotal, buyerFeeAmount: txn.buyerFeeAmount || 0 };
}

// Buyer/seller view of a transaction: the escrow state and its timeline,
// without admin identities or internal reconciliation notes.
function toPartyView(txn, payout) {
    const { escrowHistory = [], refund = {}, ...rest } = txn;
    return {
        ...rest,
        escrow: {
            status: txn.escrowStatus,
            label: ESCROW_LABELS[txn.escrowStatus] || txn.escrowStatus,
            commissionPct: txn.platformCommissionPct,
            commissionAmount: txn.platformCommissionAmount,
            sellerSettlementAmount: txn.sellerSettlementAmount,
            sellerType: txn.commissionSellerType,
            releasedAt: txn.releasedAt,
            refund: refund && refund.status !== 'NONE'
                ? { status: refund.status, amount: refund.amount, requestedAt: refund.requestedAt, completedAt: refund.completedAt }
                : null,
            payout: payout ? { status: payout.status, netPayoutAmount: payout.netPayoutAmount, processedAt: payout.processedAt } : null,
            timeline: escrowHistory
                .filter((e) => e.action !== 'BACKFILL')
                .map((e) => ({ from: e.from, to: e.to, label: ESCROW_LABELS[e.to] || e.to, action: e.action, by: e.actorType, at: e.at })),
        },
    };
}

async function myTransactions({ userId, role, status, page = 1, limit = 20 }) {
    const query = { is_deleted: deleteConstants.NOT_DELETED };
    query[role === 'seller' ? 'seller' : 'buyer'] = userId;
    if (status) query.status = status;
    const pageNum = Math.max(1, Number(page) || 1);
    const pageLimit = Math.min(100, Number(limit) || 20);
    // Buyer's own list needs the seller's name (Active Purchases/Transactions
    // UI); seller's own list needs the buyer's name — populate whichever
    // side isn't "me" (never both, and never email/phone to keep this a
    // display-only convenience, not a contact-info leak).
    const counterpartyField = role === 'seller' ? 'buyer' : 'seller';
    const [getData, count] = await Promise.all([
        transactionModel.find(query).populate('listing', 'title images unit location').populate(counterpartyField, 'fullName').sort({ updatedAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
        transactionModel.countDocuments(query),
    ]);
    // Same party view as getOne: escrow status/label, no admin ids or ledger internals.
    const rows = getData.map((t) => toPartyView(t.escrowStatus ? t : { ...t, escrowStatus: escrow.deriveLegacyEscrowStatus(t, null) }, null));
    return { getData: rows, count, page: pageNum, limit: pageLimit };
}

// Reserved inventory that never got paid for within the reservation
// window is released back to available stock. Mirrors offer.service.js's
// expireStaleOffers() — same "not scheduled yet, wired in app.js" pattern.
async function expireStaleReservations() {
    const stale = await transactionModel.find({
        status: TRANSACTION_STATES.PAYMENT_PENDING,
        reservationExpiresAt: { $lt: new Date() },
    }).select('_id');
    let released = 0;
    for (const { _id } of stale) {
        // Skip (retry next sweep) while the buyer is still inside checkout.
        if (await hasRecentActivePayment(_id)) continue;
        const txn = await releaseUnpaidReservation(_id, { action: 'RESERVATION_EXPIRED', by: 'system' });
        if (!txn) continue; // paid/cancelled between the find and now
        released += 1;
        await createAuditLog({ userId: txn.buyer, action: auditLogConstants.RESERVATION_EXPIRED, entity: 'transactions', entityId: txn._id });
        await createAuditLog({ userId: txn.buyer, action: auditLogConstants.INVENTORY_RELEASED, entity: 'material_listings', entityId: txn.listing, metadata: { transactionId: txn._id, quantity: txn.agreedQuantity } });
    }
    return { released };
}

module.exports = {
    TransactionError, calculateCommission, markPaymentConfirmed, markHandover,
    confirmReceipt, settleConfirmedTransaction, toPartyView,
    cancelTransaction, resolveDispute, raiseDispute, getOne, myTransactions, expireStaleReservations, setFulfilment, deliveryQuote,
};