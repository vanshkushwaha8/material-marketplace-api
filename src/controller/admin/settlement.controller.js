const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const settlementService = require('../../service/admin/settlement.service');

class SettlementController {
  list = async (request, response, nextFunction) => {
    try {
      const result = await settlementService.list(request.query);
      return responseConstants.success(response, 'Seller settlement history fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };
}

module.exports = new SettlementController();
