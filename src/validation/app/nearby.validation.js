const Joi = require('joi');
const { SELLER_TYPES } = require('../../constants/sellerType.constants');

// Radius is bounded on the server regardless of what the UI offers — an
// unbounded $geoNear over every seller in the country is a cheap DoS.
const MIN_RADIUS_KM = 0.5;
const MAX_RADIUS_KM = 100;

class nearbyValidation {
  static sellers() {
    return Joi.object({
      lat: Joi.number().min(-90).max(90).required()
        .messages({ 'any.required': 'lat is required', 'number.base': 'lat must be a number' }),
      lng: Joi.number().min(-180).max(180).required()
        .messages({ 'any.required': 'lng is required', 'number.base': 'lng must be a number' }),
      radiusKm: Joi.number().min(MIN_RADIUS_KM).max(MAX_RADIUS_KM).default(5)
        .messages({ 'number.min': `radiusKm must be at least ${MIN_RADIUS_KM}`, 'number.max': `radiusKm can be at most ${MAX_RADIUS_KM}` }),
      sellerType: Joi.string().valid(...Object.values(SELLER_TYPES)).empty('').optional(),
      category: Joi.string().pattern(/^[a-fA-F0-9]{24}$/).empty('').optional()
        .messages({ 'string.pattern.base': 'category must be a valid id' }),
      minRating: Joi.number().min(1).max(5).empty('').optional(),
      page: Joi.number().integer().min(1).max(50).default(1),
      limit: Joi.number().integer().min(1).max(50).default(20),
    });
  }

  static ValidateSellers(query) {
    return this.sellers().validate(query, { abortEarly: false, stripUnknown: true });
  }
}

module.exports = nearbyValidation;
module.exports.MAX_RADIUS_KM = MAX_RADIUS_KM;
