const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const materialCategoryService = require('../../service/app/materialCategory.service');

class MaterialCategoryController {
  list = async (request, response, nextFunction) => {
    try {
      const categories = await materialCategoryService.list();
      return responseConstants.success(response, 'Categories fetched', categories, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };
}

module.exports = new MaterialCategoryController();
