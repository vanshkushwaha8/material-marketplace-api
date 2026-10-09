const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const adminEscrowService = require('../../service/admin/escrow.service');
const commissionService = require('../../service/app/commission.service');
const deliveryRateService = require('../../service/app/deliveryRate.service');
const vehicleTypeService = require('../../service/admin/vehicleType.service');
const validation = require('../../validation/admin/escrow.validation');
const { ADMIN_PERMISSIONS } = require('../../constants/rbac.constants');
const { accessFor, hasAll, hasAny, FORBIDDEN_MESSAGE } = require('../../helper/authorization.helper');
const { ForbiddenError } = require('../../utils/AppError');

// The route lets in anyone holding SOME payment-action permission; the
// action in the body decides which one is actually required.
async function assertActionAllowed(request, action) {
  const rule = adminEscrowService.ACTION_PERMISSIONS[action];
  const access = await accessFor(request);
  const ok = rule && (rule.all ? hasAll(access, rule.all) : hasAny(access, rule.any));
  if (!ok) throw new ForbiddenError(FORBIDDEN_MESSAGE);
  return access;
}

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
      const access = await assertActionAllowed(request, value.action);
      const result = await adminEscrowService.performAction({
        transactionId: request.params.id,
        ...value,
        // Header wins: clients send `Idempotency-Key` per click.
        idempotencyKey: request.get('Idempotency-Key') || value.idempotencyKey || null,
        adminId: request.auth._id,
        canManual: hasAll(access, [ADMIN_PERMISSIONS.PAYMENT_MANUAL_RESOLVE]),
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

  // Delivery rate card (base + ₹/km + ₹/kg) — current + change history.
  getDeliveryRates = async (request, response, nextFunction) => {
    try {
      const [current, rows] = await Promise.all([
        deliveryRateService.getCurrentRates(),
        deliveryRateService.history({ page: request.query.page, limit: request.query.limit }),
      ]);
      return responseConstants.success(response, 'Delivery rates fetched', { current, history: rows }, statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };

  updateDeliveryRates = async (request, response, nextFunction) => {
    try {
      const { error, value } = validation.ValidateDeliveryRates(request.body);
      if (responseConstants.validatIonError(response, error)) return;
      const row = await deliveryRateService.update({ ...value, adminId: request.auth._id, req: request });
      return responseConstants.success(response, 'Delivery rates updated', row, statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };

  // Delivery vehicle catalogue (vehicle_types) — used for the system's
  // vehicle recommendation and the buyer/seller vehicle choice.
  listVehicleTypes = async (request, response, nextFunction) => {
    try {
      const rows = await vehicleTypeService.list();
      return responseConstants.success(response, 'Vehicle types fetched', rows, statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };

  createVehicleType = async (request, response, nextFunction) => {
    try {
      const { error, value } = validation.ValidateVehicleType(request.body, { create: true });
      if (responseConstants.validatIonError(response, error)) return;
      const row = await vehicleTypeService.create({ body: value, adminId: request.auth._id, req: request });
      return responseConstants.success(response, 'Vehicle type added', row, statusCodes.OK);
    } catch (error) {
      if (error instanceof vehicleTypeService.VehicleTypeError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };

  updateVehicleType = async (request, response, nextFunction) => {
    try {
      const { error, value } = validation.ValidateVehicleType(request.body, { create: false });
      if (responseConstants.validatIonError(response, error)) return;
      const row = await vehicleTypeService.update({ id: request.params.id, body: value, adminId: request.auth._id, req: request });
      return responseConstants.success(response, 'Vehicle type updated', row, statusCodes.OK);
    } catch (error) {
      if (error instanceof vehicleTypeService.VehicleTypeError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };
}

module.exports = new AdminEscrowController();
