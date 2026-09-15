const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const materialListingAdminService = require('../../service/admin/materialListing.service');
const materialListingAdminValidation = require('../../validation/admin/materialListing.validation');

class MaterialListingAdminController {
  moderationQueue = async (request, response, nextFunction) => {
    try {
      const result = await materialListingAdminService.moderationQueue(request.query);
      return responseConstants.success(response, 'Moderation queue fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };

    getOne = async (request, response, nextFunction) => {
    try {
      const listing = await materialListingAdminService.getOne({ listingId: request.params.id });
      return responseConstants.success(response, 'Listing details fetched', listing, statusCodes.OK);
    } catch (error) {
      if (error instanceof materialListingAdminService.MaterialListingAdminError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  listAll = async (request, response, nextFunction) => {
    try {
      const result = await materialListingAdminService.listAll(request.query);
      return responseConstants.success(response, 'Listings fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };

  decide = async (request, response, nextFunction) => {
    try {
      const { error, value } = materialListingAdminValidation.ValidateDecision(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const listing = await materialListingAdminService.decide({
        adminId: request.auth._id, listingId: request.params.id,
        decision: value.decision, note: value.note, req: request,
      });
      return responseConstants.success(response, 'Decision recorded', listing, statusCodes.OK);
    } catch (error) {
      if (error instanceof materialListingAdminService.MaterialListingAdminError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };

  statusChange = async (request, response, nextFunction) => {
    try {
      const { error, value } = materialListingAdminValidation.ValidateStatusChange(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const listing = await materialListingAdminService.forceStatusChange({
        adminId: request.auth._id, listingId: request.params.id,
        status: value.status, reason: value.reason, req: request,
      });
      return responseConstants.success(response, 'Listing status updated', listing, statusCodes.OK);
    } catch (error) {
      if (error instanceof materialListingAdminService.MaterialListingAdminError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      }
      nextFunction(error);
    }
  };
}

module.exports = new MaterialListingAdminController();
