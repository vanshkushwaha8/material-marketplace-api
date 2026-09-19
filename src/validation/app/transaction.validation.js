const Joi = require('joi');

class transactionValidation {
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