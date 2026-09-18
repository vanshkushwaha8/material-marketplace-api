const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const commissionService = require('../../service/admin/commission.service');

class CommissionController {
  list = async (request, response, nextFunction) => {
    try {
      const result = await commissionService.list(request.query);
      return responseConstants.success(response, 'Commission history fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };
}

module.exports = new CommissionController();