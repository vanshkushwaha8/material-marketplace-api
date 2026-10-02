const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const nearbyService = require('../../service/app/nearby.service');
const nearbyValidation = require('../../validation/app/nearby.validation');

class NearbyController {
  sellers = async (request, response, nextFunction) => {
    try {
      const { error, value } = nearbyValidation.ValidateSellers(request.query);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const result = await nearbyService.nearbySellers(value);
      return responseConstants.success(response, 'Nearby sellers fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };
}

module.exports = new NearbyController();
