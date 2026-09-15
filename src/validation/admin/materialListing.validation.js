const Joi = require("joi");

class materialListingAdminValidation {
  static decision() {
    return Joi.object({
      decision: Joi.string().valid('VERIFY', 'REJECT').required(),
      note: Joi.string().trim().max(1000).allow(''),
    });
  }

  static statusChange() {
    return Joi.object({
      status: Joi.string().valid('LIVE', 'PAUSED', 'REJECTED', 'ARCHIVED').required(),
      reason: Joi.string().trim().max(1000).allow(''),
    });
  }

  static ValidateDecision(data) {
    return this.decision().validate(data, { abortEarly: false, stripUnknown: true });
  }

  static ValidateStatusChange(data) {
    return this.statusChange().validate(data, { abortEarly: false, stripUnknown: true });
  }
}

module.exports = materialListingAdminValidation;
