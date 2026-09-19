const mongoose = require('mongoose');
const offerModel = require('../../model/offer.model');
const materialListingModel = require('../../model/materialListing.model');
const sellerBankAccountModel = require('../../model/sellerBankAccount.model');
const deleteConstants = require('../../constants/delete.constants');
const { LISTING_STATES } = require('../../constants/materialListing.constants');
const { OFFER_STATES, OFFER_TERMINAL_STATES, DEFAULT_OFFER_EXPIRY_HOURS } = require('../../constants/offer.constants');
const { BANK_ACCOUNT_STATES } = require('../../constants/payout.constants');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');
const transactionModel = require('../../model/transaction.model');
const { TRANSACTION_STATES, RESERVATION_EXPIRY_HOURS } = require('../../constants/transaction.constants')
const { toPaise, fromPaise, unitPriceFromAmount } = require('../../helper/money.helper');
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
  if (!mongoose.Types.ObjectId.isValid(body.listing)) throw new OfferError('Invalid listing id');
  const listing = await materialListingModel.findOne({ _id: body.listing, is_deleted: deleteConstants.NOT_DELETED });
  if (!listing) throw new OfferError('Listing not found', 404);
  if (listing.status !== LISTING_STATES.LIVE) throw new OfferError('This listing is not currently accepting offers', 409);
  if (String(listing.seller) === String(buyerId)) throw new OfferError('You cannot make an offer on your own listing', 403);
  const available = listing.availableQuantity ?? listing.quantity;
  if (body.quantity > available) throw new OfferError(`Only ${available} ${listing.unit} available`, 400);
  // listing.price is always PRICE PER UNIT. For a non-negotiable listing the
  // buyer's total offer amount must equal unitPrice × quantity — comparing
  // amount directly to listing.price (as this used to do) only worked by
  // accident for quantity === 1 and silently under/over-charged everyone else.
  const expectedTotal = fromPaise(Math.round(toPaise(listing.price) * Number(body.quantity)));
  if (!listing.negotiable && fromPaise(toPaise(body.amount)) !== expectedTotal) {
    throw new OfferError(`This listing is not negotiable — offer must be ₹${expectedTotal} (₹${listing.price}/${listing.unit} × ${body.quantity})`, 400);
  }

  const existing = await offerModel.findOne({
    listing: listing._id, buyer: buyerId,
    status: { $nin: OFFER_TERMINAL_STATES },
    is_deleted: deleteConstants.NOT_DELETED,
  });
  if (existing) throw new OfferError('You already have an active offer on this listing', 409);

  const offer = await offerModel.create({
    listing: listing._id,
    buyer: buyerId,
    seller: listing.seller,
    listedPrice: listing.price,
    quantity: body.quantity,
    currentAmount: body.amount,
    lastActionBy: 'buyer',
    status: OFFER_STATES.PENDING,
    history: [{ version: 1, action: 'OFFER', by: 'buyer', actorId: buyerId, amount: body.amount, unitPrice: unitPriceFromAmount(body.amount, body.quantity), message: body.message || '' }],
    expiresAt: new Date(Date.now() + DEFAULT_OFFER_EXPIRY_HOURS * 60 * 60 * 1000),
  });

  await createAuditLog({ req, userId: buyerId, action: auditLogConstants.OFFER_CREATED, entity: 'offers', entityId: offer._id });
  return offer;
}

async function respondToOffer({ userId, offerId, action, amount, message, req }) {
  if (!mongoose.Types.ObjectId.isValid(offerId)) throw new OfferError('Invalid offer id');
  const offer = await offerModel.findOne({ _id: offerId, is_deleted: deleteConstants.NOT_DELETED });
  if (!offer) throw new OfferError('Offer not found', 404);

  const role = roleOf(offer, userId);
  if (!role) throw new OfferError('You are not a party to this offer', 403);
  if (OFFER_TERMINAL_STATES.includes(offer.status)) {
    throw new OfferError(`This offer is already ${offer.status.toLowerCase()}`, 409);
  }

  if (action === 'CANCEL') {
    // Either party can withdraw at any non-terminal point — spec section
    // 18 lists CANCELLED as a distinct terminal state from REJECTED so a
    // withdrawal isn't recorded as if the other side turned it down.
        offer.status = OFFER_STATES.CANCELLED;
    offer.history.push({ version: offer.history.length + 1, action: 'CANCEL', by: role, actorId: userId, message: message || '' });
  } else if (action === 'REJECT') {
    offer.status = OFFER_STATES.REJECTED;
    offer.history.push({ version: offer.history.length + 1, action: 'REJECT', by: role, actorId: userId, message: message || '' });
  } else {
    if (offer.lastActionBy === role) {
      throw new OfferError('Waiting on the other party to respond to your last offer', 409);
    }
    if (action === 'ACCEPT') {
      await assertSellerPayoutReady(offer.seller);
      const listing = await reserveInventoryForAccept(offer, req);
      offer.status = OFFER_STATES.ACCEPTED;
      offer.history.push({ version: offer.history.length + 1, action: 'ACCEPT', by: role, actorId: userId, amount: offer.currentAmount, unitPrice: unitPriceFromAmount(offer.currentAmount, offer.quantity), message: message || '' });
      await offer.save();
      await createTransactionForAccept(offer, listing, req);
      await createAuditLog({ req, userId, action: auditLogConstants.OFFER_ACCEPTED, entity: 'offers', entityId: offer._id });
      return offer;
    } else if (action === 'COUNTER') {
      offer.status = OFFER_STATES.COUNTERED;
      offer.currentAmount = amount;
      offer.lastActionBy = role;
      offer.history.push({ version: offer.history.length + 1, action: 'COUNTER', by: role, actorId: userId, amount, unitPrice: unitPriceFromAmount(amount, offer.quantity), message: message || '' });
    } else {
      throw new OfferError('Unknown action');
    }
  }

  await offer.save();
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
  const bankAccount = await sellerBankAccountModel.findOne({ seller: sellerId, is_deleted: deleteConstants.NOT_DELETED });
  if (!bankAccount || bankAccount.verificationStatus !== BANK_ACCOUNT_STATES.VERIFIED) {
    throw new OfferError(
      'Complete payout setup before accepting this offer.',
      409,
      'SELLER_PAYOUT_SETUP_REQUIRED'
    );
  }
}

// Atomic single-document update — no reservation is possible unless
// enough availableQuantity exists at the instant of the update, which is
// what prevents two buyers from both reserving the same units.
async function reserveInventoryForAccept(offer, req) {
  const listing = await materialListingModel.findOneAndUpdate(
    { _id: offer.listing, availableQuantity: { $gte: offer.quantity }, is_deleted: deleteConstants.NOT_DELETED },
    { $inc: { availableQuantity: -offer.quantity, reservedQuantity: offer.quantity } },
    { new: true }
  );
  if (!listing) {
    throw new OfferError('Not enough inventory remaining to accept this offer', 409);
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
async function createTransactionForAccept(offer, listing, req) {
  try {
    const transaction = await transactionModel.create({
      listing: listing._id,
      offer: offer._id,
      buyer: offer.buyer,
      seller: offer.seller,
      agreedQuantity: offer.quantity,
      agreedAmount: offer.currentAmount,
      unitPrice: unitPriceFromAmount(offer.currentAmount, offer.quantity),
      status: TRANSACTION_STATES.PAYMENT_PENDING,
      reservationExpiresAt: new Date(Date.now() + RESERVATION_EXPIRY_HOURS * 60 * 60 * 1000),
      history: [{ action: 'CREATED', by: 'system', note: 'Created on offer acceptance' }],
    });
    await createAuditLog({ req, userId: offer.seller, action: auditLogConstants.TRANSACTION_CREATED, entity: 'transactions', entityId: transaction._id });
    return transaction;
  } catch (err) {
    await materialListingModel.updateOne(
      { _id: listing._id },
      { $inc: { availableQuantity: offer.quantity, reservedQuantity: -offer.quantity }, ...(listing.status === LISTING_STATES.SOLD_OUT ? { status: LISTING_STATES.LIVE } : {}) }
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

async function myOffers({ userId, role, status, page = 1, limit = 20 }) {
  const query = { is_deleted: deleteConstants.NOT_DELETED };
  query[role === 'seller' ? 'seller' : 'buyer'] = userId;
  if (status) query.status = status;
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);
    const [rows, count] = await Promise.all([
    offerModel.find(query).populate('listing', 'title images price unit status').sort({ updatedAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    offerModel.countDocuments(query),
  ]);
  const acceptedIds = rows.filter((o) => o.status === OFFER_STATES.ACCEPTED).map((o) => o._id);
    const transactions = acceptedIds.length
    ? await transactionModel.find({ offer: { $in: acceptedIds } }).select('offer status agreedQuantity agreedAmount unitPrice currency').lean()
    : [];
  const txByOfferId = new Map(transactions.map((t) => [String(t.offer), t]));
  const getData = rows.map((o) => ({ ...o, transaction: txByOfferId.get(String(o._id)) || null }));
  return { getData, count, page: pageNum, limit: pageLimit };
}

/**
 * Not scheduled by any cron yet — exported so Phase 3 (transactions) can
 * wire it into a sweep the same way tempUploadCleanup/reconMatch are
 * scheduled in app.js, once an accepted offer needs to hand off into a
 * transaction on expiry-adjacent logic.
 */
async function expireStaleOffers() {
  const result = await offerModel.updateMany(
    { status: { $in: [OFFER_STATES.PENDING, OFFER_STATES.COUNTERED] }, expiresAt: { $lt: new Date() } },
    { $set: { status: OFFER_STATES.EXPIRED }, $push: { history: { action: 'EXPIRE', by: 'system', at: new Date() } } }
  );
  return { matched: result.matchedCount ?? result.n, modified: result.modifiedCount ?? result.nModified };
}

module.exports = { OfferError, createOffer, respondToOffer, getOne, myOffers, expireStaleOffers };
