const Joi = require('joi');

class businessTypeValidation {
  static create() {
    return Joi.object({
      name: Joi.string().trim().min(2).max(100).required(),
      slug: Joi.string().trim().lowercase().pattern(/^[a-z0-9-]+$/).required()
        .messages({ 'string.pattern.base': 'Slug may only contain lowercase letters, numbers and hyphens' }),
      sortOrder: Joi.number().integer().default(0),
      status: Joi.string().valid('active', 'inactive').default('active'),
    });
  }

  static update() {
    return this.create().fork(['name', 'slug'], (schema) => schema.optional());
  }

  static ValidateCreate(data) {
    return this.create().validate(data, { abortEarly: false, stripUnknown: true });
  }

  static ValidateUpdate(data) {
    return this.update().validate(data, { abortEarly: false, stripUnknown: true });
  }
}

module.exports = businessTypeValidation;
