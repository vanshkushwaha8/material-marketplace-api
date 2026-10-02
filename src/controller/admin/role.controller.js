const responseConstants = require("../../constants/response.constatnts");
const statusCodes = require("../../constants/httpConstants");
const RoleValidation = require("../../validation/admin/role.validation");
const roleService = require("../../service/admin/role.service");

class RoleController {
    catalog = async (request, response, nextFunction) => {
        try {
            return responseConstants.success(response, "Permission catalog fetched", roleService.catalog(), statusCodes.OK);
        } catch (error) {
            nextFunction(error);
        }
    };

    add = async (request, response, nextFunction) => {
        try {
            const { error, value } = RoleValidation.validateAdd(request.body);
            if (responseConstants.validatIonError(response, error)) return;
            const role = await roleService.add(value, request);
            return responseConstants.success(response, "Role created successfully", role, statusCodes.OK);
        } catch (error) {
            nextFunction(error);
        }
    };

    update = async (request, response, nextFunction) => {
        try {
            const { error, value } = RoleValidation.validateUpdate(request.body);
            if (responseConstants.validatIonError(response, error)) return;
            const role = await roleService.update(value, request);
            return responseConstants.success(response, "Role updated successfully", role, statusCodes.OK);
        } catch (error) {
            nextFunction(error);
        }
    };

    get = async (request, response, nextFunction) => {
        try {
            const data = await roleService.get(request);
            return responseConstants.success(response, "Roles fetched successfully", data, statusCodes.OK);
        } catch (error) {
            nextFunction(error);
        }
    };

    delete = async (request, response, nextFunction) => {
        try {
            const { error } = RoleValidation.validateId(request.query);
            if (responseConstants.validatIonError(response, error)) return;
            await roleService.delete(request);
            return responseConstants.success(response, "Role deleted successfully", null, statusCodes.OK);
        } catch (error) {
            nextFunction(error);
        }
    };

    status = async (request, response, nextFunction) => {
        try {
            const { error } = RoleValidation.validateId(request.query);
            if (responseConstants.validatIonError(response, error)) return;
            const role = await roleService.status(request);
            return responseConstants.success(response, "Role status changed successfully", role, statusCodes.OK);
        } catch (error) {
            nextFunction(error);
        }
    };
}

module.exports = new RoleController();
