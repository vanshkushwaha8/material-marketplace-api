const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const offerService = require('../../service/app/offer.service');
const offerValidation = require('../../validation/app/offer.validation');

class OfferController {
  create = async (request, response, nextFunction) => {
    try {
      const { error, value } = offerValidation.ValidateCreate(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const offer = await offerService.createOffer({ buyerId: request.auth._id, body: value, req: request });
      return responseConstants.success(response, 'Offer submitted', offer, statusCodes.CREATED);
    } catch (error) {
      if (error instanceof offerService.OfferError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  respond = async (request, response, nextFunction) => {
    try {
      const { error, value } = offerValidation.ValidateRespond(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const offer = await offerService.respondToOffer({
        userId: request.auth._id, offerId: request.params.id,
        action: value.action, amount: value.amount, message: value.message, req: request,
      });
      return responseConstants.success(response, 'Offer updated', offer, statusCodes.OK);
    } catch (error) {
      if (error instanceof offerService.OfferError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  getOne = async (request, response, nextFunction) => {
    try {
      const offer = await offerService.getOne({ offerId: request.params.id, userId: request.auth._id });
      return responseConstants.success(response, 'Offer fetched', offer, statusCodes.OK);
    } catch (error) {
      if (error instanceof offerService.OfferError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  myAsBuyer = async (request, response, nextFunction) => {
    try {
      const result = await offerService.myOffers({ userId: request.auth._id, role: 'buyer', status: request.query.status, page: request.query.page, limit: request.query.limit });
      return responseConstants.success(response, 'Your offers fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };

  myAsSeller = async (request, response, nextFunction) => {
    try {
      const result = await offerService.myOffers({ userId: request.auth._id, role: 'seller', status: request.query.status, page: request.query.page, limit: request.query.limit });
      return responseConstants.success(response, 'Offers received fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };
}

module.exports = new OfferController();
