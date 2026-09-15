const responseConstants = require("../../constants/response.constatnts");
const statusCodes = require("../../constants/httpConstants");
const helper = require("../../helper/helper");
const { setAdminAuthCookie, clearAdminAuthCookie } = require("../../helper/authCookie");
const configenv = require("../../config/env.config");
const deleteConstants = require("../../constants/delete.constants")
const ModuleValidation = require("../../validation/admin/module.validation");
const moduleService = require("../../service/admin/module.service");
const adminModel = require("../../model/admin.model");
const statusConstants = require("../../constants/status.constants");
const moduleConstants = require("../../constants/module.constant");
const optModel = require("../../model/otp.model");
const auditLogConstants = require("../../constants/auditLogConstants");


class moduleController {
    add = async (request, response, nextFunction) => {
        try {
            const { error } = await ModuleValidation.validateAdd(request.body);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            const createdModule = await moduleService.add(request.body,request);
            return responseConstants.success(response, moduleConstants.MODULECREATED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    update = async (request, response, nextFunction) => {
        try {
            const { error } = await ModuleValidation.validateUpdate(request.body);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            await moduleService.update(request.body,request);
            return responseConstants.success(response, moduleConstants.MODULEUPDATED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    get = async (request, response, nextFunction) => {
        try {
            
            const data=await moduleService.get(request);
            return responseConstants.success(response, moduleConstants.MODULEGET, data, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    delete = async (request, response, nextFunction) => {
        try {
            const { error } = await ModuleValidation.validateStatus(request.query);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            await moduleService.delete(request);
            return responseConstants.success(response, moduleConstants.MODULEDELETED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    status = async (request, response, nextFunction) => {
        try {
            const { error } = await ModuleValidation.validateStatus(request.query);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            await moduleService.status(request);
            return responseConstants.success(response, moduleConstants.MODULESTATUSCHANGED, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };


   
}
module.exports = new moduleController()