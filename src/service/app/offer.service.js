const mongoose = require('mongoose');
const offerModel = require('../../model/offer.model');
const materialListingModel = require('../../model/materialListing.model');
const deleteConstants = require('../../constants/delete.constants');
const { LISTING_STATES } = require('../../constants/materialListing.constants');
const { OFFER_STATES, OFFER_TERMINAL_STATES, DEFAULT_OFFER_EXPIRY_HOURS } = require('../../constants/offer.constants');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');

class OfferError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'OfferError';
    this.statusCode = statusCode;
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
  if (body.quantity > listing.quantity) throw new OfferError(`Only ${listing.quantity} ${listing.unit} available`, 400);
  if (!listing.negotiable && Number(body.amount) !== Number(listing.price)) {
    throw new OfferError('This listing is not negotiable — offer must match the listed price', 400);
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
    history: [{ action: 'OFFER', by: 'buyer', amount: body.amount, message: body.message || '' }],
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
    offer.history.push({ action: 'CANCEL', by: role, message: message || '' });
  } else if (action === 'REJECT') {
    offer.status = OFFER_STATES.REJECTED;
    offer.history.push({ action: 'REJECT', by: role, message: message || '' });
  } else {
    // ACCEPT / COUNTER both require it be "the other side's turn" — you
    // cannot accept or counter your own most recent action.
    if (offer.lastActionBy === role) {
      throw new OfferError('Waiting on the other party to respond to your last offer', 409);
    }
    if (action === 'ACCEPT') {
      offer.status = OFFER_STATES.ACCEPTED;
      offer.history.push({ action: 'ACCEPT', by: role, amount: offer.currentAmount, message: message || '' });
    } else if (action === 'COUNTER') {
      offer.status = OFFER_STATES.COUNTERED;
      offer.currentAmount = amount;
      offer.lastActionBy = role;
      offer.history.push({ action: 'COUNTER', by: role, amount, message: message || '' });
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
  const [getData, count] = await Promise.all([
    offerModel.find(query).populate('listing', 'title images price unit status').sort({ updatedAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    offerModel.countDocuments(query),
  ]);
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
