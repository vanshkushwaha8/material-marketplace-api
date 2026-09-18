const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const adminPaymentService = require('../../service/admin/payment.service');

class AdminPaymentController {
  list = async (request, response, nextFunction) => {
    try {
      const result = await adminPaymentService.list(request.query);
      return responseConstants.success(response, 'Payment history fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };
}

module.exports = new AdminPaymentController();