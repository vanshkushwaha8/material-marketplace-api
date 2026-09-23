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
const materialListingValidation = require('../../validation/app/materialListing.validation');
const helper = require('../../helper/helper');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');
const fs = require('fs/promises');
const path = require('path');

// Buyer-facing "N km away" on the card (search()'s $near branch, spec
// section 13) — plain-JS great-circle distance from the buyer's own
// query coordinates to each listing's stored geo point, rather than a
// second geospatial query. $near already filters/orders by proximity
// server-side; this just turns that into the actual number the card
// shows, using the exact coordinates the query itself received.
function haversineKm([lng1, lat1], [lng2, lat2]) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Buyer search always shows LIVE listings before SOLD_OUT ones — a
// sold-out card sitting above ones actually in stock just makes buyers
// scroll past it to find what they can buy. This is NOT a `.sort()` on
// `status` (that would rely on "LIVE" sorting before "SOLD_OUT"
// alphabetically — an accident of spelling, not a real rule, and it
// silently breaks if another buyer-visible status is ever added). It
// runs the same find()/populate()/sort() against each status bucket
// separately and stitches the requested page/limit window across the
// two, so pagination stays exact even when a page straddles the
// boundary between "still in stock" and "sold out".
async function fetchStatusOrderedPage({ baseQuery, populate, sort, skip, limit }) {
  const liveQuery = { ...baseQuery, status: LISTING_STATES.LIVE };
  const soldOutQuery = { ...baseQuery, status: LISTING_STATES.SOLD_OUT };
  const liveCount = await materialListingModel.countDocuments(liveQuery);

  const runQuery = (q, qSkip, qLimit) => {
    let builder = materialListingModel.find(q).select('-stateHistory');
    for (const [path, select] of populate) builder = builder.populate(path, select);
    return builder.sort(sort).skip(qSkip).limit(qLimit).lean();
  };

  const docs = [];
  if (skip < liveCount) {
    docs.push(...(await runQuery(liveQuery, skip, Math.min(limit, liveCount - skip))));
  }
  const remaining = limit - docs.length;
  if (remaining > 0) {
    docs.push(...(await runQuery(soldOutQuery, Math.max(0, skip - liveCount), remaining)));
  }
  return docs;
}

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
  let storeProfileId = null;
  if (seller?.sellerType === SELLER_TYPES.BUSINESS_STORE) {
    
    const [category, storeProfile] = await Promise.all([
      materialCategoryModel.findById(body.category).select('slug'),
      storeProfileModel.findOne({ seller: sellerId, is_deleted: deleteConstants.NOT_DELETED }).populate('categoryIds', 'slug'),
    ]);
    if (!storeProfile) {
      throw new MaterialListingError('Complete your store profile before creating a product listing', 400);
    }
    storeProfileId = storeProfile._id;
    const allowedCategorySlugs = (storeProfile.categoryIds || []).map((c) => c.slug);
    const { error: businessError } = materialListingValidation.ValidateBusinessStoreFields({
      condition: body.condition,
      categorySlug: category?.slug,
      allowedCategorySlugs,
    });
    if (businessError) {
      throw new MaterialListingError(businessError.details.map((d) => d.message).join('; '), 400);
    }
  }

  const supplyType = resolveSupplyType(seller?.sellerType, body.supplyType);

  const [images, videos, invoiceProof] = await Promise.all([
    finalizeMediaFiles(body.images),
    finalizeMediaFiles(body.videos),
    finalizeSingleMedia(body.invoiceProof),
  ]);

  const listing = await materialListingModel.create({
    seller: sellerId,
    storeProfile: storeProfileId,
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

  const seller = await userModel.findById(sellerId).select('sellerType');
  const isBusinessStore = seller?.sellerType === SELLER_TYPES.BUSINESS_STORE;

  // A Business/Store seller's condition/category are as strictly gated on
  // edit as they are on create (materialListing.service.js#createListing)
  // — a listing that started as NEW_SURPLUS could otherwise be silently
  // flipped to `used`, or moved to a category the store never registered,
  // just by hitting the update endpoint. Only fetched when the edit
  // actually touches condition or category.
  let storeProfile = null;
  if (isBusinessStore && (body.condition !== undefined || body.category)) {
    storeProfile = await storeProfileModel.findOne({ seller: sellerId, is_deleted: deleteConstants.NOT_DELETED }).populate('categoryIds', 'slug');
    if (!storeProfile) {
      throw new MaterialListingError('Complete your store profile before editing this listing', 400);
    }
  }

  if (body.category || body.specifications) {
    const { category, specifications } = await assertCategoryAndSpecs({
      categoryId: body.category || listing.category,
      subcategoryId: body.subcategory !== undefined ? body.subcategory : listing.subcategory,
      specifications: body.specifications !== undefined ? body.specifications : listing.specifications,
    });

    if (isBusinessStore && body.category) {
      const allowedCategorySlugs = (storeProfile.categoryIds || []).map((c) => c.slug);
      const { error: businessError } = materialListingValidation.ValidateBusinessStoreFields({
        condition: body.condition !== undefined ? body.condition : listing.condition,
        categorySlug: category.slug,
        allowedCategorySlugs,
      });
      if (businessError) {
        throw new MaterialListingError(businessError.details.map((d) => d.message).join('; '), 400);
      }
    }

    listing.category = category._id;
    listing.specifications = specifications;
  }
  if (body.subcategory !== undefined) listing.subcategory = body.subcategory || null;

  // condition alone (no category change) still needs the Business/Store
  // allowed-subset check — the category branch above already covers the
  // case where both are edited together.
  if (isBusinessStore && body.condition !== undefined && !body.category) {
    const { error: conditionError } = materialListingValidation.ValidateBusinessStoreFields({ condition: body.condition });
    if (conditionError) {
      throw new MaterialListingError(conditionError.details.map((d) => d.message).join('; '), 400);
    }
  }

  // A Business/Store seller's supplyType can never move off NEW_STOCK, so
  // there's nothing to change for them regardless of what's sent — only
  // an Individual seller can switch between SURPLUS and NEW_UNUSED here.
  if (body.supplyType !== undefined && !isBusinessStore) {
    listing.supplyType = resolveSupplyType(seller?.sellerType, body.supplyType);
  }

  // Self-heals listings created before storeProfile existed on the
  // schema — a BUSINESS_STORE seller editing an older listing gets it
  // linked to their store profile rather than staying orphaned.
  if (!listing.storeProfile && isBusinessStore) {
    const sp = storeProfile || await storeProfileModel.findOne({ seller: sellerId, is_deleted: deleteConstants.NOT_DELETED }).select('_id');
    if (sp) listing.storeProfile = sp._id;
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
// "Individual Seller" (spec's card/detail-page distinction). Looked up by
// the listing's own storeProfile FK (materialListing.schema.js) when
// present; falls back to a seller lookup for listings created before that
// field existed (storeProfile is unique-per-seller, so the fallback is
// still exact, just an extra query).
async function attachStoreProfile(listing) {
  if (listing?.seller?.sellerType !== SELLER_TYPES.BUSINESS_STORE) return listing;
  const storeProfileId = listing.storeProfile;
  const store = await (storeProfileId
    ? storeProfileModel.findOne({ _id: storeProfileId, is_deleted: deleteConstants.NOT_DELETED })
    : storeProfileModel.findOne({ seller: listing.seller._id, is_deleted: deleteConstants.NOT_DELETED })
  ).select('storeName verificationStatus gstRegistered').lean();
  if (store) {
    if (listing.toObject) listing = listing.toObject();
    listing.storeProfile = { storeName: store.storeName, verificationStatus: store.verificationStatus, gstRegistered: store.gstRegistered };
  }
  return listing;
}

async function attachStoreProfiles(listings) {
  const businessListings = listings.filter((l) => l.seller?.sellerType === SELLER_TYPES.BUSINESS_STORE);
  if (!businessListings.length) return listings;

  const storeProfileIds = [...new Set(businessListings.filter((l) => l.storeProfile).map((l) => String(l.storeProfile)))];
  // Legacy listings created before storeProfile was added to the schema
  // don't have the FK yet — fall back to resolving them by seller.
  const legacySellerIds = [...new Set(businessListings.filter((l) => !l.storeProfile).map((l) => String(l.seller._id)))];

  const [byId, bySeller] = await Promise.all([
    storeProfileIds.length
      ? storeProfileModel.find({ _id: { $in: storeProfileIds }, is_deleted: deleteConstants.NOT_DELETED }).select('seller storeName verificationStatus').lean()
      : [],
    legacySellerIds.length
      ? storeProfileModel.find({ seller: { $in: legacySellerIds }, is_deleted: deleteConstants.NOT_DELETED }).select('seller storeName verificationStatus').lean()
      : [],
  ]);
  const storeById = new Map(byId.map((s) => [String(s._id), s]));
  const storeBySellerId = new Map(bySeller.map((s) => [String(s.seller), s]));

  return listings.map((l) => {
    if (l.seller?.sellerType !== SELLER_TYPES.BUSINESS_STORE) return l;
    const store = l.storeProfile ? storeById.get(String(l.storeProfile)) : storeBySellerId.get(String(l.seller._id));
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

  // Real "N products" count for the detail page's "Sold By" card — same
  // LIVE + not-deleted scoping the public search endpoint itself uses,
  // just narrowed to this one seller. Only computed here (single listing),
  // never per-card in search results, so it doesn't add an extra query per
  // row on the browse page.
  const sellerProductsCount = await materialListingModel.countDocuments({
    seller: listing.seller._id,
    status: LISTING_STATES.LIVE,
    is_deleted: deleteConstants.NOT_DELETED,
  });

  const withStoreProfile = await attachStoreProfile(listing);
  if (withStoreProfile.toObject) {
    const plain = withStoreProfile.toObject();
    plain.sellerProductsCount = sellerProductsCount;
    return plain;
  }
  withStoreProfile.sellerProductsCount = sellerProductsCount;
  return withStoreProfile;
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
  // Seller name/join-date is buyer-facing (ListingCard's seller-identity
  // row, EnquireModal's success message) — only fullName/createdAt, never
  // email/phone, to the public search response. sellerType drives the
  // Individual/Business card treatment (attachStoreProfiles below).
  const populate = [
    ['category', 'name slug'],
    ['seller', 'fullName sellerType createdAt'],
  ];
  const skip = (pageNum - 1) * pageLimit;

  if (lat != null && lng != null && radiusKm) {
    const baseQuery = { ...query };
    delete baseQuery.status;
    baseQuery['location.geo'] = {
      $near: {
        $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
        $maxDistance: Number(radiusKm) * 1000,
      },
    };
    const [rawData, count] = await Promise.all([
      // $near already returns each bucket nearest-first, so no explicit
      // sort is passed — fetchStatusOrderedPage only reorders LIVE vs
      // SOLD_OUT, not the proximity ordering within either bucket.
      fetchStatusOrderedPage({ baseQuery, populate, sort: undefined, skip, limit: pageLimit }),
      // Count must include the same $near radius filter baseQuery carries
      // (status re-added as the combined LIVE/SOLD_OUT set, same as the
      // unfiltered `query` above) — otherwise "N results" would count
      // listings outside the search radius.
      materialListingModel.countDocuments({ ...baseQuery, status: [LISTING_STATES.LIVE, LISTING_STATES.SOLD_OUT] }),
    ]);
    // Real backend-computed "N km away" (spec section 13) from the same
    // coordinates $near just queried with — not a second geo lookup, just
    // turning the query's own inputs into the number the card displays.
    const origin = [Number(lng), Number(lat)];
    const withDistance = rawData.map((listing) => ({
      ...listing,
      distanceKm: listing.location?.geo?.coordinates
        ? Math.round(haversineKm(origin, listing.location.geo.coordinates) * 10) / 10
        : undefined,
    }));
    return { getData: await attachStoreProfiles(withDistance), count, page: pageNum, limit: pageLimit };
  }

  const sortMap = {
    newest: { createdAt: -1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 },
  };
  const baseQuery = { ...query };
  delete baseQuery.status;

  const [rawData, count] = await Promise.all([
    fetchStatusOrderedPage({ baseQuery, populate, sort: sortMap[sort] || sortMap.newest, skip, limit: pageLimit }),
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
  finalizeSingleMedia,
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
