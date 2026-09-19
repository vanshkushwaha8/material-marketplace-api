const Joi = require('joi');
const { BUSINESS_TYPES, STORE_CATEGORIES } = require('../../constants/storeProfile.constants');

class storeProfileValidation {
  static update() {
    return Joi.object({
      storeName: Joi.string().trim().min(2).max(150).optional(),
      businessType: Joi.string().valid(...Object.values(BUSINESS_TYPES)).optional(),
      location: Joi.object({
        city: Joi.string().trim().required(),
        state: Joi.string().trim().required(),
        pincode: Joi.string().trim().allow(''),
        area: Joi.string().trim().allow(''),
        latitude: Joi.number().min(-90).max(90).allow(null),
        longitude: Joi.number().min(-180).max(180).allow(null),
      }).optional(),
      address: Joi.string().trim().min(5).max(300).optional(),
      categories: Joi.array().items(Joi.string().valid(...Object.values(STORE_CATEGORIES))).min(1).optional(),
      pickupAvailable: Joi.boolean().optional(),
      deliveryAvailable: Joi.boolean().optional(),
      panNumber: Joi.string().trim().uppercase().pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).optional()
        .messages({ 'string.pattern.base': 'Enter a valid PAN (e.g. ABCDE1234F)' }),
      gstRegistered: Joi.boolean().optional(),
      gstin: Joi.string().trim().uppercase().pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
        .when('gstRegistered', { is: true, then: Joi.required(), otherwise: Joi.allow('').optional() })
        .messages({ 'any.required': 'GSTIN is required when GST registered', 'string.pattern.base': 'Enter a valid 15-character GSTIN' }),
    });
  }

  static ValidateUpdate(data) {
    return this.update().validate(data, { abortEarly: false, stripUnknown: true });
  }
}

module.exports = storeProfileValidation;
