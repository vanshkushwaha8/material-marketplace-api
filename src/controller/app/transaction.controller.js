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

  setFulfilment = async (request, response, nextFunction) => {
    try {
      const { error, value } = transactionValidation.ValidateFulfilment(request.body || {});
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const fulfilment = await transactionService.setFulfilment({ transactionId: request.params.id, userId: request.auth._id, body: value, req: request });
      return responseConstants.success(response, 'Delivery details saved', fulfilment, statusCodes.OK);
    } catch (error) {
      if (error instanceof transactionService.TransactionError) return responseConstants.BadRequest(response, error.message, error.code ? { code: error.code } : null, error.statusCode);
      nextFunction(error);
    }
  };

  deliveryQuote = async (request, response, nextFunction) => {
    try {
      const quote = await transactionService.deliveryQuote({ transactionId: request.params.id, userId: request.auth._id, addressId: request.query.addressId });
      return responseConstants.success(response, 'Delivery quote', quote, statusCodes.OK);
    } catch (error) {
      if (error instanceof transactionService.TransactionError) {
        return responseConstants.BadRequest(response, error.message, error.code ? { code: error.code } : null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  markHandover = async (request, response, nextFunction) => {
    try {
      const { error, value } = transactionValidation.ValidateHandover(request.body || {});
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const txn = await transactionService.markHandover({ transactionId: request.params.id, userId: request.auth._id, note: value.note, evidence: value.evidence, req: request });
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