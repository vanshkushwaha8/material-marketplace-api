const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const storeProfileService = require('../../service/app/storeProfile.service');
const storeProfileValidation = require('../../validation/app/storeProfile.validation');

class StoreProfileController {
  getMine = async (request, response, nextFunction) => {
    try {
      const store = await storeProfileService.getMyStoreProfile(request.auth._id);
      return responseConstants.success(response, 'Store profile fetched', store, statusCodes.OK);
    } catch (error) {
      if (error instanceof storeProfileService.StoreProfileError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };

  updateMine = async (request, response, nextFunction) => {
    try {
      const { error, value } = storeProfileValidation.ValidateUpdate(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const store = await storeProfileService.updateMyStoreProfile({ sellerId: request.auth._id, body: value, req: request });
      return responseConstants.success(response, 'Store profile updated', store, statusCodes.OK);
    } catch (error) {
      if (error instanceof storeProfileService.StoreProfileError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };

  getPublic = async (request, response, nextFunction) => {
    try {
      const store = await storeProfileService.getPublicStoreProfile(request.params.sellerId);
      return responseConstants.success(response, 'Store fetched', store, statusCodes.OK);
    } catch (error) {
      if (error instanceof storeProfileService.StoreProfileError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };

  getProducts = async (request, response, nextFunction) => {
    try {
      const result = await storeProfileService.getStoreProducts({ sellerId: request.params.sellerId, page: request.query.page, limit: request.query.limit });
      return responseConstants.success(response, 'Store products fetched', result, statusCodes.OK);
    } catch (error) {
      if (error instanceof storeProfileService.StoreProfileError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };
}

module.exports = new StoreProfileController();
