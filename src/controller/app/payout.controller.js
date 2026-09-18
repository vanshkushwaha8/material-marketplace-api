const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const payoutService = require('../../service/app/payout.service');
const bankAccountService = require('../../service/app/bankAccount.service');
const bankAccountValidation = require('../../validation/app/bankAccount.validation');

class PayoutController {
  linkBankAccount = async (request, response, nextFunction) => {
    try {
      const { error, value } = bankAccountValidation.ValidateLink(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const account = await bankAccountService.linkBankAccount({ sellerId: request.auth._id, body: value, req: request });
      return responseConstants.success(response, 'Bank account linked', account, statusCodes.CREATED);
    } catch (error) {
      if (error instanceof bankAccountService.BankAccountError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };

  getBankAccount = async (request, response, nextFunction) => {
    try {
      const account = await bankAccountService.getMyBankAccount(request.auth._id);
      return responseConstants.success(response, 'Bank account fetched', account, statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };

  retryPayout = async (request, response, nextFunction) => {
    try {
      const payout = await payoutService.retryPayout({ payoutId: request.params.id, sellerId: request.auth._id, req: request });
      return responseConstants.success(response, 'Payout retried', payout, statusCodes.OK);
    } catch (error) {
      if (error instanceof payoutService.PayoutError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };

  myPayouts = async (request, response, nextFunction) => {
    try {
      const result = await payoutService.myPayouts({ sellerId: request.auth._id, status: request.query.status, page: request.query.page, limit: request.query.limit });
      return responseConstants.success(response, 'Payouts fetched', result, statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };
}
module.exports = new PayoutController();