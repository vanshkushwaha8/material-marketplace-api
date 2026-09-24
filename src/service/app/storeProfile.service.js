const mongoose = require('mongoose');
const storeProfileModel = require('../../model/storeProfile.model');
const userModel = require('../../model/user.model');
const businessTypeModel = require('../../model/businessType.model');
const storeCategoryModel = require('../../model/storeCategory.model');
const materialCategoryModel = require('../../model/materialCategory.model');
const deleteConstants = require('../../constants/delete.constants');
const { SELLER_TYPES } = require('../../constants/sellerType.constants');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');
const fs = require('fs/promises');
const path = require('path');
const materialListingService = require('./materialListing.service');
const materialListingModel = require('../../model/materialListing.model');

class StoreProfileError extends Error {
  constructor(message, statusCode = 400) { super(message); this.name = 'StoreProfileError'; this.statusCode = statusCode; }
}

// Same URL shape finalizeMediaFiles() in materialListing.service.js stores
// on a listing image (`/images/<filename>`) — the client passes it
// through resolveImageUrl exactly like a listing image's `url`.
function mediaUrl(filename) {
  return filename ? `/images/${filename}` : '';
}

// Best-effort: a replaced/removed image's file is deleted from the same
// permanent folder finalizeMediaFiles() moves it into. ENOENT is expected
// for images saved before files were moved (they never left temp), and a
// failed delete must never fail the profile update itself.
async function removeStoredMedia(filename) {
  try {
    await fs.unlink(path.join(__dirname, '../../../public', materialListingService.MEDIA_FOLDER, path.basename(filename)));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Could not delete replaced store image:', filename, err.message);
  }
}

function buildLocation(location) {
  const built = {
    city: location.city,
    state: location.state,
    pincode: location.pincode || '',
    area: location.area || '',
  };
  if (location.latitude != null && location.longitude != null) {
    built.geo = { type: 'Point', coordinates: [location.longitude, location.latitude] };
  }
  return built;
}

// Section 6 — never trust the frontend dropdown's businessTypeId/
// categoryIds alone, same guard as authService.assertBusinessTypeActive /
// assertStoreCategoriesActive used at registration.
async function assertBusinessTypeActive(businessTypeId) {
  const type = await businessTypeModel.findOne({ _id: businessTypeId, status: 'active', is_deleted: deleteConstants.NOT_DELETED });
  if (!type) throw new StoreProfileError('Selected business type was not found or is no longer active', 404);
  return type;
}

async function assertStoreCategoriesActive(categoryIds = []) {
  const categories = await storeCategoryModel.find({ _id: { $in: categoryIds }, status: 'active', is_deleted: deleteConstants.NOT_DELETED });
  if (categories.length !== categoryIds.length) {
    throw new StoreProfileError('One or more selected store categories were not found or are no longer active', 404);
  }
  return categories;
}

async function assertBusinessSeller(sellerId) {
  const seller = await userModel.findById(sellerId).select('sellerType');
  if (!seller || seller.sellerType !== SELLER_TYPES.BUSINESS_STORE) {
    throw new StoreProfileError('Only Business/Store sellers have a store profile', 403);
  }
  return seller;
}

async function getMyStoreProfile(sellerId) {
  await assertBusinessSeller(sellerId);
  const store = await storeProfileModel.findOne({ seller: sellerId, is_deleted: deleteConstants.NOT_DELETED });
  if (!store) throw new StoreProfileError('Store profile not found', 404);
  return { ...store.toObject(), profileImageUrl: mediaUrl(store.profileImage), bannerImageUrl: mediaUrl(store.bannerImage) };
}

async function updateMyStoreProfile({ sellerId, body, req }) {
  await assertBusinessSeller(sellerId);
  const store = await storeProfileModel.findOne({ seller: sellerId, is_deleted: deleteConstants.NOT_DELETED });
  if (!store) throw new StoreProfileError('Store profile not found', 404);

  if (body.storeName !== undefined) store.storeName = body.storeName;
  // Same two-phase pipeline as listing photos: the upload endpoint only
  // drops the file in temp storage, so a newly-picked filename must be
  // moved to permanent storage before it's saved. An unchanged filename
  // was already moved on an earlier save, so it's skipped, not moved twice.
  const replacedFiles = [];
  for (const field of ['profileImage', 'bannerImage']) {
    if (body[field] === undefined || body[field] === store[field]) continue;
    if (body[field]) await materialListingService.finalizeSingleMedia(body[field]);
    if (store[field]) replacedFiles.push(store[field]);
    store[field] = body[field];
  }
  if (body.businessTypeId !== undefined) {
    await assertBusinessTypeActive(body.businessTypeId);
    store.businessType = body.businessTypeId;
  }
  if (body.address !== undefined) store.address = body.address;
  if (body.addressMeta !== undefined) store.addressMeta = body.addressMeta;
  if (body.categoryIds !== undefined) {
    const categoryDocs = await assertStoreCategoriesActive(body.categoryIds);
    store.categoryIds = body.categoryIds;
    store.categories = categoryDocs.map((c) => c.name);
  }
  if (body.pickupAvailable !== undefined) store.pickupAvailable = body.pickupAvailable;
  if (body.deliveryAvailable !== undefined) store.deliveryAvailable = body.deliveryAvailable;
  if (body.panNumber !== undefined) store.panNumber = body.panNumber;
  if (body.gstRegistered !== undefined) store.gstRegistered = body.gstRegistered;
  if (body.gstin !== undefined) store.gstin = body.gstRegistered ? body.gstin : '';
  let updatedLocation = null;
  if (body.location) {
    updatedLocation = buildLocation(body.location);
    store.location = updatedLocation;
  }

  store.history.push({ action: 'UPDATED' });
  await store.save();
  await Promise.all(replacedFiles.map(removeStoredMedia));
  // Business/Store listings mirror the store's location (see
  // materialListing.service.js#createListing), so a changed store
  // location has to reach the listings buyers actually filter on.
  if (updatedLocation) {
    await materialListingModel.updateMany(
      { seller: sellerId, is_deleted: deleteConstants.NOT_DELETED },
      { $set: { location: updatedLocation } }
    );
  }
  await createAuditLog({ req, userId: sellerId, action: auditLogConstants.STORE_PROFILE_UPDATED, entity: 'store_profiles', entityId: store._id });
  return store;
}

// Public storefront summary — city/state only (not the full street
// address or coordinates), same "don't expose more than a buyer needs"
// principle as the buyer-location handling elsewhere in the marketplace.
async function getPublicStoreProfile(sellerId) {
  if (!mongoose.Types.ObjectId.isValid(sellerId)) throw new StoreProfileError('Invalid store id', 404);
  const store = await storeProfileModel
    .findOne({ seller: sellerId, is_deleted: deleteConstants.NOT_DELETED })
    .populate('seller', 'fullName createdAt sellerType')
    .populate('businessType', 'name slug');
  if (!store || store.seller?.sellerType !== SELLER_TYPES.BUSINESS_STORE) {
    throw new StoreProfileError('Store not found', 404);
  }
  return {
    sellerId: store.seller._id,
    storeName: store.storeName,
    profileImageUrl: mediaUrl(store.profileImage),
    bannerImageUrl: mediaUrl(store.bannerImage),
    businessType: store.businessType ? { _id: store.businessType._id, name: store.businessType.name } : null,
    location: { city: store.location.city, state: store.location.state },
    categories: store.categories,
    pickupAvailable: store.pickupAvailable,
    deliveryAvailable: store.deliveryAvailable,
    verificationStatus: store.verificationStatus,
    memberSince: store.seller.createdAt,
  };
}

async function getStoreProducts({ sellerId, page, limit, category }) {
  if (!mongoose.Types.ObjectId.isValid(sellerId)) throw new StoreProfileError('Invalid store id', 404);
  const seller = await userModel.findById(sellerId).select('sellerType');
  if (!seller || seller.sellerType !== SELLER_TYPES.BUSINESS_STORE) throw new StoreProfileError('Store not found', 404);
  // materialListing.service.js#search already restricts to buyer-visible
  // statuses and attaches storeProfile info — reused rather than
  // duplicating the query here.
  // The store page's chips are store category NAMES, but a listing stores
  // a material-category ObjectId. The two collections are linked by slug
  // (createListing's allowedCategorySlugs check relies on the same link),
  // so resolve name -> slug -> material category id.
  let materialCategoryId;
  if (category) {
    if (typeof category !== 'string') throw new StoreProfileError('Invalid category', 400);
    const storeCategory = await storeCategoryModel.findOne({ name: category, is_deleted: deleteConstants.NOT_DELETED }).select('slug');
    const materialCategory = storeCategory
      ? await materialCategoryModel.findOne({ slug: storeCategory.slug, is_deleted: deleteConstants.NOT_DELETED }).select('_id')
      : null;
    if (!materialCategory) {
      return { getData: [], count: 0, page: Math.max(1, Number(page) || 1), limit: Math.min(100, Number(limit) || 20) };
    }
    materialCategoryId = materialCategory._id;
  }
  return materialListingService.search({ sellerId, page, limit, category: materialCategoryId });
}

module.exports = {
  StoreProfileError, assertBusinessTypeActive, assertStoreCategoriesActive,
  getMyStoreProfile, updateMyStoreProfile, getPublicStoreProfile, getStoreProducts,
};
