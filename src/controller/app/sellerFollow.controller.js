const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const sellerFollowService = require('../../service/app/sellerFollow.service');

class SellerFollowController {
  handle(response, nextFunction, error) {
    if (error instanceof sellerFollowService.FollowError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
    return nextFunction(error);
  }

  follow = async (request, response, nextFunction) => {
    try {
      const result = await sellerFollowService.follow({ buyerId: request.auth._id, sellerId: request.params.sellerId, req: request });
      return responseConstants.success(response, 'You are now following this seller', result, statusCodes.OK);
    } catch (error) { return this.handle(response, nextFunction, error); }
  };

  unfollow = async (request, response, nextFunction) => {
    try {
      const result = await sellerFollowService.unfollow({ buyerId: request.auth._id, sellerId: request.params.sellerId, req: request });
      return responseConstants.success(response, 'Unfollowed', result, statusCodes.OK);
    } catch (error) { return this.handle(response, nextFunction, error); }
  };

  status = async (request, response, nextFunction) => {
    try {
      const result = await sellerFollowService.status({ sellerId: request.params.sellerId, viewer: request.auth });
      return responseConstants.success(response, 'Follow status fetched', result, statusCodes.OK);
    } catch (error) { return this.handle(response, nextFunction, error); }
  };
}

module.exports = new SellerFollowController();
