const Joi = require("joi");
const PERMISSIONSCONSTANTS = require("../../constants/permission.constant");
const ALLOWED_PERMISSIONS = Object.values(PERMISSIONSCONSTANTS).flatMap((group) =>
    Object.values(group)
);
class PermissionValidation {
    static add = Joi.object({
        moduleId: Joi.string()
            .pattern(/^[a-fA-F0-9]{24}$/)
            .required()
            .messages({
                "string.empty": "moduleId is required",
                "string.pattern.base": "Invalid moduleId ID format. Must be a valid MongoDB ObjectId",
            }),

        modulePermission: Joi.string()
            .valid(...ALLOWED_PERMISSIONS)
            .required()
            .messages({
                "string.empty": "modulePermission is required",
                "any.required": "modulePermission is required",
                "any.only": `modulePermission must be one of: ${ALLOWED_PERMISSIONS.join(", ")}`,
            }),

        moduleDisplayPermission: Joi.string()
            .min(1)
            .max(70)
            .required()
            .messages({
                "string.empty": "moduleDisplayPermission is required",
                "string.min": "moduleDisplayPermission must be at least 1 character",
                "string.max": "moduleDisplayPermission cannot exceed 70 characters",
            }),
    });

    static update = Joi.object({
        _id: Joi.string()
            .pattern(/^[a-fA-F0-9]{24}$/)
            .required()
            .messages({
                "string.empty": "_id is required",
                "string.pattern.base": "Invalid _id ID format. Must be a valid MongoDB ObjectId",
            }),

        moduleId: Joi.string()
            .pattern(/^[a-fA-F0-9]{24}$/)
            .required()
            .messages({
                "string.empty": "moduleId is required",
                "string.pattern.base": "Invalid moduleId ID format. Must be a valid MongoDB ObjectId",
            }),

        modulePermission: Joi.string()
            .valid(...ALLOWED_PERMISSIONS)
            .required()
            .messages({
                "string.empty": "modulePermission is required",
                "any.required": "modulePermission is required",
                "any.only": `modulePermission must be one of: ${ALLOWED_PERMISSIONS.join(", ")}`,
            }),

        moduleDisplayPermission: Joi.string()
            .min(1)
            .max(70)
            .required(),
    });

    static validateAdd(data) {
        return this.add.validate(data, { abortEarly: false });
    }

    static validateUpdate(data) {
        return this.update.validate(data, { abortEarly: false });
    }
}

module.exports = PermissionValidation;