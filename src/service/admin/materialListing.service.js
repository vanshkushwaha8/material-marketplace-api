const mongoose = require('mongoose');
const materialListingModel = require('../../model/materialListing.model');
const deleteConstants = require('../../constants/delete.constants');
const { LISTING_STATES, VERIFICATION_STATES } = require('../../constants/materialListing.constants');
const { createAuditLogAdmin } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');

class MaterialListingAdminError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'MaterialListingAdminError';
    this.statusCode = statusCode;
  }
}

async function moderationQueue({ page = 1, limit = 20 }) {
  const query = { status: LISTING_STATES.PENDING_VERIFICATION, is_deleted: deleteConstants.NOT_DELETED };
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);
  const [getData, count] = await Promise.all([
    materialListingModel.find(query).populate('category', 'name slug').populate('seller', 'fullName email').sort({ createdAt: 1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    materialListingModel.countDocuments(query),
  ]);
  return { getData, count, page: pageNum, limit: pageLimit };
}
async function getOne({ listingId }) {
  if (!mongoose.Types.ObjectId.isValid(listingId)) throw new MaterialListingAdminError('Invalid listing id', 404);
  const listing = await materialListingModel
    .findOne({ _id: listingId, is_deleted: deleteConstants.NOT_DELETED })
    .populate('category', 'name slug specFields parentCategory')
    .populate('subcategory', 'name slug specFields parentCategory')
    .populate('seller', 'fullName email phoneNumber userType createdAt');
  if (!listing) throw new MaterialListingAdminError('Listing not found', 404);
  return listing;
}
async function listAll({ page = 1, limit = 20, status, verificationStatus }) {
  const query = { is_deleted: deleteConstants.NOT_DELETED };
  if (status) query.status = status;
  if (verificationStatus) query.verificationStatus = verificationStatus;
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);
  const [getData, count] = await Promise.all([
    materialListingModel.find(query).populate('category', 'name slug').populate('seller', 'fullName email').sort({ createdAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    materialListingModel.countDocuments(query),
  ]);
  return { getData, count, page: pageNum, limit: pageLimit };
}

async function decide({ adminId, listingId, decision, note, req }) {
  if (!mongoose.Types.ObjectId.isValid(listingId)) throw new MaterialListingAdminError('Invalid listing id');
  const listing = await materialListingModel.findOne({ _id: listingId, is_deleted: deleteConstants.NOT_DELETED });
  if (!listing) throw new MaterialListingAdminError('Listing not found', 404);
  if (listing.status !== LISTING_STATES.PENDING_VERIFICATION) {
    throw new MaterialListingAdminError(`Listing is not pending verification (currently ${listing.status})`, 409);
  }

  const fromStatus = listing.status;
  if (decision === 'VERIFY') {
    listing.verificationStatus = VERIFICATION_STATES.VERIFIED;
    listing.status = LISTING_STATES.LIVE;
    listing.verificationNote = note || '';
    listing.rejectionReason = '';
  } else {
    listing.verificationStatus = VERIFICATION_STATES.REJECTED;
    listing.status = LISTING_STATES.REJECTED;
    listing.rejectionReason = note || 'Did not meet marketplace verification requirements.';
  }
  listing.stateHistory.push({ fromStatus, toStatus: listing.status, changedBy: adminId, changedByType: 'admin', reason: note || '' });
  await listing.save();

  await createAuditLogAdmin({
    req, adminId,
    action: decision === 'VERIFY' ? auditLogConstants.MATERIAL_LISTING_VERIFIED : auditLogConstants.MATERIAL_LISTING_REJECTED,
    entity: 'material_listings', entityId: listing._id, metadata: { note: note || '' },
  });
  return listing;
}

async function forceStatusChange({ adminId, listingId, status, reason, req }) {
  if (!mongoose.Types.ObjectId.isValid(listingId)) throw new MaterialListingAdminError('Invalid listing id');
  const listing = await materialListingModel.findOne({ _id: listingId, is_deleted: deleteConstants.NOT_DELETED });
  if (!listing) throw new MaterialListingAdminError('Listing not found', 404);

  const fromStatus = listing.status;
  listing.status = status;
  listing.stateHistory.push({ fromStatus, toStatus: status, changedBy: adminId, changedByType: 'admin', reason: reason || '' });
  await listing.save();
  await createAuditLogAdmin({ req, adminId, action: auditLogConstants.MATERIAL_LISTING_STATUS_CHANGED, entity: 'material_listings', entityId: listing._id, metadata: { fromStatus, toStatus: status, reason: reason || '' } });
  return listing;
}



module.exports = { MaterialListingAdminError, getOne, moderationQueue, listAll, decide, forceStatusChange };
