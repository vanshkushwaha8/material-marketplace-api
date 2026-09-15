const Joi = require("joi");
const ADMIN_ONLY_ROLES = require("../../constants/adminRoles.constants");
class RoleValidation {
    static addSchema = Joi.object({
        roleName: Joi.string()
            .valid(...Object.values(ADMIN_ONLY_ROLES))
            .optional()
            .messages({
                'any.only': `roleName must be one of: ${Object.values(ADMIN_ONLY_ROLES).join(', ')}`,
            }),
        permissionIds: Joi.array()
            .items(
                Joi.string()
                    .pattern(/^[a-fA-F0-9]{24}$/)
                    .required()
                    .messages({
                        "string.empty": "permissionId is required",
                        "string.pattern.base":
                            "Invalid permissionId ID format. Must be a valid MongoDB ObjectId",
                    })
            )
            .min(1)
            .required()
            .messages({
                "array.base": "permissionIds must be an array",
                "array.min": "At least one permissionId is required",
                "any.required": "permissionIds are required",
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

        roleName: Joi.string()
            .valid(...Object.values(ADMIN_ONLY_ROLES))
            .optional()
            .messages({
                'any.only': `roleName must be one of: ${Object.values(ADMIN_ONLY_ROLES).join(', ')}`,
            }),

        permissionIds: Joi.array()
            .items(
                Joi.string()
                    .pattern(/^[a-fA-F0-9]{24}$/)
                    .required()
                    .messages({
                        "string.empty": "permissionId is required",
                        "string.pattern.base":
                            "Invalid permissionId ID format. Must be a valid MongoDB ObjectId",
                    })
            )
            .min(1)
            .required()
            .messages({
                "array.base": "permissionIds must be an array",
                "array.min": "At least one permissionId is required",
                "any.required": "permissionIds are required",
            }),
    });

    static validateAdd(data) {
        return this.addSchema.validate(data, { abortEarly: false });
    }

    static validateUpdate(data) {
        return this.updateSchema.validate(data, { abortEarly: false });
    }
}

module.exports = RoleValidation;