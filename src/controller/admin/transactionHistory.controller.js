const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const transactionHistoryService = require('../../service/admin/transactionHistory.service');
const transactionService = require('../../service/app/transaction.service');

class TransactionHistoryController {
  list = async (request, response, nextFunction) => {
    try {
      const result = await transactionHistoryService.list(request.query);
      return responseConstants.success(response, 'Transaction history fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };

  getOne = async (request, response, nextFunction) => {
    try {
      const result = await transactionHistoryService.getOne(request.params.id);
      return responseConstants.success(response, 'Transaction fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };

  resolveDispute = async (request, response, nextFunction) => {
    try {
      const txn = await transactionService.resolveDispute({
        transactionId: request.params.id, adminId: request.auth._id,
        resolution: request.body?.resolution, note: request.body?.note, req: request,
      });
      return responseConstants.success(response, 'Dispute resolved', txn, statusCodes.OK);
    } catch (error) {
      if (error instanceof transactionService.TransactionError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };
}

module.exports = new TransactionHistoryController();
