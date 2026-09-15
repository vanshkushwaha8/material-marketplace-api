const Joi = require("joi");

class adminValidation {
    /**
     * Returns the login validation schema.
     * @returns {Joi.ObjectSchema}
     */

    static get passwordRule() {
        return Joi.string()
            .min(12)
            .max(64)
            .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/)
            .optional()
            .messages({
                'string.empty': 'Password is required',
                'string.min': 'Password must be at least 12 characters long.',
                'string.max': 'Password must be at most 64 characters long.',
                'string.pattern.base': 'Password must include an uppercase letter, a lowercase letter, a number, and a special character.'
            })
    }
    static login() {
        return Joi.object({
            email: Joi.string()
                .email({ tlds: { allow: false } })
                .pattern(/^[a-zA-Z0-9.]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
                .required()
                .messages({
                    "string.empty": "Email is required",
                    "string.email": "Please provide a valid email address",
                    "string.pattern.base": "Email must contain only letters, digits, and periods before @",
                }),
            password: Joi.string().required().messages({
                "string.empty": "Password is required",

            }),
        });
    }

    static sendOtp() {
        return Joi.object({
            email: Joi.string()
                .email({ tlds: { allow: false } })
                .pattern(/^[a-zA-Z0-9.]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
                .required()
                .messages({
                    "string.empty": "Email is required",
                    "string.email": "Please provide a valid email address",
                    "string.pattern.base": "Email must contain only letters, digits, and periods before @",
                }),
        });
    }
    static forgetPassword() {
        return Joi.object({
            userId: Joi.string()
                .pattern(/^[a-fA-F0-9]{24}$/)
                .required()
                .messages({
                    'string.empty': 'User ID is required',
                    'string.pattern.base': 'Invalid User ID format. Must be a valid MongoDB ObjectId'
                }),
            password: this.passwordRule
        });
    }

    static changePassword() {
        return Joi.object({
            oldPassword: this.passwordRule,
            newPassword: this.passwordRule
        });
    }
    /**
     * Validate user login data.
     * @param {Object} data - The user input data.
     * @returns {Object} - Validation result.
     */
    static validateLogin(data) {
        return adminValidation.login().validate(data, { abortEarly: false });
    }
    static validateForgetPassword(data) {
        return this.forgetPassword().validate(data, { abortEarly: false });
    }

    static validateChangePassword(data) {
        return this.changePassword().validate(data, { abortEarly: false });
    }
    static validateSendOtp(data) {
        return this.sendOtp().validate(data, { abortEarly: false });
    }
}

module.exports = adminValidation;
