const Joi = require('joi');
const { PROJECT_TYPES, PROJECT_STATES } = require('../../constants/project.constants');

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
  static update() {
    return Joi.object({
      name: Joi.string().trim().min(2).max(150),
      type: Joi.string().valid(...PROJECT_TYPES),
      location: Joi.string().trim().min(2).max(150),
      expectedCompletion: Joi.date().iso().allow(null),
      materialsRequired: Joi.number().integer().min(0),
      status: Joi.string().valid(...Object.values(PROJECT_STATES)),
    }).min(1).messages({ 'object.min': 'Nothing to update' });
  }
  static ValidateCreate(data) { return this.create().validate(data, { abortEarly: false, stripUnknown: true }); }
  static ValidateUpdate(data) { return this.update().validate(data, { abortEarly: false, stripUnknown: true }); }
}
module.exports = projectValidation;