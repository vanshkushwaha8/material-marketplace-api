const responseConstants = require("../../constants/response.constatnts");
const statusCodes = require("../../constants/httpConstants");
const deleteConstants = require("../../constants/delete.constants")
const ModuleValidation = require("../../validation/admin/module.validation");
const PermissionValidation = require("../../validation/admin/permission.validation");
const permissionService = require("../../service/admin/permission.service");
const adminModel = require("../../model/admin.model");
const statusConstants = require("../../constants/status.constants");
const moduleConstants = require("../../constants/module.constant");
const auditLogConstants = require("../../constants/auditLogConstants");
class permissionController {
    add = async (request, response, nextFunction) => {
        try {
            const { error } = await PermissionValidation.validateAdd(request.body);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            const createdPermission = await permissionService.add(request.body,request);
            return responseConstants.success(response, moduleConstants.PERMISSIONCREATED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    update = async (request, response, nextFunction) => {
        try {
            const { error } = await PermissionValidation.validateUpdate(request.body);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            await permissionService.update(request.body,request);
            return responseConstants.success(response, moduleConstants.PERMISSIONUPDATED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    get = async (request, response, nextFunction) => {
        try {
            const data=await permissionService.get(request);
            return responseConstants.success(response, moduleConstants.PERMISSIONFETCHED, data, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    getAll = async (request, response, nextFunction) => {
        try {
            const data=await permissionService.getAll(request);
            return responseConstants.success(response, moduleConstants.PERMISSIONFETCHED, data, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    delete = async (request, response, nextFunction) => {
        try {
            const { error } = await ModuleValidation.validateStatus(request.query);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            await permissionService.delete(request);
            return responseConstants.success(response, moduleConstants.PERMISSIONDELETED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    status = async (request, response, nextFunction) => {
        try {
            const { error } = await ModuleValidation.validateStatus(request.query);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            await permissionService.status(request);
            return responseConstants.success(response, moduleConstants.PERMISSIONSTATUSCHANGED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };


   
}
module.exports = new permissionController()