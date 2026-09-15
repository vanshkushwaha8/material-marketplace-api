const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const materialCategoryService = require('../../service/admin/materialCategory.service');
const materialCategoryValidation = require('../../validation/admin/materialCategory.validation');

class MaterialCategoryAdminController {
  list = async (request, response, nextFunction) => {
    try {
      const result = await materialCategoryService.list(request.query);
      return responseConstants.success(response, 'Categories fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };

  create = async (request, response, nextFunction) => {
    try {
      const { error, value } = materialCategoryValidation.ValidateCreate(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const category = await materialCategoryService.create({ adminId: request.auth._id, body: value, req: request });
      return responseConstants.success(response, 'Category created', category, statusCodes.CREATED);
    } catch (error) {
      if (error instanceof materialCategoryService.MaterialCategoryError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  update = async (request, response, nextFunction) => {
    try {
      const { error, value } = materialCategoryValidation.ValidateUpdate(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const category = await materialCategoryService.update({ adminId: request.auth._id, categoryId: request.params.id, body: value, req: request });
      return responseConstants.success(response, 'Category updated', category, statusCodes.OK);
    } catch (error) {
      if (error instanceof materialCategoryService.MaterialCategoryError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  remove = async (request, response, nextFunction) => {
    try {
      const result = await materialCategoryService.remove({ adminId: request.auth._id, categoryId: request.params.id, req: request });
      return responseConstants.success(response, 'Category deleted', result, statusCodes.OK);
    } catch (error) {
      if (error instanceof materialCategoryService.MaterialCategoryError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };
}

module.exports = new MaterialCategoryAdminController();
