const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const storeCategoryService = require('../../service/app/storeCategory.service');

class StoreCategoryController {
  list = async (request, response, nextFunction) => {
    try {
      const categories = await storeCategoryService.list();
      return responseConstants.success(response, 'Store categories fetched', categories, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };
}

module.exports = new StoreCategoryController();
