const Joi = require('joi');
const { SELLER_TYPES } = require('../../constants/sellerType.constants');
const { LISTING_STATES } = require('../../constants/materialListing.constants');
const { OFFER_STATES } = require('../../constants/offer.constants');
const { TRANSACTION_STATES } = require('../../constants/transaction.constants');
const { PAYMENT_STATES } = require('../../constants/payment.constants');
const { PAYOUT_STATES } = require('../../constants/payout.constants');

const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
};

class adminUserValidation {
  static list() {
    return Joi.object({
      ...pagination,
      search: Joi.string().trim().max(100).empty(''),
      userType: Joi.string().valid('Buyer', 'Seller').empty(''),
      sellerType: Joi.string().valid(...Object.values(SELLER_TYPES)).empty(''),
      status: Joi.string().valid('pending', 'approved', 'rejected', 'suspended').empty(''),
      emailVerified: Joi.boolean().empty(''),
      city: Joi.string().trim().max(100).empty(''),
      state: Joi.string().trim().max(100).empty(''),
      from: Joi.date().iso().empty(''),
      to: Joi.date().iso().empty(''),
      sort: Joi.string().valid('newest', 'oldest', 'name', 'last_active').default('newest'),
      includeDeleted: Joi.boolean().default(false),
    });
  }

  static sub(statusValues) {
    return Joi.object({
      ...pagination,
      role: Joi.string().valid('buyer', 'seller').default('buyer'),
      status: statusValues ? Joi.string().valid(...statusValues).empty('') : Joi.any().strip(),
      direction: Joi.string().valid('received', 'given').default('received'),
      action: Joi.string().trim().max(80).empty(''),
    });
  }

  static status() {
    return Joi.object({
      status: Joi.string().valid('suspended', 'approved').required(),
      reason: Joi.string().trim().min(5).max(500)
        .when('status', { is: 'suspended', then: Joi.required(), otherwise: Joi.optional().allow('') })
        .messages({ 'any.required': 'A reason is required to suspend an account', 'string.min': 'Please give a reason of at least 5 characters' }),
    });
  }

  static ValidateList(q) { return this.list().validate(q, { abortEarly: false, stripUnknown: true }); }
  static ValidateSub(q, kind) {
    const statusByKind = {
      listings: Object.values(LISTING_STATES),
      offers: Object.values(OFFER_STATES),
      transactions: Object.values(TRANSACTION_STATES),
      payments: Object.values(PAYMENT_STATES),
      payouts: Object.values(PAYOUT_STATES),
    };
    return this.sub(statusByKind[kind]).validate(q, { abortEarly: false, stripUnknown: true });
  }
  static ValidateStatus(b) { return this.status().validate(b, { abortEarly: false, stripUnknown: true }); }
}

module.exports = adminUserValidation;
