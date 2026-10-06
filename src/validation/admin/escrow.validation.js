const Joi = require('joi');
const { ADMIN_ACTIONS } = require('../../service/admin/escrow.service');
const { SELLER_TYPES } = require('../../constants/sellerType.constants');

class adminEscrowValidation {
  // Only action + reason (+ reference for manual resolutions). Amounts are
  // never accepted from the client — they come from the locked transaction.
  static action() {
    return Joi.object({
      action: Joi.string().valid(...Object.values(ADMIN_ACTIONS)).required(),
      reason: Joi.string().trim().min(5).max(500).required()
        .messages({ 'any.required': 'A reason is required for every payment action', 'string.min': 'Please give a reason of at least 5 characters' }),
      externalReference: Joi.string().trim().max(120).allow('').optional(),
      idempotencyKey: Joi.string().trim().max(100).optional(),
    });
  }

  static commission() {
    return Joi.object({
      sellerType: Joi.string().valid(...Object.values(SELLER_TYPES)).required(),
      pct: Joi.number().min(0).max(50).precision(2).required()
        .messages({ 'number.max': 'Commission cannot exceed 50%', 'number.min': 'Commission cannot be negative' }),
      reason: Joi.string().trim().min(5).max(500).required(),
    });
  }

  static ValidateAction(b) { return this.action().validate(b, { abortEarly: false, stripUnknown: true }); }
  static ValidateCommission(b) { return this.commission().validate(b, { abortEarly: false, stripUnknown: true }); }

  // Delivery rate card: charge = base + perKm × km + perKg × kg.
  static deliveryRates() {
    return Joi.object({
      baseCharge: Joi.number().min(0).max(100000).precision(2).required(),
      perKm: Joi.number().min(0).max(10000).precision(2).required(),
      perKg: Joi.number().min(0).max(10000).precision(2).required(),
      maxDistanceKm: Joi.number().min(1).max(2000).required(),
      reason: Joi.string().trim().min(5).max(500).required(),
    });
  }

  static ValidateDeliveryRates(b) { return this.deliveryRates().validate(b, { abortEarly: false, stripUnknown: true }); }
}
module.exports = adminEscrowValidation;
