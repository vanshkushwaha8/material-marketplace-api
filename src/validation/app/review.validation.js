const Joi = require('joi');

class reviewValidation {
  static create() {
    return Joi.object({
      rating: Joi.number().integer().min(1).max(5).required(),
      comment: Joi.string().trim().max(1000).allow('').optional(),
    });
  }
  static ValidateCreate(data) { return this.create().validate(data, { abortEarly: false, stripUnknown: true }); }
}
module.exports = reviewValidation;