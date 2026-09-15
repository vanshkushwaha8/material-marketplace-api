// Ported from the old wishlist.service.js — same toggle/list shape and
// same reasoning (idempotent $addToSet/$pull, no separate collection for
// a small per-user set with no fields of its own), now pointed at
// material_listings instead of the removed projects collection.
const mongoose = require('mongoose');
const userModel = require('../../model/user.model');
const materialListingModel = require('../../model/materialListing.model');
const deleteConstants = require('../../constants/delete.constants');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');
const { LISTING_STATES } = require('../../constants/materialListing.constants');

class SavedListingError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'SavedListingError';
    this.statusCode = statusCode;
  }
}

async function toggle({ buyerId, listingId, req }) {
  if (!mongoose.Types.ObjectId.isValid(listingId)) {
    throw new SavedListingError('Invalid listing id');
  }
  const listing = await materialListingModel.findOne({ _id: listingId, is_deleted: deleteConstants.NOT_DELETED }).select('_id');
  if (!listing) throw new SavedListingError('Listing not found', 404);

  const buyer = await userModel.findById(buyerId).select('savedListingIds');
  if (!buyer) throw new SavedListingError('User not found', 404);

  const alreadySaved = (buyer.savedListingIds || []).some((id) => String(id) === String(listingId));
  const update = alreadySaved
    ? { $pull: { savedListingIds: listingId } }
    : { $addToSet: { savedListingIds: listingId } };

  await userModel.updateOne({ _id: buyerId }, update);
  await createAuditLog({ req, userId: buyerId, action: auditLogConstants.SAVED_LISTING_TOGGLED, entity: 'material_listings', entityId: listingId });

  return { isSaved: !alreadySaved };
}

async function list({ buyerId, page = 1, limit = 12, search = '' }) {
  const buyer = await userModel.findById(buyerId).select('savedListingIds');
  if (!buyer || !buyer.savedListingIds?.length) return { getData: [], count: 0 };

  const query = {
    _id: { $in: buyer.savedListingIds },
    status: LISTING_STATES.LIVE,
    is_deleted: deleteConstants.NOT_DELETED,
  };
  if (search) {
    const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.title = { $regex: escaped, $options: 'i' };
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 12);

  const [rawData, count] = await Promise.all([
    materialListingModel.find(query).populate('category', 'name slug').sort({ createdAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    materialListingModel.countDocuments(query),
  ]);

  const getData = rawData.map((l) => ({ ...l, isSaved: true }));
  return { getData, count };
}

module.exports = { SavedListingError, toggle, list };
