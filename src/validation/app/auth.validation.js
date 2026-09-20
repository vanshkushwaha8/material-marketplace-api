const Joi = require('joi');
const { isPasswordSimilarToUserInfo } = require('../../utils/passwordSimilarity');
const { KNOWN_COUNTRY_CODES } = require('../../config/supportedCountries');
const { SELLER_TYPES } = require('../../constants/sellerType.constants');
const { BUSINESS_TYPES, STORE_CATEGORIES } = require('../../constants/storeProfile.constants');
class authValidation {
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

    static Register() {
        return Joi.object({
            profilePicture: Joi.string().allow('').optional(),
            userType: Joi.string()
                .trim()
                .empty('')
                .valid('Buyer', 'Seller')
                .required()
                .messages({
                    'any.required': 'userType is required',
                    'any.only': 'Invalid userType',
                }),
            fullName: Joi.string()
                .required()
                .messages({
                    'string.empty': 'Full name is required',
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
            password: this.passwordRuleRequired,
            phoneNumber: Joi.string()
                .required()
                .messages({
                    'string.empty': 'phoneNumber is required.',
                    'any.required': 'phoneNumber is required.'
                }),

            // BUILD MATERIAL only operates in India for Buyer and Seller
            // alike — neither registration form collects this anymore
            // (auth.service.js#register defaults it to 'IN'). Left
            // optional rather than removed outright in case it's ever
            // sent by another client.
            countryOfResidence: Joi.string()
                .uppercase()
                .valid(...KNOWN_COUNTRY_CODES)
                .optional()
                .messages({
                    'any.only': 'countryOfResidence must be a valid supported country code',
                }),
            // Seller-only — the Buyer registration form doesn't collect
            // this at all (no product need for it), matching how
            // `countryOfResidence` is scoped above.
            dob: Joi.string()
                .when('userType', { is: 'Seller', then: Joi.required(), otherwise: Joi.optional() })
                .custom((value, helpers) => {
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                        return helpers.error('dob.format');
                    }

                    const [year, month, day] = value.split('-').map(Number);
                    const dob = new Date(year, month - 1, day);

                    if (
                        dob.getFullYear() !== year ||
                        dob.getMonth() !== month - 1 ||
                        dob.getDate() !== day
                    ) {
                        return helpers.error('dob.invalid');
                    }

                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    if (dob > today) {
                        return helpers.error('dob.future');
                    }
                    const oldestAllowed = new Date(today);
                    oldestAllowed.setFullYear(today.getFullYear() - 120);

                    if (dob < oldestAllowed) {
                        return helpers.error('dob.tooOld');
                    }
                    const minDob = new Date(today);
                    minDob.setFullYear(today.getFullYear() - 18);

                    if (dob > minDob) {
                        return helpers.error('dob.underAge');
                    }

                    return value;
                })
                .messages({
                    'any.required': 'Date of birth is required',
                    'string.empty': 'Date of birth is required',
                    'dob.format': 'Date of birth must be in YYYY-MM-DD format',
                    'dob.invalid': 'Please enter a valid date of birth',
                    'dob.future': 'Date of birth cannot be in the future',
                    'dob.tooOld': 'Please enter a valid date of birth',
                    'dob.underAge': 'You must be at least 18 years old'
                }),
            // Seller-only sub-type — see sellerType.constants.js. Kept as
            // its own field, never merged with `userType`.
                        location: Joi.object({
                city: Joi.string().trim().required(),
                state: Joi.string().trim().required(),
                pincode: Joi.string().trim().required(),
                area: Joi.string().trim().allow('').optional(),
                latitude: Joi.number().optional(),
                longitude: Joi.number().optional(),
            }).required(),

            sellerType: Joi.string()
                .valid('INDIVIDUAL', 'BUSINESS_STORE')
                .when('userType', { is: 'Seller', then: Joi.required(), otherwise: Joi.forbidden() })
                .messages({ 'any.required': 'Seller type is required', 'any.only': 'Invalid seller type' }),

            storeName: Joi.string().trim()
                .when('sellerType', { is: 'BUSINESS_STORE', then: Joi.required(), otherwise: Joi.forbidden() }),
            businessType: Joi.string()
                .when('sellerType', { is: 'BUSINESS_STORE', then: Joi.required(), otherwise: Joi.forbidden() }),
            storeAddress: Joi.string().trim()
                .when('sellerType', { is: 'BUSINESS_STORE', then: Joi.required(), otherwise: Joi.forbidden() }),
            categories: Joi.array().items(Joi.string())
                .when('sellerType', { is: 'BUSINESS_STORE', then: Joi.min(1).required(), otherwise: Joi.forbidden() }),
            pickupAvailable: Joi.boolean()
                .when('sellerType', { is: 'BUSINESS_STORE', then: Joi.required(), otherwise: Joi.forbidden() }),
            deliveryAvailable: Joi.boolean()
                .when('sellerType', { is: 'BUSINESS_STORE', then: Joi.required(), otherwise: Joi.forbidden() }),
            panNumber: Joi.string().trim().uppercase().pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
                .when('sellerType', { is: 'BUSINESS_STORE', then: Joi.required(), otherwise: Joi.forbidden() })
                .messages({ 'string.pattern.base': 'Enter a valid 10-character PAN' }),
            gstRegistered: Joi.boolean()
                .when('sellerType', { is: 'BUSINESS_STORE', then: Joi.required(), otherwise: Joi.forbidden() }),
            gstin: Joi.string().trim().uppercase().pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
                .when('gstRegistered', { is: true, then: Joi.required(), otherwise: Joi.forbidden() })
                .messages({ 'string.pattern.base': 'Enter a valid 15-character GSTIN' }),

            // NOTE: this whole block used to be required for Seller
            // (previously Developer) registration and fed straight into
            // developer.model.js — the business/KYB onboarding record. That
            // model was removed with the investment domain, so nothing
            // reads these fields anymore. Left optional (rather than
            // deleted outright) so a future "seller business profile"
            // feature can resume validating them without a schema
            // rewrite — but registration itself no longer requires them.
            companyName: Joi.string().trim().optional(),
            registrationNumber: Joi.string().trim().optional(),
            legalForm: Joi.string().trim().optional(),
            countryOfIncorporation: Joi.string().trim().valid(...KNOWN_COUNTRY_CODES).optional(),
            entityType: Joi.string().valid("Company").optional(),
            registeredAddress: Joi.object({
                address: Joi.string().trim(),
                city: Joi.string().trim(),
                state: Joi.string().trim(),
                zipCode: Joi.string().trim(),
                country: Joi.string().uppercase().valid(...KNOWN_COUNTRY_CODES),
            }).optional(),
            // Seller-only, same reasoning as `dob` above — the Buyer
            // registration form no longer collects this.
            gender: Joi.string()
                .valid('M', 'F', 'O')
                .when('userType', {
                    is: 'Seller',
                    then: Joi.required(),
                    otherwise: Joi.optional()
                })
                .messages({
                    'string.empty': 'Gender is required',
                    'any.required': 'Gender is required',
                    'any.only': 'Gender must be M, F or O'
                }),
            countryCode: Joi.string()
                .allow('')
                .when('userType', {
                    is: Joi.valid('Seller', 'Buyer'),
                    then: Joi.required(),
                    otherwise: Joi.forbidden()
                }),
            termsCondtions: Joi.string()
                .pattern(/^[a-fA-F0-9]{24}$/)
                .required()
                .messages({
                    'string.empty': '_itermsCondtionsd ID is required',
                    'string.pattern.base': 'Invalid termsCondtions ID format. Must be a valid MongoDB ObjectId'
                }),
            cookiesPolicy: Joi.string()
                .pattern(/^[a-fA-F0-9]{24}$/)
                .optional()
                .messages({
                    'string.pattern.base': 'Invalid cookiesPolicy ID format. Must be a valid MongoDB ObjectId'
                }),
            privacyPolicy: Joi.string()
                .pattern(/^[a-fA-F0-9]{24}$/)
                .required()
                .messages({
                    'string.empty': 'privacyPolicy ID is required',
                    'string.pattern.base': 'Invalid privacyPolicy ID format. Must be a valid MongoDB ObjectId'
                }),

        }).custom((value, helpers) => {
            const { password, fullName, email, phoneNumber } = value;
            if (password && isPasswordSimilarToUserInfo(password, { fullName, email, phoneNumber })) {
                return helpers.error('password.similarToUserInfo');
            }
            return value;
        }).messages({
            'password.similarToUserInfo': 'Password must not contain or closely resemble your name, email, or phone number.'
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
    static ProfileUpdate() {
        return Joi.object({

            userType: Joi.string()
                .valid('Buyer', 'Seller')
                .optional()
                .messages({
                    'any.only': 'Invalid userType'
                }),

            buyerType: Joi.string()
                .valid('Homeowner', 'Individual', 'Builder', 'Contractor', 'Business')
                .optional()
                .allow('')
                .messages({
                    'any.only': 'Invalid buyerType'
                }),

            title: Joi.string()
                .valid('Mr', 'Mrs', 'Ms', 'Dr', 'Prof')
                .optional()
                .allow('')
                .messages({
                    'any.only': 'Invalid title'
                }),
            profilePicture: Joi.string()
                .optional()
                .allow('')
                .messages({
                    'string.base': 'profilePicture must be a string'
                }),

            fullName: Joi.string()
                .optional()
                .allow('')
                .messages({
                    'string.base': 'Full name must be a string'
                }),

            email: Joi.string()
                .email()
                .optional()
                .messages({
                    'string.email': 'Email must be a valid email address'
                }),

            phoneNumber: Joi.string()
                .optional()
                .allow('')
                .messages({
                    'string.base': 'Phone number must be a string'
                }),

            address1: Joi.string()
                .optional()
                .allow('')
                .messages({
                    'string.base': 'Address 1 must be a string'
                }),

            address2: Joi.string()
                .optional()
                .allow('')
                .messages({
                    'string.base': 'Address 2 must be a string'
                }),
            preferredCurrency: Joi.string()
                .valid("USD", "EUR", "AUD", "INR")
                .allow('')
                .messages({
                    'string.base': 'preferredCurrency must be a string'
                }),

            city: Joi.string()
                .optional()
                .allow('')
                .messages({
                    'string.base': 'City must be a string'
                }),
            state: Joi.string()
                .optional()
                .allow('')
                .messages({
                    'string.base': 'state must be a string'
                }),

            zipCode: Joi.string()
                .optional()
                .allow('')
                .messages({
                    'string.base': 'Zip code must be a string'
                }),

            companyName: Joi.string()
                .optional()
                .allow(''),

            countryOfResidence: Joi.string()
                .uppercase()
                .valid(...KNOWN_COUNTRY_CODES)
                .optional()
                .allow('')
                .messages({
                    'any.only': 'countryOfResidence must be a valid supported country code',
                }),

            dob: Joi.string()
                .optional()
                .allow(''),

            gender: Joi.string()
                .valid('M', 'F', 'O')
                .optional()
                .allow(''),

            countryCode: Joi.string()
                .optional()
                .allow(''),
            accreditedCriteria: Joi.array()
                .items(
                    Joi.string().trim().min(1)
                )
                .when('userType', {
                    is: 'Buyer',
                    then: Joi.optional().messages({
                        'any.required': 'Accredited criteria is required'
                    }),
                    otherwise: Joi.forbidden()
                }),

        }).custom((value, helpers) => {
            const { password, fullName, email, phoneNumber } = value;
            if (password && isPasswordSimilarToUserInfo(password, { fullName, email, phoneNumber })) {
                return helpers.error('password.similarToUserInfo');
            }
            return value;
        }).messages({
            'password.similarToUserInfo': 'Password must not contain or closely resemble your name, email, or phone number.'
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
            password: this.passwordRuleRequired,
        });
    }
    static changePassword() {
        return Joi.object({
            oldPassword: this.passwordRuleRequired,
            newPassword: this.passwordRuleRequired
        })
    }
    static setPassword() {
        return Joi.object({
            newPassword: this.passwordRuleRequired
        })
    }
    static accountDelete() {
        return Joi.object({
            password: this.passwordRuleRequired
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
    static googleLogin() {
        return Joi.object({
            userType: Joi.string()
                .valid('Owner', 'Seller')
                .required()
                .messages({
                    'any.required': 'userType is required',
                    'any.only': 'userType must be "tradesPerson","subContractor'
                }),
            googleId: Joi.string()
                .required()
                .messages({
                    'string.empty': 'googleId is required',
                    'string.base': 'googleId must be a string'
                }),
            fullName: Joi.string()
                .required()
                .messages({
                    'string.empty': 'fullName is required',
                    'string.base': 'fullName must be a string'
                }),
            email: Joi.string()
                .required()
                .messages({
                    'string.empty': 'email is required',
                    'string.base': 'email must be a string'
                }),

        });
    }
    static acceptConsent() {
        return Joi.object({
            termsCondtions: Joi.string()
                .pattern(/^[a-fA-F0-9]{24}$/)
                .required()
                .messages({
                    "any.required": "Terms & Conditions is required",
                    "string.pattern.base": "Invalid Terms ID"
                }),

            privacyPolicy: Joi.string()
                .pattern(/^[a-fA-F0-9]{24}$/)
                .required()
                .messages({
                    "any.required": "Privacy Policy is required",
                    "string.pattern.base": "Invalid Privacy ID"
                }),

            cookiesPolicy: Joi.string()
                .pattern(/^[a-fA-F0-9]{24}$/)
                .allow("", null)
                .optional()
                .messages({
                    "string.pattern.base": "Invalid Cookie Policy ID"
                })
        });
    }
    static validateLogin(data) {
        return this.login().validate(data, { abortEarly: false });
    }
    static validateUpdate(data) {
        return this.ProfileUpdate().validate(data, { abortEarly: false });
    }
    static validateRegister(data) {
        return this.Register().validate(data, { abortEarly: false });
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
    static validateAccountDelete(data) {
        return this.accountDelete().validate(data, { abortEarly: false });
    }
    static validateGoogleLogin(data) {
        return this.googleLogin().validate(data, { abortEarly: false });
    }
    static validateAcceptConsent(data) {
        return this.acceptConsent().validate(data, { abortEarly: false });
    }


}

module.exports = authValidation;