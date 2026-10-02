const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const adminUserService = require('../../service/admin/user.service');
const adminUserValidation = require('../../validation/admin/user.validation');

// Thin controller — validation + HTTP mapping only; all querying lives in
// service/admin/user.service.js (same split as the other admin modules).
class AdminUserController {
  handle(response, nextFunction, error) {
    if (error instanceof adminUserService.AdminUserError) {
      return responseConstants.BadRequest(response, error.message, null, error.statusCode);
    }
    return nextFunction(error);
  }

  list = async (request, response, nextFunction) => {
    try {
      const { error, value } = adminUserValidation.ValidateList(request.query);
      if (responseConstants.validatIonError(response, error)) return;
      const result = await adminUserService.list(value);
      return responseConstants.success(response, 'Users fetched', result, statusCodes.OK);
    } catch (error) { return this.handle(response, nextFunction, error); }
  };

  getOne = async (request, response, nextFunction) => {
    try {
      const result = await adminUserService.getOne({ userId: request.params.id, adminId: request.auth._id, req: request });
      return responseConstants.success(response, 'User fetched', result, statusCodes.OK);
    } catch (error) { return this.handle(response, nextFunction, error); }
  };

  // One handler per related collection, all paginated server-side.
  sub = (kind) => async (request, response, nextFunction) => {
    try {
      const { error, value } = adminUserValidation.ValidateSub(request.query, kind);
      if (responseConstants.validatIonError(response, error)) return;
      const result = await adminUserService[kind]({ userId: request.params.id, ...value });
      return responseConstants.success(response, `User ${kind} fetched`, result, statusCodes.OK);
    } catch (error) { return this.handle(response, nextFunction, error); }
  };

  updateStatus = async (request, response, nextFunction) => {
    try {
      const { error, value } = adminUserValidation.ValidateStatus(request.body);
      if (responseConstants.validatIonError(response, error)) return;
      const result = await adminUserService.updateStatus({ userId: request.params.id, ...value, adminId: request.auth._id, req: request });
      return responseConstants.success(response, value.status === 'suspended' ? 'Account suspended' : 'Account reactivated', result, statusCodes.OK);
    } catch (error) { return this.handle(response, nextFunction, error); }
  };
}

module.exports = new AdminUserController();
