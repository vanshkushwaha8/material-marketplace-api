const Joi = require('joi');

class requirementValidation {
  static create() {
    return Joi.object({
      material: Joi.string().trim().min(2).max(150).required(),
      quantity: Joi.string().trim().min(1).max(50).required(),
      spec: Joi.string().trim().max(200).allow('').optional(),
      deliveryLocation: Joi.string().trim().min(2).max(150).required(),
    });
  }
  static respond() {
    return Joi.object({
      message: Joi.string().trim().min(5).max(1000).required(),
      quotedPrice: Joi.number().min(0).optional(),
      quotedQuantity: Joi.string().trim().max(50).allow('').optional(),
    });
  }
  static ValidateCreate(data) { return this.create().validate(data, { abortEarly: false, stripUnknown: true }); }
  static ValidateRespond(data) { return this.respond().validate(data, { abortEarly: false, stripUnknown: true }); }
}
module.exports = requirementValidation;