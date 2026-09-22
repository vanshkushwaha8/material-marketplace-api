const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const businessTypeService = require('../../service/admin/businessType.service');
const businessTypeValidation = require('../../validation/admin/businessType.validation');

class BusinessTypeAdminController {
  list = async (request, response, nextFunction) => {
    try {
      const result = await businessTypeService.list(request.query);
      return responseConstants.success(response, 'Business types fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };

  create = async (request, response, nextFunction) => {
    try {
      const { error, value } = businessTypeValidation.ValidateCreate(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const type = await businessTypeService.create({ adminId: request.auth._id, body: value, req: request });
      return responseConstants.success(response, 'Business type created', type, statusCodes.CREATED);
    } catch (error) {
      if (error instanceof businessTypeService.BusinessTypeError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  update = async (request, response, nextFunction) => {
    try {
      const { error, value } = businessTypeValidation.ValidateUpdate(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const type = await businessTypeService.update({ adminId: request.auth._id, typeId: request.params.id, body: value, req: request });
      return responseConstants.success(response, 'Business type updated', type, statusCodes.OK);
    } catch (error) {
      if (error instanceof businessTypeService.BusinessTypeError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  remove = async (request, response, nextFunction) => {
    try {
      const result = await businessTypeService.remove({ adminId: request.auth._id, typeId: request.params.id, req: request });
      return responseConstants.success(response, 'Business type deleted', result, statusCodes.OK);
    } catch (error) {
      if (error instanceof businessTypeService.BusinessTypeError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };
}

module.exports = new BusinessTypeAdminController();
