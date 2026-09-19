const mongoose = require('mongoose');
const materialListingModel = require('../../model/materialListing.model');
const materialCategoryModel = require('../../model/materialCategory.model');
const offerModel = require('../../model/offer.model');
const userModel = require('../../model/user.model');
const storeProfileModel = require('../../model/storeProfile.model');
const deleteConstants = require('../../constants/delete.constants');
const { LISTING_STATES, VERIFICATION_STATES, BUYER_VISIBLE_STATES, MAX_LISTING_IMAGES, MAX_LISTING_VIDEOS, SUPPLY_TYPES, INDIVIDUAL_SUPPLY_TYPES } = require('../../constants/materialListing.constants');
const { SELLER_TYPES } = require('../../constants/sellerType.constants');
const { OFFER_TERMINAL_STATES } = require('../../constants/offer.constants');
const { validateSpecifications,mergeSpecFieldDefs  } = require('../../validation/app/materialSpecs.validation');
const helper = require('../../helper/helper');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');
const fs = require('fs/promises');
const path = require('path');

class MaterialListingError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'MaterialListingError';
    this.statusCode = statusCode;
  }
}

const MEDIA_FOLDER = 'materialListingMedia';

/**
 * Moves already-uploaded temp files (see upload.route.js — the same
 * two-phase temp-upload pipeline every other module in this codebase
 * uses) into permanent storage and builds the metadata-only media
 * records the schema stores (spec section 8 — never binary in Mongo).
 * Best-effort on size/mimeType: a stat failure degrades to nulls rather
 * than failing listing creation over a thumbnail detail.
 */
async function finalizeMediaFiles(tempFilenames = []) {
  const results = [];
  for (const filename of tempFilenames) {
    if (!filename) continue;
    await helper.moveFileFromFolder(filename, MEDIA_FOLDER);
    const destPath = path.join(__dirname, '../../../public', MEDIA_FOLDER, filename);
    let size = null;
    try {
      const stat = await fs.stat(destPath);
      size = stat.size;
    } catch {
      // file already gone / never existed — leave size null rather than fail the listing
    }
    results.push({
      url: `/images/${filename}`,
      storageKey: filename,
      mimeType: path.extname(filename).replace('.', '') || null,
      size,
      uploadedAt: new Date(),
    });
  }
  return results;
}

async function finalizeSingleMedia(tempFilename) {
  if (!tempFilename) return null;
  const [media] = await finalizeMediaFiles([tempFilename]);
  return media || null;
}

async function assertCategoryAndSpecs({ categoryId, subcategoryId, specifications }) {
  const category = await materialCategoryModel.findOne({ _id: categoryId, status: 'active', is_deleted: deleteConstants.NOT_DELETED });
  if (!category) throw new MaterialListingError('Category not found or inactive', 404);

  let subcategory = null;
  if (subcategoryId) {
    subcategory = await materialCategoryModel.findOne({ _id: subcategoryId, status: 'active', is_deleted: deleteConstants.NOT_DELETED });
    if (!subcategory) throw new MaterialListingError('Subcategory not found or inactive', 404);
    if (String(subcategory.parentCategory) !== String(categoryId)) {
      throw new MaterialListingError('Subcategory does not belong to the selected category', 400);
    }
  }

  const specFieldDefs = mergeSpecFieldDefs(category.specFields, subcategory?.specFields);
  const { error, value } = validateSpecifications(specFieldDefs, specifications);
  if (error) {
    throw new MaterialListingError(`Invalid specifications for "${category.name}": ${error.details.map((d) => d.message).join('; ')}`, 400);
  }
  return { category, subcategory, specifications: value };
}

// Server-side authoritative — never trust an individual seller's raw
// `supplyType`, and never let a Business/Store seller choose one at all.
// Sellers with no sellerType set yet (pre-migration legacy accounts —
// spec section 25) are treated as INDIVIDUAL rather than rejected.
function resolveSupplyType(sellerType, requested) {
  if (sellerType === SELLER_TYPES.BUSINESS_STORE) return SUPPLY_TYPES.NEW_STOCK;
  if (!INDIVIDUAL_SUPPLY_TYPES.includes(requested)) {
    throw new MaterialListingError(
      `supplyType must be one of ${INDIVIDUAL_SUPPLY_TYPES.join(', ')} for an individual seller`,
      400
    );
  }
  return requested;
}

function buildLocation(body) {
  const location = {
    city: body.location.city,
    state: body.location.state,
    pincode: body.location.pincode || '',
    area: body.location.area || '',
  };
  if (body.location.latitude != null && body.location.longitude != null) {
    location.geo = { type: 'Point', coordinates: [body.location.longitude, body.location.latitude] };
  }
  return location;
}

async function createListing({ sellerId, body, req }) {
  if ((body.images || []).length > MAX_LISTING_IMAGES) {
    throw new MaterialListingError(`A listing may have at most ${MAX_LISTING_IMAGES} images`);
  }
  if ((body.videos || []).length > MAX_LISTING_VIDEOS) {
    throw new MaterialListingError(`A listing may have at most ${MAX_LISTING_VIDEOS} videos`);
  }

  const { category, specifications } = await assertCategoryAndSpecs({
    categoryId: body.category,
    subcategoryId: body.subcategory,
    specifications: body.specifications,
  });

  const seller = await userModel.findById(sellerId).select('sellerType');
  const supplyType = resolveSupplyType(seller?.sellerType, body.supplyType);

  const [images, videos, invoiceProof] = await Promise.all([
    finalizeMediaFiles(body.images),
    finalizeMediaFiles(body.videos),
    finalizeSingleMedia(body.invoiceProof),
  ]);

  const listing = await materialListingModel.create({
    seller: sellerId,
    title: body.title,
    description: body.description || '',
    category: category._id,
    subcategory: body.subcategory || null,
    brand: body.brand || '',
    condition: body.condition,
    supplyType,
    quantity: body.quantity,
    unit: body.unit,
    price: body.price,
    currency: body.currency || 'INR',
    // Business/Store listings default to a fixed listed price rather
    // than negotiation (spec: "do not implement negotiation as the
    // primary business-store pricing flow") — still a seller choice, not
    // a hard rule, so an explicit body.negotiable is respected either way.
    negotiable: body.negotiable !== undefined
      ? body.negotiable !== false
      : seller?.sellerType !== SELLER_TYPES.BUSINESS_STORE,
    specifications,
    manufacturingDate: body.manufacturingDate || null,
    purchaseDate: body.purchaseDate || null,
    location: buildLocation(body),
    images,
    videos,
    invoiceProof,
    status: LISTING_STATES.DRAFT,
    stateHistory: [{ fromStatus: null, toStatus: LISTING_STATES.DRAFT, changedBy: sellerId, changedByType: 'seller', reason: 'Listing created' }],
  });

  await createAuditLog({
    req, userId: sellerId, action: auditLogConstants.MATERIAL_LISTING_CREATED || 'MATERIAL_LISTING_CREATED',
    entity: 'material_listings', entityId: listing._id,
  });

  return listing;
}

async function getOwnedListingOrThrow(listingId, sellerId) {
  if (!mongoose.Types.ObjectId.isValid(listingId)) throw new MaterialListingError('Invalid listing id');
  const listing = await materialListingModel.findOne({ _id: listingId, seller: sellerId, is_deleted: deleteConstants.NOT_DELETED });
  if (!listing) throw new MaterialListingError('Listing not found', 404);
  return listing;
}
async function getMine({ sellerId, listingId }) {
  const listing = await getOwnedListingOrThrow(listingId, sellerId);
  await listing.populate('category', 'name slug specFields');
  await listing.populate('subcategory', 'name slug parentCategory specFields');
  return listing;
}
async function updateListing({ sellerId, listingId, body, req }) {
  const listing = await getOwnedListingOrThrow(listingId, sellerId);
  if (listing.status === LISTING_STATES.SOLD_OUT || listing.status === LISTING_STATES.ARCHIVED) {
    throw new MaterialListingError(`Cannot edit a listing that is ${listing.status}`, 409);
  }

  if (body.category || body.specifications) {
    const { category, specifications } = await assertCategoryAndSpecs({
      categoryId: body.category || listing.category,
      subcategoryId: body.subcategory !== undefined ? body.subcategory : listing.subcategory,
      specifications: body.specifications !== undefined ? body.specifications : listing.specifications,
    });
    listing.category = category._id;
    listing.specifications = specifications;
  }
  if (body.subcategory !== undefined) listing.subcategory = body.subcategory || null;

  // A Business/Store seller's supplyType can never move off NEW_STOCK, so
  // there's nothing to change for them regardless of what's sent — only
  // an Individual seller can switch between SURPLUS and NEW_UNUSED here.
  if (body.supplyType !== undefined) {
    const seller = await userModel.findById(sellerId).select('sellerType');
    if (seller?.sellerType !== SELLER_TYPES.BUSINESS_STORE) {
      listing.supplyType = resolveSupplyType(seller?.sellerType, body.supplyType);
    }
  }

    const directFields = ['title', 'description', 'brand', 'condition', 'unit', 'price', 'currency', 'negotiable', 'manufacturingDate', 'purchaseDate'];
  for (const field of directFields) {
    if (body[field] !== undefined) listing[field] = body[field];
  }
  // quantity is handled separately: it can never drop below what's
  // already reserved/sold, and availableQuantity must move with it.
  if (body.quantity !== undefined) {
    const committed = listing.reservedQuantity + listing.soldQuantity;
    if (body.quantity < committed) {
      throw new MaterialListingError(`Total quantity cannot be less than the ${committed} ${listing.unit} already reserved or sold`, 409);
    }
    listing.availableQuantity = body.quantity - committed;
    listing.quantity = body.quantity;
  }
  if (body.location) listing.location = buildLocation(body);

  if (body.images) listing.images = await finalizeMediaFiles(body.images);
  if (body.videos) listing.videos = await finalizeMediaFiles(body.videos);
  if (body.invoiceProof) listing.invoiceProof = await finalizeSingleMedia(body.invoiceProof);

  // Any edit to a live/verified listing forces it back through moderation
  // (spec's fraud-prevention emphasis: a verified listing's claims must
  // stay in sync with what was actually verified).
  if (listing.status === LISTING_STATES.LIVE) {
    const fromStatus = listing.status;
    listing.status = LISTING_STATES.PENDING_VERIFICATION;
    listing.verificationStatus = VERIFICATION_STATES.PENDING_VERIFICATION;
    listing.stateHistory.push({ fromStatus, toStatus: listing.status, changedBy: sellerId, changedByType: 'seller', reason: 'Listing edited — resubmitted for verification' });
  }

  await listing.save();
  await createAuditLog({ req, userId: sellerId, action: auditLogConstants.MATERIAL_LISTING_UPDATED || 'MATERIAL_LISTING_UPDATED', entity: 'material_listings', entityId: listing._id });
  return listing;
}

async function submitForVerification({ sellerId, listingId, req }) {
  const listing = await getOwnedListingOrThrow(listingId, sellerId);
  if (![LISTING_STATES.DRAFT, LISTING_STATES.REJECTED].includes(listing.status)) {
    throw new MaterialListingError(`Cannot submit a listing from status ${listing.status}`, 409);
  }
  const fromStatus = listing.status;
  listing.status = LISTING_STATES.PENDING_VERIFICATION;
  listing.verificationStatus = VERIFICATION_STATES.PENDING_VERIFICATION;
  listing.stateHistory.push({ fromStatus, toStatus: listing.status, changedBy: sellerId, changedByType: 'seller', reason: 'Submitted for verification' });
  await listing.save();
  await createAuditLog({ req, userId: sellerId, action: auditLogConstants.MATERIAL_LISTING_SUBMITTED || 'MATERIAL_LISTING_SUBMITTED', entity: 'material_listings', entityId: listing._id });
  return listing;
}

async function setSellerStatus({ sellerId, listingId, targetStatus, req }) {
  const listing = await getOwnedListingOrThrow(listingId, sellerId);
  const allowedTransitions = {
    [LISTING_STATES.PAUSED]: [LISTING_STATES.LIVE],
    [LISTING_STATES.LIVE]: [LISTING_STATES.PAUSED],
    [LISTING_STATES.SOLD_OUT]: [LISTING_STATES.LIVE, LISTING_STATES.PAUSED],
    [LISTING_STATES.ARCHIVED]: Object.values(LISTING_STATES),
  };
  if (!allowedTransitions[targetStatus]?.includes(listing.status)) {
    throw new MaterialListingError(`Cannot move listing from ${listing.status} to ${targetStatus}`, 409);
  }
  const fromStatus = listing.status;
  listing.status = targetStatus;
  listing.stateHistory.push({ fromStatus, toStatus: targetStatus, changedBy: sellerId, changedByType: 'seller', reason: `Seller set status to ${targetStatus}` });
  await listing.save();
  await createAuditLog({ req, userId: sellerId, action: auditLogConstants.MATERIAL_LISTING_STATUS_CHANGED || 'MATERIAL_LISTING_STATUS_CHANGED', entity: 'material_listings', entityId: listing._id, metadata: { fromStatus, toStatus: targetStatus } });
  return listing;
}

async function deleteListing({ sellerId, listingId, req }) {
  const listing = await getOwnedListingOrThrow(listingId, sellerId);
  const activeOfferCount = await offerModel.countDocuments({
    listing: listing._id,
    status: { $nin: OFFER_TERMINAL_STATES },
    is_deleted: deleteConstants.NOT_DELETED,
  });
  if (activeOfferCount > 0) {
    throw new MaterialListingError('Cannot delete a listing with active offers — resolve or cancel them first', 409);
  }
  listing.is_deleted = deleteConstants.DELETED;
  await listing.save();
  await createAuditLog({ req, userId: sellerId, action: auditLogConstants.MATERIAL_LISTING_DELETED || 'MATERIAL_LISTING_DELETED', entity: 'material_listings', entityId: listing._id });
  return { deleted: true };
}

// Business/Store listings show the store's name/verification instead of
// "Individual Seller" (spec's card/detail-page distinction) — StoreProfile
// isn't a `ref` on materialListing (only seller id is shared between the
// two), so this is a small explicit lookup rather than a populate.
async function attachStoreProfile(listing) {
  if (listing?.seller?.sellerType !== SELLER_TYPES.BUSINESS_STORE) return listing;
  const store = await storeProfileModel
    .findOne({ seller: listing.seller._id, is_deleted: deleteConstants.NOT_DELETED })
    .select('storeName verificationStatus')
    .lean();
  if (store) {
    if (listing.toObject) listing = listing.toObject();
    listing.storeProfile = { storeName: store.storeName, verificationStatus: store.verificationStatus };
  }
  return listing;
}

async function attachStoreProfiles(listings) {
  const businessSellerIds = [...new Set(
    listings.filter((l) => l.seller?.sellerType === SELLER_TYPES.BUSINESS_STORE).map((l) => String(l.seller._id))
  )];
  if (!businessSellerIds.length) return listings;
  const stores = await storeProfileModel
    .find({ seller: { $in: businessSellerIds }, is_deleted: deleteConstants.NOT_DELETED })
    .select('seller storeName verificationStatus')
    .lean();
  const storeBySellerId = new Map(stores.map((s) => [String(s.seller), s]));
  return listings.map((l) => {
    const store = l.seller?.sellerType === SELLER_TYPES.BUSINESS_STORE ? storeBySellerId.get(String(l.seller._id)) : null;
    return store ? { ...l, storeProfile: { storeName: store.storeName, verificationStatus: store.verificationStatus } } : l;
  });
}

async function getOne({ listingId, viewerId, viewerIsAdmin }) {
  if (!mongoose.Types.ObjectId.isValid(listingId)) throw new MaterialListingError('Invalid listing id', 404);
  const listing = await materialListingModel
    .findOne({ _id: listingId, is_deleted: deleteConstants.NOT_DELETED })
    .populate('category', 'name slug')
    .populate('subcategory', 'name slug')
    .populate('seller', 'fullName email createdAt sellerType');
  if (!listing) throw new MaterialListingError('Listing not found', 404);

  const isOwner = viewerId && String(listing.seller._id) === String(viewerId);
  if (!isOwner && !viewerIsAdmin && !BUYER_VISIBLE_STATES.includes(listing.status)) {
    throw new MaterialListingError('Listing not found', 404);
  }
  if (!isOwner && !viewerIsAdmin) {
    materialListingModel.updateOne({ _id: listing._id }, { $inc: { viewCount: 1 } }).catch(() => {});
  }
  return attachStoreProfile(listing);
}

async function search(filters) {
  const {
    page = 1, limit = 20, search: text, category, subcategory, condition, brand,
    supplyType, sellerType, sellerId,
    minPrice, maxPrice, minQuantity, negotiable, verified,
    city, state, lat, lng, radiusKm, sort = 'newest',
  } = filters;

  const query = { status: [LISTING_STATES.LIVE, LISTING_STATES.SOLD_OUT,], is_deleted: deleteConstants.NOT_DELETED };
  if (sellerId) query.seller = sellerId; // storeProfile.service.js#getStoreProducts — one seller's own storefront
  if (category) query.category = category;
  if (subcategory) query.subcategory = subcategory;
  if (condition) query.condition = condition;
  if (supplyType) query.supplyType = supplyType;
  if (brand) query.brand = { $regex: brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (minPrice != null || maxPrice != null) {
    query.price = {};
    if (minPrice != null) query.price.$gte = Number(minPrice);
    if (maxPrice != null) query.price.$lte = Number(maxPrice);
  }
  if (minQuantity != null) query.quantity = { $gte: Number(minQuantity) };
  if (negotiable != null) query.negotiable = Boolean(negotiable);
  if (verified) query.verificationStatus = VERIFICATION_STATES.VERIFIED;
  if (city) query['location.city'] = { $regex: `^${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
  if (state) query['location.state'] = { $regex: `^${state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
  if (text) query.$text = { $search: text };

  // sellerType lives on User, not on the listing itself — resolve to a
  // set of seller ids first rather than reaching for an aggregation
  // $lookup, consistent with how attachStoreProfiles() below does its own
  // small secondary lookup instead of a `ref` that doesn't exist.
  if (sellerType && !query.seller) {
    const sellerIds = await userModel.find({ sellerType }).select('_id').lean();
    query.seller = { $in: sellerIds.map((s) => s._id) };
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);

  // Proximity search (spec section 16) uses $geoNear-style $near, which
  // requires a standalone query (no $text alongside it in the same find),
  // so it takes its own path rather than folding into the sort switch below.
  if (lat != null && lng != null && radiusKm) {
    query['location.geo'] = {
      $near: {
        $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
        $maxDistance: Number(radiusKm) * 1000,
      },
    };
    const [rawData, count] = await Promise.all([
      // Seller name is buyer-facing (ListingCard's seller-identity row,
      // EnquireModal's success message) — only fullName, never email/phone,
      // to the public search response. sellerType drives the
      // Individual/Business card treatment (attachStoreProfiles below).
      materialListingModel.find(query).select('-stateHistory').populate('category', 'name slug').populate('seller', 'fullName sellerType').skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
      materialListingModel.countDocuments(query),
    ]);
    return { getData: await attachStoreProfiles(rawData), count, page: pageNum, limit: pageLimit };
  }

  const sortMap = {
    newest: { createdAt: -1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 },
  };

  const [rawData, count] = await Promise.all([
    materialListingModel.find(query).select('-stateHistory').populate('category', 'name slug').populate('seller', 'fullName sellerType').sort(sortMap[sort] || sortMap.newest).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    materialListingModel.countDocuments(query),
  ]);
  return { getData: await attachStoreProfiles(rawData), count, page: pageNum, limit: pageLimit };
}

async function myListings({ sellerId, page = 1, limit = 20, status }) {
  const query = { seller: sellerId, is_deleted: deleteConstants.NOT_DELETED };
  if (status) query.status = status;
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);
  const [rawData, count] = await Promise.all([
    materialListingModel.find(query).populate('category', 'name slug').sort({ createdAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    materialListingModel.countDocuments(query),
  ]);
  return { getData: rawData, count, page: pageNum, limit: pageLimit };
}

module.exports = {
  MaterialListingError,
  resolveSupplyType,
  createListing,
  updateListing,
  submitForVerification,
  setSellerStatus,
  deleteListing,
  getOne,
  getMine,
  search,
  myListings,
};
