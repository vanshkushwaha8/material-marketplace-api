const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const storeCategoryService = require('../../service/admin/storeCategory.service');
const storeCategoryValidation = require('../../validation/admin/storeCategory.validation');

class StoreCategoryAdminController {
  list = async (request, response, nextFunction) => {
    try {
      const result = await storeCategoryService.list(request.query);
      return responseConstants.success(response, 'Store categories fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };

  create = async (request, response, nextFunction) => {
    try {
      const { error, value } = storeCategoryValidation.ValidateCreate(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const category = await storeCategoryService.create({ adminId: request.auth._id, body: value, req: request });
      return responseConstants.success(response, 'Store category created', category, statusCodes.CREATED);
    } catch (error) {
      if (error instanceof storeCategoryService.StoreCategoryError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  update = async (request, response, nextFunction) => {
    try {
      const { error, value } = storeCategoryValidation.ValidateUpdate(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const category = await storeCategoryService.update({ adminId: request.auth._id, categoryId: request.params.id, body: value, req: request });
      return responseConstants.success(response, 'Store category updated', category, statusCodes.OK);
    } catch (error) {
      if (error instanceof storeCategoryService.StoreCategoryError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  remove = async (request, response, nextFunction) => {
    try {
      const result = await storeCategoryService.remove({ adminId: request.auth._id, categoryId: request.params.id, req: request });
      return responseConstants.success(response, 'Store category deleted', result, statusCodes.OK);
    } catch (error) {
      if (error instanceof storeCategoryService.StoreCategoryError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };
}

module.exports = new StoreCategoryAdminController();
