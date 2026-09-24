const Joi = require("joi");
const { CONDITION_TYPES, SUPPLY_TYPES, BUSINESS_STORE_CONDITION_TYPES } = require('../../constants/materialListing.constants');
const { SELLER_TYPES } = require('../../constants/sellerType.constants');
const { MATERIAL_UNITS } = require('../../constants/materialUnit.constants');

const objectId = () => Joi.string().pattern(/^[a-fA-F0-9]{24}$/).messages({
  'string.pattern.base': 'Must be a valid MongoDB ObjectId',
});

class materialListingValidation {
  static create() {
    return Joi.object({
      title: Joi.string().trim().min(3).max(150).required(),
      description: Joi.string().trim().max(3000).allow(''),
      category: objectId().required(),
      subcategory: objectId().allow(null, ''),
      brand: Joi.string().trim().max(100).allow(''),
      condition: Joi.string().valid(...Object.values(CONDITION_TYPES)).required(),
      // Optional here — materialListing.service.js#createListing derives/
      // enforces the actual value from the seller's sellerType, since a
      // Business/Store seller must never be able to submit anything but
      // NEW_STOCK and an Individual seller must never submit NEW_STOCK.
      supplyType: Joi.string().valid(...Object.values(SUPPLY_TYPES)).optional(),
      quantity: Joi.number().positive().required(),
      unit: Joi.string().valid(...MATERIAL_UNITS).required(),
      price: Joi.number().min(0).required(),
      currency: Joi.string().trim().default('INR'),
      // No Joi default — materialListing.service.js#createListing needs to
      // tell "omitted" apart from "explicitly sent" to apply the right
      // seller-type-based default (Individual: true, Business/Store: false).
      negotiable: Joi.boolean().optional(),
      specifications: Joi.object().unknown(true).default({}),
      manufacturingDate: Joi.date().allow(null),
      purchaseDate: Joi.date().allow(null),
      location: Joi.object({
        city: Joi.string().trim().required(),
        state: Joi.string().trim().required(),
        pincode: Joi.string().trim().allow(''),
        area: Joi.string().trim().allow(''),
        latitude: Joi.number().min(-90).max(90).allow(null),
        longitude: Joi.number().min(-180).max(180).allow(null),
      }).required(),
      images: Joi.array().items(Joi.string()).max(12).default([]).optional(), // temp-upload filenames
      invoiceProof: Joi.string().allow(null, ''),
    });
  }

  static update() {
    return this.create().fork(
      ['title', 'category', 'condition', 'quantity', 'unit', 'price', 'location'],
      (schema) => schema.optional()
    );
  }

  // Business/Store-only field constraints — condition restricted to new/
  // unused stock, and (when the caller has resolved the seller's
  // registered store categories) category restricted to that set. Both
  // depend on DB-fetched context (StoreProfile, the category's slug) that
  // isn't available at the static create()/update() gate the controller
  // calls, so — same pattern as materialSpecs.validation.js's
  // validateSpecifications() — this schema is built and run from
  // materialListing.service.js once it has that context, for both
  // createListing and updateListing. Never applied to INDIVIDUAL sellers.
  static businessStore({ allowedCategorySlugs } = {}) {
    return Joi.object({
      condition: Joi.string()
        .valid(...BUSINESS_STORE_CONDITION_TYPES)
        .required()
        .messages({ 'any.only': 'Business/Store sellers can only list new or unused inventory conditions' }),
      // Only constrained to a fixed set when the service passes the
      // store's registered category slugs (a brand-new StoreProfile with
      // no categories set yet imposes no restriction, mirroring the
      // service's original `sellerSlugs.length &&` guard).
      categorySlug: Array.isArray(allowedCategorySlugs) && allowedCategorySlugs.length
        ? Joi.string().valid(...allowedCategorySlugs).required().messages({
            'any.only': 'This category is not registered for your store — update your store categories to list it',
          })
        : Joi.string().allow('', null).optional(),
    }).unknown(true);
  }

  static ValidateBusinessStoreFields({ condition, categorySlug, allowedCategorySlugs }) {
    return this.businessStore({ allowedCategorySlugs }).validate(
      { condition, categorySlug },
      { abortEarly: false }
    );
  }

  static list() {
    return Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      search: Joi.string().trim().allow(''),
      category: objectId().allow(''),
      subcategory: objectId().allow(''),
      // Lets a buyer browse one specific seller's live listings (product
      // details page's "Sold By" → view all their listings) — the service
      // layer (materialListing.service.js#search) already filters on this
      // for the business-store product grid; it just wasn't reachable from
      // the public query string until now.
      sellerId: objectId().allow(''),
      condition: Joi.string().valid(...Object.values(CONDITION_TYPES)).allow(''),
      supplyType: Joi.string().valid(...Object.values(SUPPLY_TYPES)).allow(''),
      sellerType: Joi.string().valid(...Object.values(SELLER_TYPES)).allow(''),
      brand: Joi.string().trim().allow(''),
      minPrice: Joi.number().min(0).allow(null, ''),
      maxPrice: Joi.number().min(0).allow(null, ''),
      minQuantity: Joi.number().min(0).allow(null, ''),
      negotiable: Joi.boolean().allow(null, ''),
      verified: Joi.boolean().allow(null, ''),
      city: Joi.string().trim().allow(''),
      state: Joi.string().trim().allow(''),
      lat: Joi.number().min(-90).max(90).allow(null, ''),
      lng: Joi.number().min(-180).max(180).allow(null, ''),
      radiusKm: Joi.number().positive().max(500).allow(null, ''),
      sort: Joi.string().valid('newest', 'price_asc', 'price_desc', 'nearest').default('newest'),
    });
  }

  static ValidateCreate(data) {
    return this.create().validate(data, { abortEarly: false, stripUnknown: true });
  }

  static ValidateUpdate(data) {
    return this.update().validate(data, { abortEarly: false, stripUnknown: true });
  }

  static ValidateList(query) {
    return this.list().validate(query, { abortEarly: false, stripUnknown: true });
  }
}

module.exports = materialListingValidation;
