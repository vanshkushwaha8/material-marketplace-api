const Joi = require('joi');

// Map point of the address (LocationPicker: "use current location" or an
// address suggestion) — what the delivery charge's distance is measured to.
// Optional so older text-only addresses keep working for anything but
// priced delivery.
const point = {
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  city: Joi.string().trim().max(80).allow(''),
  state: Joi.string().trim().max(80).allow(''),
  pincode: Joi.string().trim().pattern(/^\d{6}$/).allow(''),
};

class deliveryLocationValidation {
  static create() {
    return Joi.object({
      label: Joi.string().trim().max(60).required(),
      address: Joi.string().trim().max(300).required(),
      isDefault: Joi.boolean().optional(),
      ...point,
    }).and('latitude', 'longitude');
  }

  static update() {
    return Joi.object({
      label: Joi.string().trim().max(60),
      address: Joi.string().trim().max(300),
      isDefault: Joi.boolean(),
      ...point,
    }).min(1).and('latitude', 'longitude');
  }

  static ValidateCreate(data) {
    return this.create().validate(data, { abortEarly: false, stripUnknown: true });
  }

  static ValidateUpdate(data) {
    return this.update().validate(data, { abortEarly: false, stripUnknown: true });
  }
}

module.exports = deliveryLocationValidation;
