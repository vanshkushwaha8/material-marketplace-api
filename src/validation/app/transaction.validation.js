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
      // Delivery only: the vehicle the buyer asks for (a vehicle_types code).
      // Optional — empty means "let the seller choose". The seller approves
      // or changes it when quoting.
      vehicleCode: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_]{2,40}$/).allow('', null),
    });
  }

  static ValidateFulfilment(data) {
    return this.fulfilment().validate(data, { abortEarly: false, stripUnknown: true });
  }

  // Seller's delivery quote. The charge is the seller's own delivery price
  // (whole paise); the reason is enforced in the service only when the
  // vehicle differs from the buyer's request.
  static deliveryQuote() {
    return Joi.object({
      vehicleCode: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_]{2,40}$/).required()
        .messages({ 'any.required': 'Choose a vehicle', 'string.pattern.base': 'Choose a vehicle' }),
      charge: Joi.number().min(0).max(10000000).precision(2).required()
        .messages({ 'any.required': 'Enter the delivery charge', 'number.min': 'Delivery charge cannot be negative' }),
      vehicleChangeReason: Joi.string().trim().max(500).allow(''),
      sellerNote: Joi.string().trim().max(500).allow(''),
    });
  }

  static deliveryDecline() {
    return Joi.object({ reason: Joi.string().trim().min(5).max(500).required() });
  }

  // Buyer accepts/rejects the exact quote version they were shown.
  static deliveryAnswer() {
    return Joi.object({
      version: Joi.number().integer().min(1).required(),
      reason: Joi.string().trim().max(500).allow(''),
    });
  }

  static ValidateDeliveryQuote(data) { return this.deliveryQuote().validate(data, { abortEarly: false, stripUnknown: true }); }
  static ValidateDeliveryDecline(data) { return this.deliveryDecline().validate(data, { abortEarly: false, stripUnknown: true }); }
  static ValidateDeliveryAnswer(data) { return this.deliveryAnswer().validate(data, { abortEarly: false, stripUnknown: true }); }

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