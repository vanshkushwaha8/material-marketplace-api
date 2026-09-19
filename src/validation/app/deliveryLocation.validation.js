const Joi = require('joi');

class deliveryLocationValidation {
  static create() {
    return Joi.object({
      label: Joi.string().trim().max(60).required(),
      address: Joi.string().trim().max(300).required(),
      isDefault: Joi.boolean().optional(),
    });
  }

  static update() {
    return Joi.object({
      label: Joi.string().trim().max(60),
      address: Joi.string().trim().max(300),
      isDefault: Joi.boolean(),
    }).min(1);
  }

  static ValidateCreate(data) {
    return this.create().validate(data, { abortEarly: false, stripUnknown: true });
  }

  static ValidateUpdate(data) {
    return this.update().validate(data, { abortEarly: false, stripUnknown: true });
  }
}

module.exports = deliveryLocationValidation;
