const Joi = require('joi');
const { PROJECT_TYPES } = require('../../constants/project.constants');

class projectValidation {
  static create() {
    return Joi.object({
      name: Joi.string().trim().min(2).max(150).required(),
      type: Joi.string().valid(...PROJECT_TYPES).default('Other'),
      location: Joi.string().trim().min(2).max(150).required(),
      expectedCompletion: Joi.date().iso().optional().allow(null),
      materialsRequired: Joi.number().min(0).default(0),
    });
  }
  static ValidateCreate(data) { return this.create().validate(data, { abortEarly: false, stripUnknown: true }); }
}
module.exports = projectValidation;