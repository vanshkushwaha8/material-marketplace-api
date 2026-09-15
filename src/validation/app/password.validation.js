const Joi = require('joi');
const { isPasswordSimilarToUserInfo } = require('../../utils/passwordSimilarity');
class passwordValidation {


    static get passwordRule() {
        return Joi.string()
            .min(12)
            .max(64)
            .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/)
            .messages({
                'string.empty': 'Password is required',
                'string.min': 'Password must be at least 12 characters long.',
                'string.max': 'Password must be at most 64 characters long.',
                'string.pattern.base': 'Password must include an uppercase letter, a lowercase letter, a number, and a special character.'
            })
    }

    static get passwordRuleRequired() {
        return this.passwordRule.required().messages({
            'any.required': 'Password is required'
        });
    }

    static login() {
        return Joi.object({
            email: Joi.alternatives()
                .try(
                    Joi.string().email().messages({
                        'string.email': 'Must be a valid email address'
                    }),
                    Joi.string().pattern(/^\+?[\d\s\-\(\)]{10,}$/, 'i').messages({
                        'string.pattern.base': 'Must be a valid phone number'
                    })
                )
                .required()
                .messages({
                    'alternatives.any': 'Email or phone number is required',
                    'alternatives.base': 'Must be a valid email or phone number'
                }),
            password: Joi.string()
                .required()
                .messages({
                    'string.empty': 'Password is required',
                    'string.base': 'Password must be a string'
                })
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
            password: this.passwordRuleRequired
        });
    }
    static resend() {
        return Joi.object({
            userId: Joi.string()
                .pattern(/^[a-fA-F0-9]{24}$/)
                .required()
                .messages({
                    'string.empty': 'User ID is required',
                    'string.pattern.base': 'Invalid User ID format. Must be a valid MongoDB ObjectId'
                }),
        });
    }

    static changePassword() {
        return Joi.object({
            oldPassword: this.passwordRuleRequired,
            newPassword: this.passwordRuleRequired,
        })
    }
    static setPassword() {
        return Joi.object({
            newPassword: this.passwordRuleRequired,
        })
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

    static verifyEmail() {
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

    static resetPassword() {
        return Joi.object({
            token: Joi.string()
                .required()
                .messages({
                    'string.empty': 'Reset token is required.',
                    'any.required': 'Reset token is required.'
                }),
            newPassword: this.passwordRuleRequired
        })
    }
    static validateResetPassword(data) {
        return this.resetPassword().validate(data, { abortEarly: false });
    }
    static validateResendVerification(data) {
        return this.resend().validate(data, { abortEarly: false });
    }


    static validateForgetPassword(data) {
        return this.forgetPassword().validate(data, { abortEarly: false });
    }
    static validateChangePassword(data) {
        return this.changePassword().validate(data, { abortEarly: false });
    }
    static validateSetPassword(data) {
        return this.setPassword().validate(data, { abortEarly: false });
    }
    static validateEmailVerify(data) {
        return this.verifyEmail().validate(data, { abortEarly: false });
    }
    static validateSendOtp(data) {
        return this.sendOtp().validate(data, { abortEarly: false });
    }



}

module.exports = passwordValidation;