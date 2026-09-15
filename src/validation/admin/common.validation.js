const Joi = require("joi");

class commonValidation {
    static query() {
        return Joi.object({
            _id: Joi.string()
                .pattern(/^[a-fA-F0-9]{24}$/)
                .optional()
                .messages({
                    'string.empty': '_id ID is required',
                    'string.pattern.base': 'Invalid _id ID format. Must be a valid MongoDB ObjectId'
                }),
            search: Joi.string().optional().allow(''),
            page: Joi.number().optional(),
            limit: Joi.number().optional(),
            type: Joi.string()
                .valid("TERMS", "COOKIE", "PRIVACY")
                .optional()
                .allow('')
                .messages({
                    "any.only": "Type must be TERMS, COOKIE, PRIVACY",
                }),
            status: Joi.string()
                .valid("active", "inactive",)
                .optional()
                .allow('')
                .messages({
                    "any.only": "Type must be active or inactive",
                }),
                sortBy:Joi.string().optional().allow(''),
                sortOrder:Joi.string().optional().allow(''),
                // Optional consent-list filter — Investor / Developer / 'all'.
                // Was missing entirely, so any request that included it was
                // rejected outright by Joi's default "unknown keys aren't
                // allowed" behaviour, producing exactly "userType is not
                // allowed".
                userType: Joi.string()
                    .valid("Buyer", "Seller", "all")
                    .optional()
                    .allow('')
                    .messages({
                        "any.only": "userType must be Investor, Developer, or all",
                    }),

        });
    }
    static validateForgetquery(data) {
        return this.query().validate(data, { abortEarly: false });
    }
}

module.exports = commonValidation;