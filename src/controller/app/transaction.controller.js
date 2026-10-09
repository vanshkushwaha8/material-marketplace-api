const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const transactionService = require('../../service/app/transaction.service');
const transactionValidation = require('../../validation/app/transaction.validation');
const vehicleTypeService = require('../../service/app/vehicleType.service');

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

  // Checkout preview: order weight, suggested vehicle, vehicle list, distance.
  deliveryRequirement = async (request, response, nextFunction) => {
    try {
      const data = await transactionService.deliveryRequirement({ transactionId: request.params.id, userId: request.auth._id, addressId: request.query.addressId });
      return responseConstants.success(response, 'Delivery requirement', data, statusCodes.OK);
    } catch (error) {
      if (error instanceof transactionService.TransactionError) {
        return responseConstants.BadRequest(response, error.message, error.code ? { code: error.code } : null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  // One handler per delivery-quote action; the route decides the action
  // and its permission, the validator its body.
  deliveryQuoteAction = (action, validate, successMessage) => async (request, response, nextFunction) => {
    try {
      const { error, value } = validate(request.body || {});
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const txn = await transactionService.respondToDeliveryQuote({ transactionId: request.params.id, userId: request.auth._id, body: { ...value, action }, req: request });
      return responseConstants.success(response, successMessage, txn, statusCodes.OK);
    } catch (error) {
      if (error instanceof transactionService.TransactionError) {
        return responseConstants.BadRequest(response, error.message, error.code ? { code: error.code } : null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  submitDeliveryQuote = this.deliveryQuoteAction('QUOTE', (b) => transactionValidation.ValidateDeliveryQuote(b), 'Delivery quote sent to the buyer');
  declineDelivery = this.deliveryQuoteAction('DECLINE', (b) => transactionValidation.ValidateDeliveryDecline(b), 'Delivery declined — the buyer has been told');
  acceptDeliveryQuote = this.deliveryQuoteAction('ACCEPT', (b) => transactionValidation.ValidateDeliveryAnswer(b), 'Delivery accepted — you can pay now');
  rejectDeliveryQuote = this.deliveryQuoteAction('REJECT', (b) => transactionValidation.ValidateDeliveryAnswer(b), 'Delivery quote rejected');

  vehicleTypes = async (request, response, nextFunction) => {
    try {
      const rows = await vehicleTypeService.listActive();
      return responseConstants.success(response, 'Vehicle types', rows, statusCodes.OK);
    } catch (error) {
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
      const result = await transactionService.myTransactions({ userId: request.auth._id, role: 'seller', status: request.query.status, deliveryStatus: request.query.deliveryStatus, page: request.query.page, limit: request.query.limit });
      return responseConstants.success(response, 'Your transactions fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };
}

module.exports = new TransactionController();