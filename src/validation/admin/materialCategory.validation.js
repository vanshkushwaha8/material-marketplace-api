const Joi = require("joi");

const objectId = () => Joi.string().pattern(/^[a-fA-F0-9]{24}$/).messages({
  'string.pattern.base': 'Must be a valid MongoDB ObjectId',
});

class materialCategoryValidation {
  static create() {
    return Joi.object({
      name: Joi.string().trim().min(2).max(100).required(),
      slug: Joi.string().trim().lowercase().pattern(/^[a-z0-9-]+$/).required(),
      parentCategory: objectId().allow(null, ''),
      description: Joi.string().trim().max(500).allow(''),
      logo: Joi.string().trim().max(500).allow('').optional(),
      specFields: Joi.array().items(Joi.object({
        key: Joi.string().trim().pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/).required()
          .messages({ 'string.pattern.base': 'Key must start with a letter and contain only letters, numbers, underscores' }),
        label: Joi.string().trim().required(),
        type: Joi.string().valid('text', 'number', 'date').default('text'),
        required: Joi.boolean().default(true),
      })).default([]),
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

module.exports = materialCategoryValidation;
