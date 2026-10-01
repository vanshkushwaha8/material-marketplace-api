const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const adminReviewService = require('../../service/admin/review.service');
const adminReviewValidation = require('../../validation/admin/review.validation');

class AdminReviewController {
  handle(response, nextFunction, error) {
    if (error instanceof adminReviewService.AdminReviewError) {
      return responseConstants.BadRequest(response, error.message, null, error.statusCode);
    }
    return nextFunction(error);
  }

  list = async (request, response, nextFunction) => {
    try {
      const { error, value } = adminReviewValidation.ValidateList(request.query);
      if (responseConstants.validatIonError(response, error)) return;
      const result = await adminReviewService.list(value);
      return responseConstants.success(response, 'Ratings fetched', result, statusCodes.OK);
    } catch (error) { return this.handle(response, nextFunction, error); }
  };

  getOne = async (request, response, nextFunction) => {
    try {
      const result = await adminReviewService.getOne(request.params.id);
      return responseConstants.success(response, 'Rating fetched', result, statusCodes.OK);
    } catch (error) { return this.handle(response, nextFunction, error); }
  };

  moderate = async (request, response, nextFunction) => {
    try {
      const { error, value } = adminReviewValidation.ValidateModerate(request.body);
      if (responseConstants.validatIonError(response, error)) return;
      const result = await adminReviewService.moderate({ reviewId: request.params.id, ...value, adminId: request.auth._id, req: request });
      return responseConstants.success(response, value.action === 'hide' ? 'Rating hidden' : 'Rating restored', result, statusCodes.OK);
    } catch (error) { return this.handle(response, nextFunction, error); }
  };
}

module.exports = new AdminReviewController();
