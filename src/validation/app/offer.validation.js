const Joi = require("joi");

const objectId = () => Joi.string().pattern(/^[a-fA-F0-9]{24}$/).messages({
  'string.pattern.base': 'Must be a valid MongoDB ObjectId',
});

class offerValidation {
  static create() {
    return Joi.object({
      listing: objectId().required(),
      amount: Joi.number().positive().required(),
      quantity: Joi.number().positive().required(),
      message: Joi.string().trim().max(500).allow(''),
    });
  }

  static respond() {
    // action=ACCEPT needs nothing else; COUNTER needs amount; REJECT/CANCEL
    // take an optional message. Kept as one schema (rather than one per
    // action) since the controller already branches on `action` before
    // calling the service — this only needs to keep the union permissive.
    return Joi.object({
      action: Joi.string().valid('ACCEPT', 'COUNTER', 'REJECT', 'CANCEL').required(),
      amount: Joi.number().positive().when('action', { is: 'COUNTER', then: Joi.required(), otherwise: Joi.optional() }),
      message: Joi.string().trim().max(500).allow(''),
    });
  }

  static ValidateCreate(data) {
    return this.create().validate(data, { abortEarly: false, stripUnknown: true });
  }

  static ValidateRespond(data) {
    return this.respond().validate(data, { abortEarly: false, stripUnknown: true });
  }
}

module.exports = offerValidation;
