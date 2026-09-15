const Joi = require("joi");

class ModuleValidation {
    static addSchema = Joi.object({
        moduleName: Joi.string().min(1).max(50).required(),
        route: Joi.string().required(),
        moduleDisplayName: Joi.string().min(1).max(50).required(),
    });

    static updateSchema = Joi.object({
        _id: Joi.string().pattern(/^[a-fA-F0-9]{24}$/).required(),
        moduleName: Joi.string().min(1).max(50).required(),
        route: Joi.string().required(),
        moduleDisplayName: Joi.string().min(1).max(50).required(),
    });

    static statusSchema = Joi.object({
         _id: Joi.string()
                .pattern(/^[a-fA-F0-9]{24}$/)
                .required()
                .messages({
                    'string.empty': '_id is required',
                    'string.pattern.base': 'Invalid _id ID format. Must be a valid MongoDB ObjectId'
                }),
    });

    static validateAdd(data) {
        return this.addSchema.validate(data, { abortEarly: false });
    }

    static validateUpdate(data) {
        return this.updateSchema.validate(data, { abortEarly: false });
    }

    static validateStatus(data) {
        return this.statusSchema.validate(data, { abortEarly: false });
    }
}

module.exports = ModuleValidation;