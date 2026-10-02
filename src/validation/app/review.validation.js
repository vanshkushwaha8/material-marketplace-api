const Joi = require('joi');

// Only rating + comment are ever accepted from the client. Ownership
// (reviewer / seller / order) is derived server-side; stripUnknown drops
// any buyerId/sellerId/orderId a client tries to send.
const ratingField = Joi.number().integer().min(1).max(5).required().messages({
  'number.base': 'Rating must be a number from 1 to 5',
  'number.integer': 'Rating must be a whole number of stars',
  'number.min': 'Rating must be at least 1 star',
  'number.max': 'Rating cannot be more than 5 stars',
  'any.required': 'Please choose a star rating',
});

class reviewValidation {
  static create() {
    return Joi.object({
      rating: ratingField,
      comment: Joi.string().trim().max(1000).allow('').optional(),
    });
  }
  static list() {
    return Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(50).default(10),
    });
  }
  static ValidateCreate(data) { return this.create().validate(data, { abortEarly: false, stripUnknown: true }); }
  static ValidateUpdate(data) { return this.create().validate(data, { abortEarly: false, stripUnknown: true }); }
  static ValidateList(data) { return this.list().validate(data, { abortEarly: false, stripUnknown: true }); }
}
module.exports = reviewValidation;
