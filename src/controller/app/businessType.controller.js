const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const businessTypeService = require('../../service/app/businessType.service');

class BusinessTypeController {
  list = async (request, response, nextFunction) => {
    try {
      const types = await businessTypeService.list();
      return responseConstants.success(response, 'Business types fetched', types, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };
}

module.exports = new BusinessTypeController();
