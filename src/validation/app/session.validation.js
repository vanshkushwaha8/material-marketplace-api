const Joi = require("joi");

class sessionValidation {
    static deleteSession() {
        return Joi.object({
            _id: Joi.string()
                .pattern(/^[a-fA-F0-9]{24}$/)
                .required()
                .messages({
                    'string.empty': '_id ID is required',
                    'string.pattern.base': 'Invalid _id ID format. Must be a valid MongoDB ObjectId'
                }),
            

        });
    }
    static ValidateDeleteSession(data) {
        return this.deleteSession().validate(data, { abortEarly: false });
    }
}

module.exports = sessionValidation;
