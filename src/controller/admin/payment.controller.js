const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const adminPaymentService = require('../../service/admin/payment.service');
const paymentService = require('../../service/app/payment.service');

class AdminPaymentController {
  list = async (request, response, nextFunction) => {
    try {
      const result = await adminPaymentService.list(request.query);
      return responseConstants.success(response, 'Payment history fetched', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };

  refund = async (request, response, nextFunction) => {
    try {
      const payment = await paymentService.initiateAdminRefund({ paymentId: request.params.id, adminId: request.auth._id, reason: request.body?.reason, req: request });
      return responseConstants.success(response, 'Refund initiated with the payment provider', payment, statusCodes.OK);
    } catch (error) {
      if (error instanceof paymentService.PaymentError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };
}

module.exports = new AdminPaymentController();