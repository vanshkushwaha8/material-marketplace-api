const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const materialListingService = require('../../service/app/materialListing.service');
const materialListingValidation = require('../../validation/app/materialListing.validation');

class MaterialListingController {
  create = async (request, response, nextFunction) => {
    try {
      const { error, value } = materialListingValidation.ValidateCreate(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const listing = await materialListingService.createListing({ sellerId: request.auth._id, body: value, req: request });
      return responseConstants.success(response, 'Listing created as draft', listing, statusCodes.CREATED);
    } catch (error) {
      if (error instanceof materialListingService.MaterialListingError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  update = async (request, response, nextFunction) => {
    try {
      const { error, value } = materialListingValidation.ValidateUpdate(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const listing = await materialListingService.updateListing({ sellerId: request.auth._id, listingId: request.params.id, body: value, req: request });
      return responseConstants.success(response, 'Listing updated', listing, statusCodes.OK);
    } catch (error) {
      if (error instanceof materialListingService.MaterialListingError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  submit = async (request, response, nextFunction) => {
    try {
      const listing = await materialListingService.submitForVerification({ sellerId: request.auth._id, listingId: request.params.id, req: request });
      return responseConstants.success(response, 'Listing submitted for verification', listing, statusCodes.OK);
    } catch (error) {
      if (error instanceof materialListingService.MaterialListingError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  setStatus = async (request, response, nextFunction) => {
    try {
      const { status } = request.body;
      const listing = await materialListingService.setSellerStatus({ sellerId: request.auth._id, listingId: request.params.id, targetStatus: status, req: request });
      return responseConstants.success(response, 'Listing status updated', listing, statusCodes.OK);
    } catch (error) {
      if (error instanceof materialListingService.MaterialListingError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  remove = async (request, response, nextFunction) => {
    try {
      const result = await materialListingService.deleteListing({ sellerId: request.auth._id, listingId: request.params.id, req: request });
      return responseConstants.success(response, 'Listing deleted', result, statusCodes.OK);
    } catch (error) {
      if (error instanceof materialListingService.MaterialListingError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  getOne = async (request, response, nextFunction) => {
    try {
      const listing = await materialListingService.getOne({ listingId: request.params.id, viewerId: request.auth?._id });
      return responseConstants.success(response, 'Listing fetched', listing, statusCodes.OK);
    } catch (error) {
      if (error instanceof materialListingService.MaterialListingError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };
    getMine = async (request, response, nextFunction) => {
    try {
      const listing = await materialListingService.getMine({ sellerId: request.auth._id, listingId: request.params.id });
      return responseConstants.success(response, 'Listing fetched', listing, statusCodes.OK);
    } catch (error) {
      if (error instanceof materialListingService.MaterialListingError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  search = async (request, response, nextFunction) => {
    try {
      const { error, value } = materialListingValidation.ValidateList(request.query);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const result = await materialListingService.search(value);
      return responseConstants.success(response, 'Listings fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };

  myListings = async (request, response, nextFunction) => {
    try {
      const result = await materialListingService.myListings({
        sellerId: request.auth._id,
        page: request.query.page,
        limit: request.query.limit,
        status: request.query.status,
      });
      return responseConstants.success(response, 'Your listings fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };
}

module.exports = new MaterialListingController();
