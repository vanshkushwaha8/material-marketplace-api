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

  // Seller's handover declaration. Order-dependent rules (time not before
  // payment, quantity ≤ ordered) are checked in transaction.service.
  static handover() {
    return Joi.object({
      handedOverAt: Joi.date().iso().required()
        .messages({ 'any.required': 'Enter the handover date and time', 'date.base': 'Enter a valid handover date and time', 'date.format': 'Enter a valid handover date and time' }),
      quantity: Joi.number().positive().max(10000000).required()
        .messages({ 'any.required': 'Enter the quantity handed over', 'number.positive': 'Quantity must be more than 0' }),
      packageCount: Joi.number().integer().min(1).max(100000).allow(null),
      transporterName: Joi.string().trim().max(120).allow(''),
      vehicleNumber: Joi.string().trim().uppercase().max(20).pattern(/^[A-Z0-9\s-]*$/).allow('')
        .messages({ 'string.pattern.base': 'Vehicle number can contain only letters, digits, spaces and hyphens' }),
      challanNumber: Joi.string().trim().max(60).allow(''),
      note: Joi.string().trim().max(1000).allow(''),
      // Temp-upload filenames (apiUrls.singleImageUpload) — the server moves
      // them into private storage. Never a client-supplied URL.
      evidenceFiles: Joi.array().items(
        // Shape produced by image.service#uniqueName (images become .webp);
        // no path separators, so it can't point outside the temp folder.
        Joi.string().max(220).pattern(/^\d{10,13}_[a-f0-9]{8}___[^/\\\0]{0,180}\.(webp|pdf)$/)
          .messages({ 'string.pattern.base': 'Invalid evidence file' })
      ).max(6).unique(),
    });
  }

  // Buyer's explicit receipt confirmation: acknowledgement + every check.
  static confirmReceipt() {
    const tick = Joi.boolean().valid(true).required();
    return Joi.object({
      acknowledged: tick.messages({ 'any.only': 'Confirm that you have inspected and received the material', 'any.required': 'Confirm that you have inspected and received the material' }),
      checklist: Joi.object({
        materialMatches: tick, quantityMatches: tick, noVisibleDamage: tick, documentsChecked: tick,
      }).required().messages({ 'any.only': 'Tick every check before confirming — or report an issue instead', 'any.required': 'Tick every check before confirming — or report an issue instead' }),
    });
  }

  static ValidateConfirmReceipt(data) {
    return this.confirmReceipt().validate(data, { abortEarly: true, stripUnknown: true });
  }

  static ValidateDispute(data) {
    return this.dispute().validate(data, { abortEarly: false, stripUnknown: true });
  }

  static ValidateHandover(data) {
    return this.handover().validate(data, { abortEarly: false, stripUnknown: true });
  }
}

module.exports = transactionValidation;