const Joi = require("joi");

class imageValidation {
    static upload() {
        return Joi.object({
            tempImage: Joi.object()
                .custom((value, helpers) => {
                    if (!value || !value.mimetype) {
                        return helpers.error("any.required");
                    }

                    const imagePattern = /^image\/(jpeg|png|jpg|gif|webp|avif)$/;
                    const pdfPattern = /^application\/pdf$/;

                    if (imagePattern.test(value.mimetype) || pdfPattern.test(value.mimetype)) {
                        if (value.size <= 1024) { 
                            return helpers.error("any.min");
                        }
                        if (value.size > 50 * 1024 * 1024) {
                            return helpers.error("any.max");
                        }
                        return value;
                    } else {
                        return helpers.error("any.invalid");
                    }
                })
                .required()
                .messages({
                    "any.required": "File is required",
                    "any.invalid": "Only image files (JPG, PNG, JPEG, GIF, WEBP, AVIF) or PDFs are allowed",
                    "any.max": "File size must be less than or equal to 50 MB",
                    "any.min": "File size must be greater than 1 KB"
                }),
        });
    }

    static multiUpload() {
        return Joi.object({
            tempImage: Joi.array()
                .items(
                    Joi.object()
                        .custom((value, helpers) => {
                            if (!value || !value.mimetype) {
                                return helpers.error("any.required");
                            }

                            const imagePattern = /^image\/(jpeg|png|jpg|gif|webp|avif)$/;
                            const pdfPattern = /^application\/pdf$/; // allow PDFs too

                            if (imagePattern.test(value.mimetype) || pdfPattern.test(value.mimetype)) {
                                if (value.size <= 1024) { // 1 KB
                                    return helpers.error("any.min");
                                }
                                if (value.size > 50 * 1024 * 1024) { // 5 MB
                                    return helpers.error("any.max");
                                }
                                return value;
                            } else {
                                return helpers.error("any.invalid");
                            }
                        })
                        .required()
                )
                .min(1)
                .messages({
                    "array.min": "At least one file is required",
                    "any.required": "File is required",
                    "any.invalid": "Only image files (JPG, PNG, JPEG, GIF, WEBP, AVIF) or PDFs are allowed",
                    "any.max": "File size must be less than or equal to 50 MB",
                    "any.min": "File size must be greater than 1 KB"
                }),
        });
    }

    static validateImage(data) {
        return imageValidation.upload().validate(data, { abortEarly: false });
    }

    static validateMultiImage(data) {
        return imageValidation.multiUpload().validate(data, { abortEarly: false });
    }
}

module.exports = imageValidation;