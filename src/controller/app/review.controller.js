const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const reviewService = require('../../service/app/review.service');
const reviewValidation = require('../../validation/app/review.validation');

const handle = (response, nextFunction, error) => {
  if (error instanceof reviewService.ReviewError) return responseConstants.BadRequest(response, error.message, error.errorCode ? { errorCode: error.errorCode } : null, error.statusCode);
  return nextFunction(error);
};

class ReviewController {
  submit = async (request, response, nextFunction) => {
    try {
      const { error, value } = reviewValidation.ValidateCreate(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const review = await reviewService.submitReview({ transactionId: request.params.id, userId: request.auth._id, body: value, req: request });
      return responseConstants.success(response, 'Thanks — your rating was submitted', review, statusCodes.CREATED);
    } catch (error) { return handle(response, nextFunction, error); }
  };

  update = async (request, response, nextFunction) => {
    try {
      const { error, value } = reviewValidation.ValidateUpdate(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const review = await reviewService.updateMyReview({ reviewId: request.params.id, userId: request.auth._id, body: value, req: request });
      return responseConstants.success(response, 'Your rating was updated', review, statusCodes.OK);
    } catch (error) { return handle(response, nextFunction, error); }
  };

  myReviews = async (request, response, nextFunction) => {
    try {
      const result = await reviewService.myReceivedReviews({ userId: request.auth._id, page: request.query.page, limit: request.query.limit });
      return responseConstants.success(response, 'Reviews fetched', result, statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };

  sellerReviews = async (request, response, nextFunction) => {
    try {
      const { error, value } = reviewValidation.ValidateList(request.query);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const result = await reviewService.publicSellerReviews({ sellerId: request.params.sellerId, ...value });
      return responseConstants.success(response, 'Seller reviews fetched', result, statusCodes.OK);
    } catch (error) { return handle(response, nextFunction, error); }
  };

  myRatingStatus = async (request, response, nextFunction) => {
    try {
      const result = await reviewService.myRatingStatus({ buyerId: request.auth._id, sellerId: request.params.sellerId });
      return responseConstants.success(response, 'Rating status fetched', result, statusCodes.OK);
    } catch (error) { return handle(response, nextFunction, error); }
  };
}
module.exports = new ReviewController();
