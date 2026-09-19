const mongoose = require('mongoose');
const storeProfileModel = require('../../model/storeProfile.model');
const userModel = require('../../model/user.model');
const deleteConstants = require('../../constants/delete.constants');
const { SELLER_TYPES } = require('../../constants/sellerType.constants');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');
const materialListingService = require('./materialListing.service');

class StoreProfileError extends Error {
  constructor(message, statusCode = 400) { super(message); this.name = 'StoreProfileError'; this.statusCode = statusCode; }
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
  return store;
}

async function updateMyStoreProfile({ sellerId, body, req }) {
  await assertBusinessSeller(sellerId);
  const store = await storeProfileModel.findOne({ seller: sellerId, is_deleted: deleteConstants.NOT_DELETED });
  if (!store) throw new StoreProfileError('Store profile not found', 404);

  if (body.storeName !== undefined) store.storeName = body.storeName;
  if (body.businessType !== undefined) store.businessType = body.businessType;
  if (body.address !== undefined) store.address = body.address;
  if (body.categories !== undefined) store.categories = body.categories;
  if (body.pickupAvailable !== undefined) store.pickupAvailable = body.pickupAvailable;
  if (body.deliveryAvailable !== undefined) store.deliveryAvailable = body.deliveryAvailable;
  if (body.location) store.location = buildLocation(body.location);

  store.history.push({ action: 'UPDATED' });
  await store.save();
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
    .populate('seller', 'fullName createdAt sellerType');
  if (!store || store.seller?.sellerType !== SELLER_TYPES.BUSINESS_STORE) {
    throw new StoreProfileError('Store not found', 404);
  }
  return {
    sellerId: store.seller._id,
    storeName: store.storeName,
    businessType: store.businessType,
    location: { city: store.location.city, state: store.location.state },
    categories: store.categories,
    pickupAvailable: store.pickupAvailable,
    deliveryAvailable: store.deliveryAvailable,
    verificationStatus: store.verificationStatus,
    memberSince: store.seller.createdAt,
  };
}

async function getStoreProducts({ sellerId, page, limit }) {
  if (!mongoose.Types.ObjectId.isValid(sellerId)) throw new StoreProfileError('Invalid store id', 404);
  const seller = await userModel.findById(sellerId).select('sellerType');
  if (!seller || seller.sellerType !== SELLER_TYPES.BUSINESS_STORE) throw new StoreProfileError('Store not found', 404);
  // materialListing.service.js#search already restricts to buyer-visible
  // statuses and attaches storeProfile info — reused rather than
  // duplicating the query here.
  return materialListingService.search({ sellerId, page, limit });
}

module.exports = { StoreProfileError, getMyStoreProfile, updateMyStoreProfile, getPublicStoreProfile, getStoreProducts };
