const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const transactionHistoryService = require('../../service/admin/transactionHistory.service');

class TransactionHistoryController {
  list = async (request, response, nextFunction) => {
    try {
      const result = await transactionHistoryService.list(request.query);
      return responseConstants.success(response, 'Transaction history fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };
}

module.exports = new TransactionHistoryController();
