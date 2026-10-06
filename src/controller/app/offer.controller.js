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

  buyNow = async (request, response, nextFunction) => {
    try {
      const { error, value } = offerValidation.ValidateBuyNow(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const result = await offerService.buyNow({ buyerId: request.auth._id, body: value, req: request });
      return responseConstants.success(response, 'Order created — complete payment', result, statusCodes.CREATED);
    } catch (error) {
      if (error instanceof offerService.OfferError) {
        const data = error.errorCode ? { code: error.errorCode, ...(error.transactionId ? { transactionId: error.transactionId } : {}) } : null;
        return responseConstants.BadRequest(response, error.message, data, error.statusCode);
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
        const data = error.errorCode ? { code: error.errorCode } : null;
        return responseConstants.BadRequest(response, error.message, data, error.statusCode);
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

  listFor = (role, message) => async (request, response, nextFunction) => {
    try {
      const { error, value } = offerValidation.ValidateList(request.query);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const result = await offerService.myOffers({ userId: request.auth._id, role, ...value });
      return responseConstants.success(response, message, result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };

  // ?view=action|waiting|accepted|closed (whose turn it is), plus paging.
  myAsBuyer = this.listFor('buyer', 'Your offers fetched');

  myAsSeller = this.listFor('seller', 'Offers received fetched');
}

module.exports = new OfferController();
