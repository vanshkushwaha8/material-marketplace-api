const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const requirementService = require('../../service/app/requirement.service');
const requirementValidation = require('../../validation/app/requirement.validation');

class RequirementController {
  create = async (request, response, nextFunction) => {
    try {
      const { error, value } = requirementValidation.ValidateCreate(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const requirement = await requirementService.createRequirement({ buyerId: request.auth._id, body: value });
      return responseConstants.success(response, 'Requirement posted', requirement, statusCodes.CREATED);
    } catch (error) { nextFunction(error); }
  };

  myRequirements = async (request, response, nextFunction) => {
    try {
      const result = await requirementService.myRequirements({ buyerId: request.auth._id, page: request.query.page, limit: request.query.limit });
      return responseConstants.success(response, 'Requirements fetched', result, statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };

  browse = async (request, response, nextFunction) => {
    try {
      const result = await requirementService.browseOpenRequirements({ page: request.query.page, limit: request.query.limit });
      return responseConstants.success(response, 'Open requirements fetched', result, statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };

  respond = async (request, response, nextFunction) => {
    try {
      const { error, value } = requirementValidation.ValidateRespond(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const result = await requirementService.respondToRequirement({ requirementId: request.params.id, sellerId: request.auth._id, body: value, req: request });
      return responseConstants.success(response, 'Response submitted', result, statusCodes.CREATED);
    } catch (error) {
      if (error instanceof requirementService.RequirementError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };

  getResponses = async (request, response, nextFunction) => {
    try {
      const result = await requirementService.getResponses({ requirementId: request.params.id, buyerId: request.auth._id });
      return responseConstants.success(response, 'Responses fetched', result, statusCodes.OK);
    } catch (error) {
      if (error instanceof requirementService.RequirementError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };

  close = async (request, response, nextFunction) => {
    try {
      const requirement = await requirementService.closeRequirement({ requirementId: request.params.id, buyerId: request.auth._id });
      return responseConstants.success(response, 'Requirement closed', requirement, statusCodes.OK);
    } catch (error) {
      if (error instanceof requirementService.RequirementError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };
}
module.exports = new RequirementController();