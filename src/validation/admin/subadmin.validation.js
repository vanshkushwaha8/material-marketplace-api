const Joi = require("joi");
class subAdminValidation {
    static addSchema = Joi.object({
        profilePicture: Joi.string()
            .optional()
            .allow(''),
        roleId: Joi.string()
            .pattern(/^[a-fA-F0-9]{24}$/)
            .required()
            .messages({
                "string.empty": "roleId is required",
                "string.pattern.base":
                    "Invalid roleId ID format. Must be a valid MongoDB ObjectId",
            }),
        fullName: Joi.string()
            .min(1)
            .max(30)
            .required()
            .messages({
                'string.empty': 'fullName is required',
            }),
      
        email: Joi.string()
            .trim()
            .lowercase()
            .email()
            .required()
            .messages({
                'string.email': 'Email must be a valid email address.',
                'string.empty': 'Email is required.',
                'any.required': 'Email is required.'
            }),
       
    });

    static updateSchema = Joi.object({
        _id: Joi.string()
            .pattern(/^[a-fA-F0-9]{24}$/)
            .required()
            .messages({
                "string.empty": "_id is required",
                "string.pattern.base":
                    "Invalid _id ID format. Must be a valid MongoDB ObjectId",
            }),
             fullName: Joi.string()
            .min(1)
            .max(30)
            .required()
            .messages({
                'string.empty': 'fullName is required',
            }),


        roleId: Joi.string()
            .pattern(/^[a-fA-F0-9]{24}$/)
            .required()
            .messages({
                "string.empty": "roleId is required",
                "string.pattern.base":
                    "Invalid roleId ID format. Must be a valid MongoDB ObjectId",
            }),
        profilePicture: Joi.string()
            .optional()
            .allow(''),
    
        email: Joi.string()
            .trim()
            .lowercase()
            .email()
            .required()
            .messages({
                'string.email': 'Email must be a valid email address.',
                'string.empty': 'Email is required.',
                'any.required': 'Email is required.'
            }),
      
    });

    static validateAdd(data) {
        return this.addSchema.validate(data, { abortEarly: false });
    }

    static validateUpdate(data) {
        return this.updateSchema.validate(data, { abortEarly: false });
    }
}

module.exports = subAdminValidation;