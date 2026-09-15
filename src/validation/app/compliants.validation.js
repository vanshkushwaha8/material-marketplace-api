const Joi = require("joi");
const objectIdPattern = /^[a-fA-F0-9]{24}$/;
class compliantsValidations {
    static addSchema = Joi.object({
        subject: Joi.string()
            .required()
            .messages({
                'string.empty': 'Subject is required.',
                'any.required': 'Subject is required.'
            }),
        description: Joi.string()
            .required()
            .messages({
                'string.empty': 'description is required.',
                'any.required': 'description is required.'
            }),

        categoryId: Joi.string()
            .pattern(objectIdPattern)
            .required()
            .messages({
                "string.empty": "categoryId is required",
                "any.required": "categoryId is required",
                "string.pattern.base":
                    "Invalid categoryId format. Must be a valid MongoDB ObjectId",
            }),
    });

    static updateSchema = Joi.object({
        _id: Joi.string()
            .pattern(objectIdPattern)
            .required()
            .messages({
                "string.empty": "_id is required",
                "any.required": "_id is required",
                "string.pattern.base":
                    "Invalid _id format. Must be a valid MongoDB ObjectId",
            }),

        subject: Joi.string()
            .required()
            .messages({
                'string.empty': 'Subject is required.',
                'any.required': 'Subject is required.'
            }),
        description: Joi.string()
            .required()
            .messages({
                'string.empty': 'description is required.',
                'any.required': 'description is required.'
            }),

        categoryId: Joi.string()
            .pattern(objectIdPattern)
            .required()
            .messages({
                "string.empty": "categoryId is required",
                "any.required": "categoryId is required",
                "string.pattern.base":
                    "Invalid categoryId format. Must be a valid MongoDB ObjectId",
            }),
    })

    static validateAdd(data) {
        return this.addSchema.validate(data, {
            abortEarly: false,
            allowUnknown: false,
        });
    }

    static validateUpdate(data) {
        return this.updateSchema.validate(data, {
            abortEarly: false,
            allowUnknown: false,
        });
    }
}

module.exports = compliantsValidations;