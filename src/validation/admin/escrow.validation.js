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

  // Delivery vehicle class. code is fixed once created (orders snapshot it);
  // maxPayloadKg null = no payload figure (never auto-recommended).
  static vehicleType({ create }) {
    const req = (schema) => (create ? schema.required() : schema.optional());
    return Joi.object({
      code: create ? Joi.string().trim().uppercase().pattern(/^[A-Z0-9_]{2,40}$/).required()
        .messages({ 'string.pattern.base': 'Code: 2–40 capital letters, digits or _' }) : Joi.forbidden(),
      name: req(Joi.string().trim().min(2).max(60)),
      description: Joi.string().trim().max(200).allow(''),
      maxPayloadKg: Joi.number().min(0).max(200000).allow(null),
      autoRecommend: Joi.boolean(),
      sortOrder: Joi.number().integer().min(0).max(100000),
      active: Joi.boolean(),
      reason: Joi.string().trim().max(500).allow(''),
    }).min(1);
  }

  static ValidateVehicleType(b, opts) { return this.vehicleType(opts).validate(b, { abortEarly: false, stripUnknown: true }); }
}
module.exports = adminEscrowValidation;
