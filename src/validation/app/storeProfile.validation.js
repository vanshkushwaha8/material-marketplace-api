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
    });
  }

  static ValidateUpdate(data) {
    return this.update().validate(data, { abortEarly: false, stripUnknown: true });
  }
}

module.exports = storeProfileValidation;
