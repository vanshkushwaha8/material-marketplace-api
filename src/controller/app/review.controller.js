const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const reviewService = require('../../service/app/review.service');
const reviewValidation = require('../../validation/app/review.validation');

class ReviewController {
  submit = async (request, response, nextFunction) => {
    try {
      const { error, value } = reviewValidation.ValidateCreate(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const review = await reviewService.submitReview({ transactionId: request.params.id, userId: request.auth._id, body: value, req: request });
      return responseConstants.success(response, 'Review submitted', review, statusCodes.CREATED);
    } catch (error) {
      if (error instanceof reviewService.ReviewError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };

  myReviews = async (request, response, nextFunction) => {
    try {
      const result = await reviewService.myReceivedReviews({ userId: request.auth._id, page: request.query.page, limit: request.query.limit });
      return responseConstants.success(response, 'Reviews fetched', result, statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };
}
module.exports = new ReviewController();