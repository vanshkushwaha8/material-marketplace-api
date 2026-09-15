const responseConstants = require('../constants/response.constatnts');
const statusCodes = require('../constants/httpConstants');
const requiresDualControl = (model, initiatorField = 'initiatorId') => {
  return async (request, response, nextFunction) => {
    try {
      const resource = await model.findById(request.params.id).select(initiatorField);
      if (!resource) {
        return responseConstants.unauthorized(response, 'Resource not found', statusCodes.NOT_FOUND);
      }
      const initiatorId = resource[initiatorField];
      const isSuperAdminRequest = !!request.auth?.isSuperAdmin;
      if (!isSuperAdminRequest && initiatorId && String(initiatorId) === String(request.auth?._id)) {
        return responseConstants.unauthorized(response, 'The initiator cannot approve their own request.', statusCodes.FORBIDDEN);
      }
      return nextFunction();
    } catch (error) {
      nextFunction(error);
    }
  };
};

module.exports = { requiresDualControl };
