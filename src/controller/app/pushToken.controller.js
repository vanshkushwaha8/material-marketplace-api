const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const pushTokenService = require('../../service/app/pushToken.service');

class PushTokenController {
  register = async (request, response, nextFunction) => {
    try {
      const { token } = request.body;
      if (!token) return responseConstants.BadRequest(response, 'token is required', null, statusCodes.BAD_REQUEST);
      await pushTokenService.registerToken({ userId: request.auth._id, token });
      return responseConstants.success(response, 'Device registered', null, statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };

  unregister = async (request, response, nextFunction) => {
    try {
      const { token } = request.body;
      await pushTokenService.removeToken({ userId: request.auth._id, token });
      return responseConstants.success(response, 'Device unregistered', null, statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };
}
module.exports = new PushTokenController();