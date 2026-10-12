const mongoose = require('mongoose');
const transactionModel = require('../../model/transaction.model');
const materialListingModel = require('../../model/materialListing.model');
const deleteConstants = require('../../constants/delete.constants');
const { LISTING_STATES } = require('../../constants/materialListing.constants');
const { TRANSACTION_STATES, TRANSACTION_TERMINAL_STATES, SETTLEMENT_STATES, COMMISSION_STATES } = require('../../constants/transaction.constants');
const { createAuditLog, createAuditLogAdmin } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');
const configenv = require('../../config/env.config');
const { toPaise, fromPaise, calculateCommissionPaise, payableAmount, commissionTaxPaise } = require('../../helper/money.helper');
const { orderRef } = require('../../helper/orderRef.helper');
const path = require('path');
const fs = require('fs');
const payoutService = require('./payout.service');
const notificationService = require('./notification.service');
const { NOTIFICATION_TYPES } = require('../../constants/notification.constants');
const { notifyAdmins } = require('../admin/adminNotification.service');
const escrow = require('./escrow.service');
const commissionService = require('./commission.service');
const userModel = require('../../model/user.model');
const { ESCROW_STATES, ESCROW_ACTORS, ESCROW_LABELS } = require('../../constants/escrow.constants');
const deliveryQuoteService = require('./deliveryQuote.service');
const deliveryRequirementService = require('./deliveryRequirement.service');
const vehicleTypeService = require('./vehicleType.service');
const { haversineKm } = require('./deliveryRate.service');
const { DELIVERY_QUOTE_STATES } = require('../../constants/delivery.constants');
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
    // GST inside the commission — only when the deployment has configured
    // the rate; otherwise null ("not recorded"), never an assumed 18%.
    const taxPaise = commissionTaxPaise(commissionAmountPaise, configenv.COMMISSION_GST_PCT, configenv.COMMISSION_GST_INCLUSIVE);
    return {
        pct, settingId, sellerType: appliedType, commission: fromPaise(commissionAmountPaise), settlement: fromPaise(sellerSettlementPaise),
        taxPct: taxPaise == null ? null : Number(configenv.COMMISSION_GST_PCT),
        taxAmount: taxPaise == null ? null : fromPaise(taxPaise),
        taxInclusive: taxPaise == null ? null : configenv.COMMISSION_GST_INCLUSIVE,
    };
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
                commissionTaxPct: c.taxPct,
                commissionTaxAmount: c.taxAmount,
                commissionTaxInclusive: c.taxInclusive,
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

// Handover evidence (challan / delivery photos) is uploaded through the
// generic temp-upload endpoint, then moved here. This folder is NOT one of
// app.js's public /images paths: files are only served to the order's
// buyer and seller by getHandoverEvidence() below.
const HANDOVER_EVIDENCE_FOLDER = 'handoverEvidence';
const HANDOVER_EVIDENCE_DIR = path.join(__dirname, '../../../public', HANDOVER_EVIDENCE_FOLDER);
const HANDOVER_ELIGIBLE_STATES = [TRANSACTION_STATES.PAYMENT_CONFIRMED, TRANSACTION_STATES.READY_FOR_HANDOVER];
const CLOCK_SKEW_MS = 5 * 60 * 1000;

const evidenceUrl = (transactionId, storageKey) => `/v1/transactions/${transactionId}/handover-evidence/${encodeURIComponent(storageKey)}`;

async function finalizeHandoverEvidence(transactionId, files = []) {
    const helper = require('../../helper/helper');
    const out = [];
    for (const name of files) {
        await helper.moveFileFromFolder(name, HANDOVER_EVIDENCE_FOLDER);
        try {
            await fs.promises.access(path.join(HANDOVER_EVIDENCE_DIR, name));
        } catch {
            throw new TransactionError('An uploaded file has expired or is missing — upload it again', 400);
        }
        out.push({ url: evidenceUrl(transactionId, name), storageKey: name, mimeType: path.extname(name).replace('.', '') });
    }
    return out;
}

// What the signed-in party may do next — computed here so the buyer and
// seller UIs show buttons from the backend's current state, never from a
// stale list row. The services below re-check every rule on submit.
function partyActions(txn, role) {
    const open = !txn.disputed && txn.status !== TRANSACTION_STATES.DISPUTED;
    const issueOpen = open
        && [...HANDOVER_ELIGIBLE_STATES, TRANSACTION_STATES.HANDOVER_STARTED].includes(txn.status)
        && [ESCROW_STATES.PAID, ESCROW_STATES.HELD, ESCROW_STATES.DELIVERED].includes(txn.escrowStatus);
    return {
        canHandover: role === 'seller' && open && HANDOVER_ELIGIBLE_STATES.includes(txn.status) && txn.escrowStatus === ESCROW_STATES.HELD,
        canConfirmReceipt: role === 'buyer' && open && txn.status === TRANSACTION_STATES.HANDOVER_STARTED && txn.escrowStatus === ESCROW_STATES.DELIVERED,
        canReportIssue: Boolean(role) && issueOpen,
    };
}

const fromEscrowError = (err) => (err instanceof escrow.EscrowTransitionError ? new TransactionError(err.message, err.statusCode || 409) : err);

// Seller declares the material handed over: HELD → DELIVERED. The payment
// stays protected — delivery alone never releases money; the buyer's
// confirmation does. `details` was validated by transaction.validation
// #handover; the rules that need the order are checked here.
async function markHandover({ transactionId, userId, note, details = {}, evidenceFiles = [], req }) {
    const { txn, role } = await getOwned(transactionId, userId);
    if (role !== 'seller') throw new TransactionError('Only the seller can mark this order as handed over', 403);
    // Second click / retried request: already recorded once — no new
    // details, no second notification.
    if (txn.status === TRANSACTION_STATES.HANDOVER_STARTED) return { txn, alreadyRecorded: true };
    if (txn.disputed || txn.status === TRANSACTION_STATES.DISPUTED) throw new TransactionError('This order is under dispute — handover is on hold until our team resolves it', 409);
    if (!HANDOVER_ELIGIBLE_STATES.includes(txn.status)) {
        throw new TransactionError(txn.status === TRANSACTION_STATES.PAYMENT_PENDING
            ? 'The buyer has not paid for this order yet — hand over only after payment is confirmed'
            : `This order is ${txn.status.toLowerCase().replace(/_/g, ' ')} and can no longer be handed over`, 409);
    }

    const handedOverAt = new Date(details.handedOverAt);
    if (Number.isNaN(handedOverAt.getTime())) throw new TransactionError('Enter the handover date and time', 400);
    if (handedOverAt.getTime() > Date.now() + CLOCK_SKEW_MS) throw new TransactionError('Handover time cannot be in the future — mark it only after the material has been handed over', 400);
    if (txn.paymentConfirmedAt && handedOverAt.getTime() < new Date(txn.paymentConfirmedAt).getTime() - CLOCK_SKEW_MS) {
        throw new TransactionError('Handover time cannot be before the payment was confirmed', 400);
    }
    const quantity = Number(details.quantity);
    if (!(quantity > 0)) throw new TransactionError('Enter the quantity handed over', 400);
    if (quantity > Number(txn.agreedQuantity)) throw new TransactionError(`Quantity handed over cannot exceed the ordered ${txn.agreedQuantity}`, 400);

    const evidence = await finalizeHandoverEvidence(txn._id, evidenceFiles);
    const now = new Date();
    const set = {
        status: TRANSACTION_STATES.HANDOVER_STARTED,
        handoverStartedAt: now,
        handoverDetails: {
            handedOverAt,
            quantity,
            packageCount: details.packageCount ?? null,
            transporterName: details.transporterName || '',
            vehicleNumber: details.vehicleNumber || '',
            challanNumber: details.challanNumber || '',
            declaredBy: userId,
            recordedAt: now,
        },
    };
    if (note) set.handoverNote = note;
    if (evidence.length) set.handoverEvidence = evidence;

    let result;
    try {
        result = await escrow.transition({
            transactionId: txn._id, action: 'MARK_DELIVERED', actor: { type: ESCROW_ACTORS.SELLER, id: userId },
            reason: note || '', set, where: { status: { $in: HANDOVER_ELIGIBLE_STATES }, disputed: { $ne: true } },
            push: { history: { action: 'HANDOVER_STARTED', by: 'seller', note: `${quantity} handed over${details.challanNumber ? ` · challan ${details.challanNumber}` : ''}` } }, req,
        });
    } catch (err) {
        throw fromEscrowError(err);
    }
    const updated = await transactionModel.findById(txn._id);
    if (!result.applied) return { txn: updated, alreadyRecorded: true };

    await createAuditLog({
        req, userId, action: auditLogConstants.HANDOVER_STARTED, entity: 'transactions', entityId: updated._id,
        metadata: { evidenceCount: updated.handoverEvidence.length, quantity, packageCount: details.packageCount ?? null, handedOverAt },
    });
    await updated.populate('listing', 'title unit');
    const title = updated.listing?.title || 'the material';
    await notificationService.createNotification({
        recipientId: updated.buyer, actorId: userId, type: NOTIFICATION_TYPES.HANDOVER_STARTED,
        title: `Order ${orderRef(updated._id)} handed over`,
        message: `The seller has marked your order ${orderRef(updated._id)} (${quantity} ${updated.listing?.unit || ''} of ${title}) as handed over. Please inspect the material and confirm receipt or report an issue. Your payment stays held until you do.`.replace(/\s+/g, ' '),
        entityType: 'transaction', entityId: updated._id, entityName: updated.listing?.title || null,
        dedupeKey: `HANDOVER_STARTED:${updated._id}`,
    });
    return { txn: updated, alreadyRecorded: false };
}

// Authorised download of one handover evidence file (buyer or seller of
// the order only). Returns an absolute path inside HANDOVER_EVIDENCE_DIR.
async function getHandoverEvidence({ transactionId, userId, storageKey }) {
    const { txn } = await getOwned(transactionId, userId);
    const item = (txn.handoverEvidence || []).find((e) => e.storageKey === storageKey);
    if (!item) throw new TransactionError('File not found', 404);
    const abs = path.join(HANDOVER_EVIDENCE_DIR, path.basename(item.storageKey));
    try { await fs.promises.access(abs); } catch { throw new TransactionError('File not found', 404); }
    return abs;
}

const RECEIPT_CHECKLIST = ['materialMatches', 'quantityMatches', 'noVisibleDamage', 'documentsChecked'];

// Buyer's explicit confirmation: DELIVERED → BUYER_CONFIRMED, then
// settlement. Requires the acknowledgement + every checklist item — a buyer
// who can't tick one should report an issue instead. Idempotent: a second
// confirmation returns the order without starting another payout.
async function confirmReceipt({ transactionId, userId, acknowledged, checklist = {}, req }) {
    const { txn, role } = await getOwned(transactionId, userId);
    if (role !== 'buyer') throw new TransactionError('Only the buyer can confirm receipt', 403);
    if (txn.status === TRANSACTION_STATES.COMPLETED) return { txn, alreadyConfirmed: true };
    if (txn.disputed || txn.status === TRANSACTION_STATES.DISPUTED) throw new TransactionError('This order is under dispute — our team will resolve it; receipt can no longer be confirmed here', 409);
    if (HANDOVER_ELIGIBLE_STATES.includes(txn.status)) throw new TransactionError('The seller has not marked this order as handed over yet — you can confirm receipt after handover', 409);
    if (txn.status !== TRANSACTION_STATES.HANDOVER_STARTED) throw new TransactionError(`Cannot confirm receipt while the order is ${txn.status.toLowerCase().replace(/_/g, ' ')}`, 409);
    if (acknowledged !== true || !RECEIPT_CHECKLIST.every((k) => checklist[k] === true)) {
        throw new TransactionError('Tick every check and the acknowledgement to confirm receipt — or report an issue instead', 400);
    }

    const now = new Date();
    let result;
    try {
        result = await escrow.transition({
            transactionId: txn._id, action: 'BUYER_CONFIRM', actor: { type: ESCROW_ACTORS.BUYER, id: userId },
            where: { status: TRANSACTION_STATES.HANDOVER_STARTED, disputed: { $ne: true } },
            set: {
                status: TRANSACTION_STATES.COMPLETED, buyerConfirmedAt: now, completedAt: now, settlementStatus: SETTLEMENT_STATES.PENDING,
                receiptConfirmation: { checklist: Object.fromEntries(RECEIPT_CHECKLIST.map((k) => [k, true])), acknowledgedAt: now, confirmedBy: userId },
            },
            push: { history: { $each: [{ action: 'BUYER_CONFIRMED', by: 'buyer' }, { action: 'COMPLETED', by: 'system' }] } },
            req,
        });
    } catch (err) {
        throw fromEscrowError(err);
    }
    const updated = await transactionModel.findById(txn._id);
    if (!result.applied) return { txn: updated, alreadyConfirmed: true };

    await createAuditLog({ req, userId, action: auditLogConstants.TRANSACTION_COMPLETED, entity: 'transactions', entityId: updated._id, metadata: { commission: updated.platformCommissionAmount, settlement: updated.sellerSettlementAmount, checklist: RECEIPT_CHECKLIST } });
    await updated.populate('listing', 'title unit');
    await notificationService.createNotification({
        recipientId: updated.seller, actorId: userId, type: NOTIFICATION_TYPES.RECEIPT_CONFIRMED,
        title: `Order ${orderRef(updated._id)} received`,
        message: `The buyer has confirmed receipt of order ${orderRef(updated._id)} (${updated.listing?.title || 'material'}). Settlement of your payment has started.`,
        entityType: 'transaction', entityId: updated._id, entityName: updated.listing?.title || null,
        dedupeKey: `RECEIPT_CONFIRMED:${updated._id}`,
    });

    if (updated.project) {
        const projectService = require('./project.service');
        await projectService.markMaterialSourced({ projectId: updated.project, buyerId: updated.buyer, count: 1 }).catch(() => { });
    }

    // The confirmation is recorded whatever happens next. A settlement
    // error (DB blip, provider outage) must not tell the buyer their
    // confirmation failed — the order stays in the settlement pipeline,
    // admins are alerted and resumeStalledSettlements() picks it up.
    let payout = null;
    try {
        payout = await settleConfirmedTransaction({ transactionId: updated._id, actor: { type: ESCROW_ACTORS.SYSTEM }, req });
    } catch (err) {
        console.error('[settlement] after buyer confirmation failed:', err.message);
        await notifyAdmins('ESCROW_ACTION_REQUIRED', {
            title: 'Settlement did not start after buyer confirmation',
            message: `Order ${orderRef(updated._id)}: ${String(err.message || err).slice(0, 200)} — it will be retried automatically; check Payments → Needs attention.`,
            entityType: 'transaction', entityId: updated._id,
            dedupeKey: `SETTLEMENT_START_FAILED:${updated._id}`,
        }).catch(() => { });
    }
    await notifySettlementStatus(updated, payout);
    return { txn: await transactionModel.findById(updated._id), alreadyConfirmed: false };
}

// Tells both parties where the seller's settlement actually stands right
// after confirmation. PAID / PAYOUT_FAILED are announced by payout.service
// (markPayoutPaid / markPayoutFailed) — not repeated here.
async function notifySettlementStatus(txn, payout) {
    const { PAYOUT_STATES } = require('../../constants/payout.constants');
    const status = payout?.status || PAYOUT_STATES.PENDING;
    if ([PAYOUT_STATES.PAID, PAYOUT_STATES.PAYOUT_FAILED].includes(status)) return;
    const ref = orderRef(txn._id);
    const amount = payout?.netPayoutAmount ?? txn.sellerSettlementAmount;
    const amountText = amount != null ? `₹${Number(amount).toLocaleString('en-IN')}` : '';
    const label = status === PAYOUT_STATES.PROCESSING ? 'processing' : 'pending';
    const sellerLabel = status === PAYOUT_STATES.PAYOUT_ELIGIBLE ? 'on hold until your payout bank account is verified' : label;
    await notificationService.createNotification({
        recipientId: txn.buyer, type: NOTIFICATION_TYPES.SETTLEMENT_UPDATE,
        title: `Order ${ref} confirmed`,
        message: `Your order ${ref} has been confirmed. Seller payment settlement is ${label}.`,
        entityType: 'transaction', entityId: txn._id, dedupeKey: `SETTLEMENT_UPDATE:buyer:${txn._id}`,
    });
    await notificationService.createNotification({
        recipientId: txn.seller, type: NOTIFICATION_TYPES.SETTLEMENT_UPDATE,
        title: `Settlement ${sellerLabel === label ? label : 'on hold'} — order ${ref}`,
        message: `Settlement for order ${ref} is ${sellerLabel}.${amountText ? ` Amount: ${amountText}.` : ''}`,
        entityType: status === PAYOUT_STATES.PAYOUT_ELIGIBLE && payout?._id ? 'payout' : 'transaction',
        entityId: status === PAYOUT_STATES.PAYOUT_ELIGIBLE && payout?._id ? payout._id : txn._id,
        dedupeKey: `SETTLEMENT_UPDATE:seller:${txn._id}`,
    });
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
    let result;
    try {
        result = await escrow.transition({
            transactionId: txn._id, action: 'RAISE_DISPUTE', actor: { type: role === 'buyer' ? ESCROW_ACTORS.BUYER : ESCROW_ACTORS.SELLER, id: userId },
            reason,
            set: { status: TRANSACTION_STATES.DISPUTED, disputed: true, disputeReason: reason, settlementStatus: SETTLEMENT_STATES.ON_HOLD },
            push: { history: { action: 'DISPUTED', by: role, note: reason } }, req,
        });
    } catch (err) {
        // e.g. the buyer confirmed receipt a moment earlier (payment released).
        throw fromEscrowError(err);
    }
    const updated = await transactionModel.findById(txn._id);
    if (!result.applied) return updated;

    await createAuditLog({ req, userId, action: auditLogConstants.TRANSACTION_DISPUTED, entity: 'transactions', entityId: updated._id });
    await notifyAdmins('TRANSACTION_DISPUTED', {
        title: `Dispute raised by the ${role} — order ${orderRef(updated._id)}`,
        message: `₹${Number(updated.agreedAmount).toLocaleString('en-IN')} transaction (${updated.agreedQuantity} units) is on hold: "${String(reason || '').slice(0, 200)}"`,
        entityType: 'transaction', entityId: updated._id, userId,
        metadata: { raisedBy: role },
    });
    const otherParty = role === 'buyer' ? updated.seller : updated.buyer;
    await notificationService.createNotification({
        recipientId: otherParty, actorId: userId, type: NOTIFICATION_TYPES.TRANSACTION_DISPUTED,
        title: `Issue reported on order ${orderRef(updated._id)}`,
        message: `The ${role} reported an issue with order ${orderRef(updated._id)}: ${String(reason || '').slice(0, 300)}. The payment stays on hold while our team reviews it.`,
        entityType: 'transaction', entityId: updated._id,
        dedupeKey: `TRANSACTION_DISPUTED:${updated._id}`,
    });
    return updated;
}

async function getOne({ transactionId, userId }) {
    const { txn, role } = await getOwned(transactionId, userId);
    await escrow.loadWithEscrow(txn._id); // backfills legacy rows once
    const fresh = await transactionModel.findById(txn._id);
    await fresh.populate('listing', 'title images unit');
    await fresh.populate('buyer', 'fullName');
    await fresh.populate('seller', 'fullName sellerType');
    const payout = await require('../../model/payout.model').findOne({ transaction: fresh._id }).select('status netPayoutAmount processedAt failureReason').lean();
    const view = toPartyView(fresh.toObject(), payout);
    view.actions = partyActions(fresh, role);
    view.viewerRole = role;
    // Seller-quoted delivery: status, vehicles, quote and what this party can do.
    view.delivery = deliveryQuoteService.view(fresh.toObject(), role);
    const store = await loadStoreSummary(fresh.seller);
    if (store) view.store = store;
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

// The buyer's saved address, its map point (optional) and how far it is
// from where the seller dispatches. Distance is straight-line and only
// informs the seller's quote — it never prices anything by itself.
async function loadDeliveryAddress(txn, buyerId, addressId) {
    if (!mongoose.Types.ObjectId.isValid(addressId)) throw new TransactionError('Choose a delivery address', 400);
    const deliveryLocationModel = require('../../model/deliveryLocation.model');
    const address = await deliveryLocationModel.findOne({ _id: addressId, buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED }).lean();
    if (!address) throw new TransactionError('Delivery address not found', 404);
    const listing = await materialListingModel.findById(txn.listing).select('location.geo').lean();
    const from = await sellerOriginPoint(txn.seller, listing);
    const to = address.latitude != null && address.longitude != null ? [address.longitude, address.latitude] : null;
    const distanceKm = from && to ? Math.round(haversineKm(from, to) * 10) / 10 : null;
    return { address, distanceKm };
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

// Checkout preview: the order's weight, the vehicle the platform suggests,
// the vehicles the buyer can ask for, and (with addressId) the distance.
// Saves nothing.
async function deliveryRequirement({ transactionId, userId, addressId }) {
    const txn = await loadPayableForBuyer(transactionId, userId);
    const requirement = await deliveryRequirementService.forTransaction(txn);
    const distanceKm = addressId ? (await loadDeliveryAddress(txn, userId, addressId)).distanceKm : null;
    return {
        totalWeightKg: requirement.totalWeightKg,
        weightKnown: requirement.weightKnown,
        recommendedVehicle: requirement.recommendedVehicle,
        multipleTrips: requirement.multipleTrips,
        vehicles: requirement.vehicles.map((v) => ({ code: v.code, name: v.name, maxPayloadKg: v.maxPayloadKg ?? null, description: v.description || '' })),
        distanceKm,
    };
}

// Payment orders opened for this order that no longer match what it costs
// (or, when delivery is now awaiting a quote, any open one). A payment the
// buyer may be completing right now → refuse; older never-started orders
// are cancelled so nothing can be captured at a stale amount (a capture on
// a cancelled order is flagged for reconciliation by payment.service).
async function closeStalePaymentOrders(txn, keepTotal) {
    const paymentModel = require('../../model/payment.model');
    const { PAYMENT_STATES } = require('../../constants/payment.constants');
    const open = await paymentModel.find({
        transaction: txn._id, status: { $in: [PAYMENT_STATES.CREATED, PAYMENT_STATES.PENDING, PAYMENT_STATES.PROCESSING] }, is_deleted: deleteConstants.NOT_DELETED,
    }).select('status amountPaise createdAt').lean();
    const stale = open.filter((p) => keepTotal == null || p.amountPaise !== toPaise(keepTotal));
    if (stale.some((p) => p.status !== PAYMENT_STATES.CREATED || Date.now() - new Date(p.createdAt).getTime() < ACTIVE_PAYMENT_GRACE_MS)) {
        throw new TransactionError('A payment for this order is in progress — finish it, or try again in a few minutes', 409);
    }
    if (stale.length) {
        await paymentModel.updateMany(
            { _id: { $in: stale.map((p) => p._id) }, status: PAYMENT_STATES.CREATED },
            { $set: { status: PAYMENT_STATES.CANCELLED, failureReason: 'Order delivery details changed at checkout' }, $push: { history: { action: 'CANCELLED_TOTAL_CHANGED' } } }
        );
    }
}

const toTxnError = (err) => {
    if (!(err instanceof deliveryQuoteService.DeliveryQuoteError)) return err;
    const e = new TransactionError(err.message, err.statusCode);
    e.code = err.code;
    return e;
};

// Buyer picks delivery or pickup (and the address + contact for it) on the
// checkout page, only while the order is unpaid and delivery isn't agreed
// yet. PICKUP is payable at once. DELIVERY asks the seller for a quote
// (deliveryQuote.service) — nothing is charged for it until the buyer
// accepts that quote.
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
    const contact = { contactName: body.contactName, contactPhone: body.contactPhone, note: body.note || '' };
    const now = new Date();

    try {
        if (body.method === 'PICKUP') {
            await closeStalePaymentOrders(txn, deliveryQuoteService.totalWith(txn, 0));
            const fulfilment = { method: 'PICKUP', addressLabel: '', address: '', ...contact, updatedAt: now };
            const updated = await deliveryQuoteService.switchToPickup({ transactionId: txn._id, buyerId: userId, fulfilment, req });
            return fulfilmentResult(updated);
        }

        const [{ address, distanceKm }, requirement] = await Promise.all([
            loadDeliveryAddress(txn, userId, body.addressId),
            deliveryRequirementService.forTransaction(txn),
        ]);
        let requestedVehicle = null;
        if (body.vehicleCode) {
            const v = requirement.vehicles.find((x) => x.code === String(body.vehicleCode).toUpperCase());
            if (!v) throw new TransactionError('Choose a vehicle from the list', 400);
            requestedVehicle = vehicleTypeService.snapshot(v);
        }
        // Delivery isn't payable until quoted + accepted: no open payment
        // order may survive this change.
        await closeStalePaymentOrders(txn, null);
        const fulfilment = {
            method: 'DELIVERY',
            addressLabel: address.label,
            address: address.address,
            ...contact,
            deliveryLocation: address._id,
            latitude: address.latitude ?? null,
            longitude: address.longitude ?? null,
            distanceKm,
            weightKg: requirement.totalWeightKg,
            rateSetting: null,
            updatedAt: now,
        };
        const updated = await deliveryQuoteService.request({ transactionId: txn._id, buyerId: userId, fulfilment, requirement, requestedVehicle, req });
        return fulfilmentResult(updated);
    } catch (err) {
        throw toTxnError(err);
    }
}

function fulfilmentResult(txn) {
    return {
        fulfilment: txn.fulfilment,
        deliveryCharge: txn.deliveryCharge || 0,
        totalPayable: txn.totalPayable,
        buyerFeeAmount: txn.buyerFeeAmount || 0,
        delivery: deliveryQuoteService.view(txn, 'buyer'),
    };
}

// Buyer accepts / rejects the seller's quote; seller quotes / declines.
// The route's permission picks the side; the service re-checks ownership.
async function respondToDeliveryQuote({ transactionId, userId, body, req }) {
    try {
        let txn;
        switch (body.action) {
            case 'ACCEPT': txn = await deliveryQuoteService.accept({ transactionId, buyerId: userId, version: body.version, req }); break;
            case 'REJECT': txn = await deliveryQuoteService.reject({ transactionId, buyerId: userId, version: body.version, reason: body.reason || '', req }); break;
            case 'QUOTE': txn = await deliveryQuoteService.quote({ transactionId, sellerId: userId, vehicleCode: body.vehicleCode, charge: body.charge, vehicleChangeReason: body.vehicleChangeReason, sellerNote: body.sellerNote, req }); break;
            case 'DECLINE': txn = await deliveryQuoteService.decline({ transactionId, sellerId: userId, reason: body.reason, req }); break;
            default: throw new TransactionError('Unknown delivery action', 400);
        }
        return getOne({ transactionId: txn._id, userId });
    } catch (err) {
        throw toTxnError(err);
    }
}

// Buyer/seller view of a transaction: the escrow state and its timeline,
// without admin identities or internal reconciliation notes.
function toPartyView(txn, payout) {
    const { escrowHistory = [], refund = {}, ...rest } = txn;
    return {
        ...rest,
        orderRef: orderRef(txn._id),
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

async function myTransactions({ userId, role, status, deliveryStatus, page = 1, limit = 20 }) {
    const query = { is_deleted: deleteConstants.NOT_DELETED };
    query[role === 'seller' ? 'seller' : 'buyer'] = userId;
    if (status) query.status = status;
    // e.g. the seller's "needs a delivery quote" queue.
    if (deliveryStatus && Object.values(DELIVERY_QUOTE_STATES).includes(deliveryStatus)) {
        query['delivery.status'] = deliveryStatus;
        query.status = TRANSACTION_STATES.PAYMENT_PENDING;
    }
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
    const rows = getData.map((t) => {
        const withEscrow = t.escrowStatus ? t : { ...t, escrowStatus: escrow.deriveLegacyEscrowStatus(t, null) };
        return {
            ...toPartyView(withEscrow, null),
            actions: partyActions(withEscrow, role === 'seller' ? 'seller' : 'buyer'),
            delivery: deliveryQuoteService.view(t, role),
        };
    });
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
        // Seller never quoted / buyer never accepted: say so to both sides.
        await deliveryQuoteService.markExpired(txn).catch(() => { });
        await createAuditLog({ userId: txn.buyer, action: auditLogConstants.RESERVATION_EXPIRED, entity: 'transactions', entityId: txn._id });
        await createAuditLog({ userId: txn.buyer, action: auditLogConstants.INVENTORY_RELEASED, entity: 'material_listings', entityId: txn.listing, metadata: { transactionId: txn._id, quantity: txn.agreedQuantity } });
    }
    return { released };
}

// Orders whose buyer confirmed but whose settlement never got past
// commission / queueing (process crash, DB error mid-way — see
// confirmReceipt). Re-runs the same idempotent pipeline; orders already
// waiting on a payout record (bank details, provider) are left alone.
const STALLED_SETTLEMENT_AFTER_MS = 5 * 60 * 1000;
async function resumeStalledSettlements() {
    const payoutModel = require('../../model/payout.model');
    const cutoff = new Date(Date.now() - STALLED_SETTLEMENT_AFTER_MS);
    const candidates = await transactionModel.find({
        escrowStatus: { $in: [ESCROW_STATES.BUYER_CONFIRMED, ESCROW_STATES.COMMISSION_DEDUCTED, ESCROW_STATES.RELEASE_PENDING] },
        updatedAt: { $lt: cutoff }, is_deleted: deleteConstants.NOT_DELETED,
    }).select('_id escrowStatus').limit(50).lean();
    let resumed = 0;
    for (const t of candidates) {
        if (t.escrowStatus === ESCROW_STATES.RELEASE_PENDING && await payoutModel.exists({ transaction: t._id })) continue;
        try {
            await settleConfirmedTransaction({ transactionId: t._id, actor: { type: ESCROW_ACTORS.SYSTEM }, reason: 'Resumed stalled settlement' });
            resumed += 1;
        } catch (err) {
            console.error('[settlement] resume failed for', String(t._id), err.message);
        }
    }
    return { resumed };
}

module.exports = {
    TransactionError, calculateCommission, markPaymentConfirmed, markHandover, getHandoverEvidence, partyActions,
    confirmReceipt, settleConfirmedTransaction, toPartyView, resumeStalledSettlements, notifySettlementStatus,
    cancelTransaction, resolveDispute, raiseDispute, getOne, myTransactions, expireStaleReservations, setFulfilment,
    deliveryRequirement, respondToDeliveryQuote,
};