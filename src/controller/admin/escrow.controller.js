const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const adminEscrowService = require('../../service/admin/escrow.service');
const commissionService = require('../../service/app/commission.service');
const validation = require('../../validation/admin/escrow.validation');
const PERMISSIONS = require('../../constants/permission.constant');
const { hasPermission } = require('../../helper/permissionCheck.helper');

class AdminEscrowController {
  getDetail = async (request, response, nextFunction) => {
    try {
      const result = await adminEscrowService.getDetail(request.params.id);
      return responseConstants.success(response, 'Transaction payment detail fetched', result, statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };

  performAction = async (request, response, nextFunction) => {
    try {
      const { error, value } = validation.ValidateAction(request.body);
      if (responseConstants.validatIonError(response, error)) return;
      const result = await adminEscrowService.performAction({
        transactionId: request.params.id,
        ...value,
        // Header wins: clients send `Idempotency-Key` per click.
        idempotencyKey: request.get('Idempotency-Key') || value.idempotencyKey || null,
        adminId: request.auth._id,
        canManual: await hasPermission(request.auth, PERMISSIONS.PAYMENTCONTROL.MANUAL_RESOLUTION),
        req: request,
      });
      return responseConstants.success(response, result.duplicate ? 'Already processed — no changes made' : 'Payment action completed', result.transaction, statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };

  attentionQueue = async (request, response, nextFunction) => {
    try {
      const result = await adminEscrowService.attentionQueue(request.query);
      return responseConstants.success(response, 'Transactions needing attention fetched', result, statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };

  getCommission = async (request, response, nextFunction) => {
    try {
      const [current, history] = await Promise.all([
        commissionService.getCurrentRates(),
        commissionService.history({ sellerType: request.query.sellerType, page: request.query.page, limit: request.query.limit }),
      ]);
      return responseConstants.success(response, 'Commission settings fetched', { current, history }, statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };

  updateCommission = async (request, response, nextFunction) => {
    try {
      const { error, value } = validation.ValidateCommission(request.body);
      if (responseConstants.validatIonError(response, error)) return;
      const row = await commissionService.update({ ...value, adminId: request.auth._id, req: request });
      return responseConstants.success(response, `${value.sellerType === 'BUSINESS_STORE' ? 'Business Store' : 'Individual'} commission set to ${row.pct}%`, row, statusCodes.OK);
    } catch (error) {
      if (error instanceof commissionService.CommissionError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };
}

module.exports = new AdminEscrowController();
