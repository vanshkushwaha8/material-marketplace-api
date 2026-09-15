const responseConstants = require("../../constants/response.constatnts");
const statusCodes = require("../../constants/httpConstants");
const deleteConstants = require("../../constants/delete.constants")
const ModuleValidation = require("../../validation/admin/module.validation");
const RoleValidation = require("../../validation/admin/role.validation");
const roleService = require("../../service/admin/role.service");
const adminModel = require("../../model/admin.model");
const statusConstants = require("../../constants/status.constants");
const moduleConstants = require("../../constants/module.constant");
const auditLogConstants = require("../../constants/auditLogConstants");
class roleController {
    add = async (request, response, nextFunction) => {
        try {
            const { error } = await RoleValidation.validateAdd(request.body);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            const createdRole = await roleService.add(request.body,request);
            return responseConstants.success(response, moduleConstants.ROLECREATED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    update = async (request, response, nextFunction) => {
        try {
            const { error } = await RoleValidation.validateUpdate(request.body);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            await roleService.update(request.body,request);
            return responseConstants.success(response, moduleConstants.ROLEUPDATED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    get = async (request, response, nextFunction) => {
        try {
            
            const data=await roleService.get(request.body);
            return responseConstants.success(response, moduleConstants.ROLEFETCHED, data, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    delete = async (request, response, nextFunction) => {
        try {
            const { error } = await ModuleValidation.validateStatus(request.query);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            await roleService.delete(request);
            return responseConstants.success(response, moduleConstants.ROLEDELETED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    status = async (request, response, nextFunction) => {
        try {
            const { error } = await ModuleValidation.validateStatus(request.query);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            await roleService.status(request);
            return responseConstants.success(response, moduleConstants.ROLESTATUSCHANGED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };


   
}
module.exports = new roleController()