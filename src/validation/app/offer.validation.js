const Joi = require("joi");
const { OFFER_STATES } = require('../../constants/offer.constants');

const objectId = () =>
  Joi.string()
    .pattern(/^[a-fA-F0-9]{24}$/)
    .messages({
      'string.pattern.base': 'Must be a valid MongoDB ObjectId',
    });

class offerValidation {
  static create() {
    return Joi.object({
      listing: objectId().required(),

      // Optional project linked to this offer.
      // Allows null when the buyer is not purchasing for a project.
      project: objectId().optional().allow(null),

      amount: Joi.number().positive().required(),

      quantity: Joi.number().positive().required(),

      message: Joi.string()
        .trim()
        .max(500)
        .allow(''),
    });
  }

  // Buy Now (store listings): the amount is never client-supplied — the
  // server prices it from the listing.
  static buyNow() {
    return Joi.object({
      listing: objectId().required(),
      project: objectId().optional().allow(null),
      quantity: Joi.number().integer().min(1).required(),
    });
  }

  static ValidateBuyNow(data) {
    return this.buyNow().validate(data, { abortEarly: false, stripUnknown: true });
  }

  static respond() {
    // action=ACCEPT needs nothing else; COUNTER needs amount;
    // REJECT/CANCEL take an optional message.
    // Kept as one schema since the controller already branches
    // on `action` before calling the service.
    return Joi.object({
      action: Joi.string()
        .valid(
          'ACCEPT',
          'COUNTER',
          'REJECT',
          'CANCEL'
        )
        .required(),

      amount: Joi.number()
        .positive()
        .when('action', {
          is: 'COUNTER',
          then: Joi.required(),
          otherwise: Joi.optional(),
        }),

      message: Joi.string()
        .trim()
        .max(500)
        .allow(''),
    });
  }

  static list() {
    return Joi.object({
      view: Joi.string().valid('action', 'waiting', 'accepted', 'closed').empty(''),
      status: Joi.string().valid(...Object.values(OFFER_STATES)).empty(''),
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
    });
  }

  static ValidateList(query) {
    return this.list().validate(query, { abortEarly: false, stripUnknown: true });
  }

  static ValidateCreate(data) {
    return this.create().validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });
  }

  static ValidateRespond(data) {
    return this.respond().validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });
  }
}

module.exports = offerValidation;