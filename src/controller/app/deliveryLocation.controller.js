const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const deliveryLocationValidation = require('../../validation/app/deliveryLocation.validation');
const deliveryLocationService = require('../../service/app/deliveryLocation.service');

class DeliveryLocationController {
  list = async (request, response, nextFunction) => {
    try {
      const result = await deliveryLocationService.list({ buyerId: request.auth._id });
      return responseConstants.success(response, 'Delivery locations fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };

  create = async (request, response, nextFunction) => {
    try {
      const { error, value } = deliveryLocationValidation.ValidateCreate(request.body);
      if (responseConstants.validatIonError(response, error)) return;

      const result = await deliveryLocationService.create({ buyerId: request.auth._id, body: value, req: request });
      return responseConstants.success(response, 'Delivery location added', result, statusCodes.CREATED);
    } catch (error) {
      if (error instanceof deliveryLocationService.DeliveryLocationError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode || statusCodes.BAD_REQUEST);
      }
      nextFunction(error);
    }
  };

  update = async (request, response, nextFunction) => {
    try {
      const { error, value } = deliveryLocationValidation.ValidateUpdate(request.body);
      if (responseConstants.validatIonError(response, error)) return;

      const result = await deliveryLocationService.update({
        buyerId: request.auth._id,
        locationId: request.params.id,
        body: value,
        req: request,
      });
      return responseConstants.success(response, 'Delivery location updated', result, statusCodes.OK);
    } catch (error) {
      if (error instanceof deliveryLocationService.DeliveryLocationError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode || statusCodes.BAD_REQUEST);
      }
      nextFunction(error);
    }
  };

  setDefault = async (request, response, nextFunction) => {
    try {
      const result = await deliveryLocationService.setDefault({
        buyerId: request.auth._id,
        locationId: request.params.id,
        req: request,
      });
      return responseConstants.success(response, 'Default delivery location updated', result, statusCodes.OK);
    } catch (error) {
      if (error instanceof deliveryLocationService.DeliveryLocationError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode || statusCodes.BAD_REQUEST);
      }
      nextFunction(error);
    }
  };

  remove = async (request, response, nextFunction) => {
    try {
      const result = await deliveryLocationService.remove({
        buyerId: request.auth._id,
        locationId: request.params.id,
        req: request,
      });
      return responseConstants.success(response, 'Delivery location removed', result, statusCodes.OK);
    } catch (error) {
      if (error instanceof deliveryLocationService.DeliveryLocationError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode || statusCodes.BAD_REQUEST);
      }
      nextFunction(error);
    }
  };
}

module.exports = new DeliveryLocationController();
