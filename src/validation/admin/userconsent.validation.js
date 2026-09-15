const Joi = require("joi");

// Content is now one object holding both translations, since a single
// version record carries both languages. Both are required so a version
// can never be created "half-translated" — the admin fills in both while
// creating/editing that one version.
const contentSchema = Joi.object({
    en: Joi.string().trim().required().messages({
        "any.required": "English content is required",
        "string.empty": "English content is required",
    }),
    fr: Joi.string().trim().required().messages({
        "any.required": "French content is required",
        "string.empty": "French content is required",
    }),
}).required().messages({
    "any.required": "Content is required",
});

class userConsentValidation {
    static add() {
        return Joi.object({
            type: Joi.string()
                .valid("TERMS", "COOKIE", "PRIVACY")
                .required()
                .messages({
                    "any.required": "Type is required",
                    "any.only": "Type must be TERMS, COOKIE, or PRIVACY",
                    "string.empty": "Type is required",
                }),

            // Which user type this consent applies to — Investor,
            // Developer, or 'all' (universal, e.g. a cookie policy that
            // genuinely applies platform-wide). Optional: omitting it
            // defaults to 'all' server-side, matching the schema default
            // and preserving the exact old type-wide behaviour for any
            // caller that hasn't been updated to send this yet.
            userType: Joi.string()
                .valid("Buyer", "Seller", "all")
                .optional()
                .messages({
                    "any.only": "userType must be Investor, Developer, or all",
                }),

            version: Joi.string()
                .trim()
                .required()
                .messages({
                    "any.required": "Version is required",
                    "string.empty": "Version is required",
                }),

            content: contentSchema,

            startDate: Joi.date()
                .required()
                .messages({
                    "any.required": "Start date is required",
                    "date.base": "Start date must be a valid date",
                }),

            endDate: Joi.date()
                .allow(null)
                .greater(Joi.ref("startDate"))
                .optional()
                .messages({
                    "date.base": "End date must be a valid date",
                    "date.greater": "End date must be greater than start date",
                }),


        });
    }
    static update() {
        return Joi.object({
            _id: Joi.string()
                .pattern(/^[a-fA-F0-9]{24}$/)
                .required()
                .messages({
                    'string.empty': '_id ID is required',
                    'string.pattern.base': 'Invalid _id ID format. Must be a valid MongoDB ObjectId'
                }),
            type: Joi.string()
                .valid("TERMS", "COOKIE", "PRIVACY")
                .required()
                .messages({
                    "any.required": "Type is required",
                    "any.only": "Type must be TERMS, COOKIE, or PRIVACY",
                    "string.empty": "Type is required",
                }),

            userType: Joi.string()
                .valid("Buyer", "Seller", "all")
                .optional()
                .messages({
                    "any.only": "userType must be Investor, Developer, or all",
                }),

            version: Joi.string()
                .trim()
                .required()
                .messages({
                    "any.required": "Version is required",
                    "string.empty": "Version is required",
                }),

            content: contentSchema,

            startDate: Joi.date()
                .required()
                .messages({
                    "any.required": "Start date is required",
                    "date.base": "Start date must be a valid date",
                }),

            endDate: Joi.date()
                .allow(null)
                .greater(Joi.ref("startDate"))
                .optional()
                .messages({
                    "date.base": "End date must be a valid date",
                    "date.greater": "End date must be greater than start date",
                }),
            status: Joi.string()
                .valid("active", "inactive")
                .optional()
                .messages({
                    "any.only": "Status must be active or inactive",
                }),
        });
    }

    static validateadd(data) {
        return userConsentValidation.add().validate(data, {
            abortEarly: false,
        });
    }
    static validatUpdate(data) {
        return userConsentValidation.update().validate(data, {
            abortEarly: false,
        });
    }
}

module.exports = userConsentValidation;