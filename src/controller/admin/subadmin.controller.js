const responseConstants = require("../../constants/response.constatnts");
const statusCodes = require("../../constants/httpConstants");
const deleteConstants = require("../../constants/delete.constants")
const ModuleValidation = require("../../validation/admin/module.validation");
const subAdminValidation = require("../../validation/admin/subadmin.validation");
const subAdminService = require("../../service/admin/subadmin.service");
const adminModel = require("../../model/admin.model");
const passwordValidation = require("../../validation/app/password.validation");
const statusConstants = require("../../constants/status.constants");
const moduleConstants = require("../../constants/module.constant");
const auditLogConstants = require("../../constants/auditLogConstants");
class roleController {
    add = async (request, response, nextFunction) => {
        try {
            const { error } = await subAdminValidation.validateAdd(request.body);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            await subAdminService.add(request.body,request,request);
            return responseConstants.success(response, moduleConstants.SUBADMINCREATED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    passwordSet = async (request, response, nextFunction) => {
        try {
            const { error } = await passwordValidation.validateResetPassword(request.body);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            await subAdminService.passwordSet(request);
            return responseConstants.success(response, moduleConstants.PASSWORDSET, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    update = async (request, response, nextFunction) => {
        try {
            const { error } = await subAdminValidation.validateUpdate(request.body);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            await subAdminService.update(request.body, request);
            return responseConstants.success(response, moduleConstants.SUBADMINUPDATED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    resendInvite = async (request, response, nextFunction) => {
        try {
            const { error } = await ModuleValidation.validateStatus(request.query);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            await subAdminService.resend(request);
            return responseConstants.success(response, moduleConstants.SUBADMINCREATED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    get = async (request, response, nextFunction) => {
        try {
            
            const data=await subAdminService.get(request.body);
            return responseConstants.success(response, moduleConstants.SUBADMINFETCHED, data, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    delete = async (request, response, nextFunction) => {
        try {
            const { error } = await ModuleValidation.validateStatus(request.query);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            await subAdminService.delete(request);
            return responseConstants.success(response, moduleConstants.SUBADMINDELETED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    status = async (request, response, nextFunction) => {
        try {
            const { error } = await ModuleValidation.validateStatus(request.query);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            await subAdminService.status(request);
            return responseConstants.success(response, moduleConstants.SUBADMINSTATUSCHANGED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
}
module.exports = new roleController()