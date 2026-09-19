/**
 * POST /payments/verify used to destructure providerOrderId/providerPaymentId/
 * signature straight off req.body with zero validation. This checks the new
 * Joi schema actually rejects malformed/missing input before it ever reaches
 * paymentService.verifyPayment (which trusts these three fields to look up
 * and verify a real payment record).
 */

const paymentValidation = require('../validation/app/payment.validation');

describe('paymentValidation.ValidateVerify', () => {
  test('accepts a well-formed payload', () => {
    const { error, value } = paymentValidation.ValidateVerify({
      providerOrderId: 'order_abc123',
      providerPaymentId: 'pay_xyz789',
      signature: 'deadbeef',
    });
    expect(error).toBeUndefined();
    expect(value).toEqual({
      providerOrderId: 'order_abc123',
      providerPaymentId: 'pay_xyz789',
      signature: 'deadbeef',
    });
  });

  test.each([
    ['missing providerOrderId', { providerPaymentId: 'pay_1', signature: 'sig' }],
    ['missing providerPaymentId', { providerOrderId: 'order_1', signature: 'sig' }],
    ['missing signature', { providerOrderId: 'order_1', providerPaymentId: 'pay_1' }],
    ['empty string fields', { providerOrderId: '', providerPaymentId: '', signature: '' }],
    ['non-string providerOrderId', { providerOrderId: { $ne: null }, providerPaymentId: 'pay_1', signature: 'sig' }],
  ])('rejects %s', (_label, payload) => {
    const { error } = paymentValidation.ValidateVerify(payload);
    expect(error).toBeDefined();
  });

  test('strips unknown fields rather than trusting client-supplied extras', () => {
    const { value } = paymentValidation.ValidateVerify({
      providerOrderId: 'order_1', providerPaymentId: 'pay_1', signature: 'sig',
      amount: 1, status: 'SUCCESS',
    });
    expect(value.amount).toBeUndefined();
    expect(value.status).toBeUndefined();
  });
});
