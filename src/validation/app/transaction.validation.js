const Joi = require('joi');

class transactionValidation {
  static dispute() {
    return Joi.object({
      reason: Joi.string().trim().max(1000).required(),
    });
  }

  static ValidateDispute(data) {
    return this.dispute().validate(data, { abortEarly: false, stripUnknown: true });
  }
}

module.exports = transactionValidation;