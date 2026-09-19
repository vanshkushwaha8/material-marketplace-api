const Joi = require('joi');

class paymentValidation {
  static verify() {
    return Joi.object({
      providerOrderId: Joi.string().trim().min(1).max(200).required(),
      providerPaymentId: Joi.string().trim().min(1).max(200).required(),
      signature: Joi.string().trim().min(1).max(500).required(),
    });
  }

  static ValidateVerify(data) {
    return this.verify().validate(data, { abortEarly: false, stripUnknown: true });
  }
}

module.exports = paymentValidation;
