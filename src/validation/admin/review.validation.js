const Joi = require('joi');
const { REVIEW_STATUS } = require('../../constants/review.constants');

const objectId = Joi.string().hex().length(24);

class adminReviewValidation {
  static list() {
    return Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      search: Joi.string().trim().max(100).empty(''),
      status: Joi.string().valid(...Object.values(REVIEW_STATUS)).empty(''),
      rating: Joi.number().integer().min(1).max(5).empty(''),
      sellerId: objectId.empty(''),
      buyerId: objectId.empty(''),
      from: Joi.date().iso().empty(''),
      to: Joi.date().iso().empty(''),
      sort: Joi.string().valid('newest', 'oldest', 'lowest', 'highest').default('newest'),
    });
  }

  // Moderation accepts ONLY action + reason — no rating/comment/owner
  // fields, so an admin can't rewrite or reassign a buyer's rating.
  static moderate() {
    return Joi.object({
      action: Joi.string().valid('hide', 'restore').required(),
      reason: Joi.string().trim().min(5).max(500)
        .when('action', { is: 'hide', then: Joi.required(), otherwise: Joi.optional().allow('') })
        .messages({ 'any.required': 'A reason is required to hide a rating', 'string.min': 'Please give a reason of at least 5 characters' }),
    });
  }

  static ValidateList(q) { return this.list().validate(q, { abortEarly: false, stripUnknown: true }); }
  static ValidateModerate(b) { return this.moderate().validate(b, { abortEarly: false, stripUnknown: true }); }
}
module.exports = adminReviewValidation;
