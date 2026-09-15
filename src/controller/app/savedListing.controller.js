const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const savedListingService = require('../../service/app/savedListing.service');

class SavedListingController {
  toggle = async (request, response, nextFunction) => {
    try {
      const listingId = request.query.listingId || request.body.listingId;
      const result = await savedListingService.toggle({ buyerId: request.auth._id, listingId, req: request });
      return responseConstants.success(response, result.isSaved ? 'Added to saved listings' : 'Removed from saved listings', result, statusCodes.OK);
    } catch (error) {
      if (error instanceof savedListingService.SavedListingError) {
        return responseConstants.BadRequest(response, error.message, null, error.statusCode || statusCodes.BAD_REQUEST);
      }
      nextFunction(error);
    }
  };

  list = async (request, response, nextFunction) => {
    try {
      const result = await savedListingService.list({
        buyerId: request.auth._id,
        page: request.query.page,
        limit: request.query.limit,
        search: request.query.search,
      });
      return responseConstants.success(response, 'Saved listings fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };
}

module.exports = new SavedListingController();
