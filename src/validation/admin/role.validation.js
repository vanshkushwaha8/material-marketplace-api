const Joi = require("joi");
const { ASSIGNABLE_ADMIN_PERMISSIONS } = require("../../constants/rbac.constants");

const objectId = (name) => Joi.string().pattern(/^[a-fA-F0-9]{24}$/).required().messages({
    "string.empty": `${name} is required`,
    "any.required": `${name} is required`,
    "string.pattern.base": `Invalid ${name}`,
});

const roleFields = {
    roleName: Joi.string().trim().min(2).max(50).required().messages({
        "string.empty": "Role name is required",
        "any.required": "Role name is required",
    }),
    description: Joi.string().trim().max(200).allow('').optional(),
    // Only catalog keys; reserved (Super Admin) keys are not in the list.
    permissions: Joi.array()
        .items(Joi.string().valid(...ASSIGNABLE_ADMIN_PERMISSIONS).messages({ "any.only": "Unknown permission: {#value}" }))
        .unique()
        .min(1)
        .required()
        .messages({
            "array.min": "Select at least one permission",
            "any.required": "Select at least one permission",
            "array.unique": "Duplicate permission",
        }),
};

class RoleValidation {
    static addSchema = Joi.object(roleFields);
    static updateSchema = Joi.object({ _id: objectId('_id'), ...roleFields });
    static idSchema = Joi.object({ _id: objectId('_id') });

    static validateAdd(data) {
        return this.addSchema.validate(data, { abortEarly: false, stripUnknown: true });
    }

    static validateUpdate(data) {
        return this.updateSchema.validate(data, { abortEarly: false, stripUnknown: true });
    }

    static validateId(data) {
        return this.idSchema.validate(data, { abortEarly: false, stripUnknown: true });
    }
}

module.exports = RoleValidation;
