const Joi = require('joi');

class bankAccountValidation {
  static link() {
    return Joi.object({
      accountHolderName: Joi.string().trim().min(2).max(120).required(),
      bankName: Joi.string().trim().min(2).max(120).required(),
      accountNumber: Joi.string().trim().pattern(/^[0-9]{9,18}$/).required(),
      ifsc: Joi.string().trim().pattern(/^[A-Za-z]{4}0[A-Z0-9]{6}$/).required(),
    });
  }
  static ValidateLink(data) { return this.link().validate(data, { abortEarly: false, stripUnknown: true }); }
}
module.exports = bankAccountValidation;