const responseConstants = require("../../constants/response.constatnts");
const statusCodes = require("../../constants/httpConstants");
const subAdminValidation = require("../../validation/admin/subadmin.validation");
const subAdminService = require("../../service/admin/subadmin.service");
const passwordValidation = require("../../validation/app/password.validation");

const MESSAGES = {
    INVITED: "Invitation sent to the staff member",
    PASSWORD_SET: "Password set successfully",
    UPDATED: "Staff member updated successfully",
    FETCHED: "Staff fetched successfully",
    DELETED: "Staff member removed successfully",
    STATUS_CHANGED: "Staff status changed successfully",
};

class SubAdminController {
    add = async (request, response, nextFunction) => {
        try {
            const { error, value } = subAdminValidation.validateAdd(request.body);
            if (responseConstants.validatIonError(response, error)) return;
            await subAdminService.add(value, request);
            return responseConstants.success(response, MESSAGES.INVITED, null, statusCodes.OK);
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
            return responseConstants.success(response, MESSAGES.PASSWORD_SET, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    // Public: lets the set-password page show "already set" / "expired"
    // before asking for a password. 200 { valid, reason }.
    validateInvitation = async (request, response, nextFunction) => {
        try {
            const result = await subAdminService.validateInvitation(request.query?.token);
            return responseConstants.success(response, result.valid ? "Invitation link is valid." : result.message, { valid: result.valid, reason: result.valid ? "VALID" : result.reason }, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    update = async (request, response, nextFunction) => {
        try {
            const { error, value } = subAdminValidation.validateUpdate(request.body);
            if (responseConstants.validatIonError(response, error)) return;
            await subAdminService.update(value, request);
            return responseConstants.success(response, MESSAGES.UPDATED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    resendInvite = async (request, response, nextFunction) => {
        try {
            const { error } = subAdminValidation.validateId(request.query);
            if (responseConstants.validatIonError(response, error)) return;
            await subAdminService.resend(request);
            return responseConstants.success(response, MESSAGES.INVITED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    get = async (request, response, nextFunction) => {
        try {
            const data = await subAdminService.get(request);
            return responseConstants.success(response, MESSAGES.FETCHED, data, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    delete = async (request, response, nextFunction) => {
        try {
            const { error } = subAdminValidation.validateId(request.query);
            if (responseConstants.validatIonError(response, error)) return;
            await subAdminService.delete(request);
            return responseConstants.success(response, MESSAGES.DELETED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    status = async (request, response, nextFunction) => {
        try {
            const { error } = subAdminValidation.validateId(request.query);
            if (responseConstants.validatIonError(response, error)) return;
            await subAdminService.status(request);
            return responseConstants.success(response, MESSAGES.STATUS_CHANGED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
}
module.exports = new SubAdminController();