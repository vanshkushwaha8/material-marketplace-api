const Joi = require('joi');

class auditLogBulkExportValidation {
  static createJob() {
    return Joi.object({
      filters: Joi.object({
        search: Joi.string().trim().allow('').max(200),
        action: Joi.string().trim().allow('').max(2000),
        category: Joi.string().trim().allow('').max(500),
        role: Joi.string().trim().allow('').max(500),
        startDate: Joi.string().trim().allow(''),
        endDate: Joi.string().trim().allow(''),
      }).default({}),
    });
  }

  static validateCreateJob(data) {
    return this.createJob().validate(data, { abortEarly: false, stripUnknown: true });
  }
}

module.exports = auditLogBulkExportValidation;
