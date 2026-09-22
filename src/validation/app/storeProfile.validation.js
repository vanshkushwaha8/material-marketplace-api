const Joi = require('joi');
const { INDIAN_STATES, INDIA_LAT_RANGE, INDIA_LNG_RANGE } = require('../../constants/indianStates.constants');

class storeProfileValidation {
  static update() {
    return Joi.object({
      storeName: Joi.string().trim().min(2).max(150).optional(),
      // Admin-managed collections — IDs only. Existence + active state
      // checked in storeProfile.service.js before anything is written.
      businessTypeId: Joi.string().pattern(/^[a-fA-F0-9]{24}$/).optional()
        .messages({ 'string.pattern.base': 'Invalid business type' }),
      location: Joi.object({
        city: Joi.string().trim().min(2).max(100).required(),
        state: Joi.string().trim().valid(...INDIAN_STATES).required()
          .messages({ 'any.only': 'Select a valid Indian state' }),
        pincode: Joi.string().trim().pattern(/^[1-9][0-9]{5}$/).allow('')
          .messages({ 'string.pattern.base': 'Enter a valid 6-digit pincode' }),
        area: Joi.string().trim().allow(''),
        latitude: Joi.number().min(INDIA_LAT_RANGE[0]).max(INDIA_LAT_RANGE[1]).allow(null),
        longitude: Joi.number().min(INDIA_LNG_RANGE[0]).max(INDIA_LNG_RANGE[1]).allow(null),
      }).optional(),
      address: Joi.string().trim().min(5).max(300).optional(),
      addressMeta: Joi.object({
        formattedAddress: Joi.string().trim().allow('').optional(),
        postalCode: Joi.string().trim().allow('').optional(),
        country: Joi.string().trim().allow('').optional(),
      }).optional(),
      categoryIds: Joi.array().items(Joi.string().pattern(/^[a-fA-F0-9]{24}$/)).min(1).optional()
        .messages({ 'array.min': 'Select at least one category you sell' }),
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
