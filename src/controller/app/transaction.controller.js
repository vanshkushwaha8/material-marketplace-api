const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const transactionService = require('../../service/app/transaction.service');
const transactionValidation = require('../../validation/app/transaction.validation');

class TransactionController {
  cancel = async (request, response, nextFunction) => {
    try {
      const txn = await transactionService.cancelTransaction({ transactionId: request.params.id, userId: request.auth._id, req: request });
      return responseConstants.success(response, 'Transaction cancelled — inventory released', txn, statusCodes.OK);
    } catch (error) {
      if (error instanceof transactionService.TransactionError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };

  markHandover = async (request, response, nextFunction) => {
    try {
      const txn = await transactionService.markHandover({ transactionId: request.params.id, userId: request.auth._id, req: request });
      return responseConstants.success(response, 'Handover started', txn, statusCodes.OK);
    } catch (error) {
      if (error instanceof transactionService.TransactionError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };

  confirmReceipt = async (request, response, nextFunction) => {
    try {
      const txn = await transactionService.confirmReceipt({ transactionId: request.params.id, userId: request.auth._id, req: request });
      return responseConstants.success(response, 'Receipt confirmed — transaction completed', txn, statusCodes.OK);
    } catch (error) {
      if (error instanceof transactionService.TransactionError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };

  raiseDispute = async (request, response, nextFunction) => {
    try {
      const { error, value } = transactionValidation.ValidateDispute(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const txn = await transactionService.raiseDispute({ transactionId: request.params.id, userId: request.auth._id, reason: value.reason, req: request });
      return responseConstants.success(response, 'Dispute raised', txn, statusCodes.OK);
    } catch (error) {
      if (error instanceof transactionService.TransactionError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };

  getOne = async (request, response, nextFunction) => {
    try {
      const txn = await transactionService.getOne({ transactionId: request.params.id, userId: request.auth._id });
      return responseConstants.success(response, 'Transaction fetched', txn, statusCodes.OK);
    } catch (error) {
      if (error instanceof transactionService.TransactionError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };

  myAsBuyer = async (request, response, nextFunction) => {
    try {
      const result = await transactionService.myTransactions({ userId: request.auth._id, role: 'buyer', status: request.query.status, page: request.query.page, limit: request.query.limit });
      return responseConstants.success(response, 'Your transactions fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };

  myAsSeller = async (request, response, nextFunction) => {
    try {
      const result = await transactionService.myTransactions({ userId: request.auth._id, role: 'seller', status: request.query.status, page: request.query.page, limit: request.query.limit });
      return responseConstants.success(response, 'Your transactions fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };
}

module.exports = new TransactionController();