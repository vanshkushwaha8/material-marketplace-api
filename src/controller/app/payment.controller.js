const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const paymentService = require('../../service/app/payment.service');

class PaymentController {
  createOrder = async (request, response, nextFunction) => {
    try {
      const order = await paymentService.createPaymentOrder({ transactionId: request.params.id, buyerId: request.auth._id, req: request });
      return responseConstants.success(response, 'Payment order created', order, statusCodes.CREATED);
    } catch (error) {
      if (error instanceof paymentService.PaymentError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };

  manualTestPayment = async (request, response, nextFunction) => {
    try {
      const payment = await paymentService.createManualTestPayment({ transactionId: request.params.id, buyerId: request.auth._id, req: request });
      return responseConstants.success(response, 'Test payment successful — no real money was charged', payment, statusCodes.OK);
    } catch (error) {
      if (error instanceof paymentService.PaymentError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };

  verify = async (request, response, nextFunction) => {
    try {
      const { providerOrderId, providerPaymentId, signature } = request.body;
      const result = await paymentService.verifyPayment({ buyerId: request.auth._id, providerOrderId, providerPaymentId, signature, req: request });
      return responseConstants.success(response, 'Payment verified', result.payment, statusCodes.OK);
    } catch (error) {
      if (error instanceof paymentService.PaymentError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };

  // Public — no auth. The signature check inside handleWebhook IS the
  // authentication for this route; req.rawBody comes from app.js's
  // global express.json() verify hook.
  webhook = async (request, response) => {
    try {
      const signature = request.headers['x-razorpay-signature'];
      await paymentService.handleWebhook({ rawBody: request.rawBody, signature, payload: request.body });
      return response.status(200).json({ status: true });
    } catch (error) {
      // Non-2xx makes the provider retry — fine for transient errors, but
      // an invalid signature should not be retried indefinitely as valid.
      return response.status(error.statusCode === 401 ? 401 : 200).json({ status: false, message: error.message });
    }
  };
}

module.exports = new PaymentController();