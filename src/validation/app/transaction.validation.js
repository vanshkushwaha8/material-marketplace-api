const Joi = require('joi');

class transactionValidation {
  // Checkout: delivery (with address) or store pickup, plus who to call.
  static fulfilment() {
    return Joi.object({
      method: Joi.string().valid('DELIVERY', 'PICKUP').required(),
      // One of the buyer's saved addresses — the server reads its text and
      // map point from there and prices delivery itself.
      addressId: Joi.string().pattern(/^[a-fA-F0-9]{24}$/)
        .when('method', { is: 'DELIVERY', then: Joi.required(), otherwise: Joi.optional().allow('', null) })
        .messages({ 'any.required': 'Choose a delivery address', 'string.pattern.base': 'Choose a delivery address' }),
      contactName: Joi.string().trim().min(2).max(80).required(),
      contactPhone: Joi.string().trim().pattern(/^(\+91[\s-]?)?[6-9]\d{9}$/).required()
        .messages({ 'string.pattern.base': 'Enter a valid 10-digit mobile number' }),
      note: Joi.string().trim().max(300).allow(''),
    });
  }

  static ValidateFulfilment(data) {
    return this.fulfilment().validate(data, { abortEarly: false, stripUnknown: true });
  }

  static dispute() {
    return Joi.object({
      reason: Joi.string().trim().max(1000).required(),
    });
  }

  static handover() {
    return Joi.object({
      note: Joi.string().trim().max(1000).allow(''),
      // Uploaded beforehand via the existing generic upload endpoint —
      // this only records the resulting references, never a file body.
      evidence: Joi.array().items(Joi.object({
        url: Joi.string().uri().required(),
        storageKey: Joi.string().required(),
        mimeType: Joi.string().allow(''),
      })).max(12),
    });
  }

  static ValidateDispute(data) {
    return this.dispute().validate(data, { abortEarly: false, stripUnknown: true });
  }

  static ValidateHandover(data) {
    return this.handover().validate(data, { abortEarly: false, stripUnknown: true });
  }
}

module.exports = transactionValidation;