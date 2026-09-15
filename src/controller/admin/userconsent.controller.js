const responseConstants = require("../../constants/response.constatnts");
const userConsentService = require("../../service/admin/userconsent.service");
const userConsentModel = require("../../model/userconsent.model");
const statusCodes = require("../../constants/httpConstants");
const userConsentValidation = require("../../validation/admin/userconsent.validation");
const commonValidation = require("../../validation/admin/common.validation");
const { default: mongoose } = require("mongoose");
const auditLogConstants = require("../../constants/status.constants")
const deleteConstants = require("../../constants/delete.constants")
class userConsentController {
    add = async (request, response, nextFunction) => {
        try {
            let validationResult = userConsentValidation.validateadd(request.body)
            const validationError = responseConstants.validatIonError(response, validationResult.error);
            if (validationError) return;
            const data = await userConsentService.add(request);
            return responseConstants.success(response, "Data added successfully", null, statusCodes.OK);
        } catch (error) {
            if (error instanceof userConsentService.UserConsentError) {
                return responseConstants.BadRequest(response, error.message, null, error.statusCode || statusCodes.BAD_REQUEST);
            }
            nextFunction(error)
        }
    }
    update = async (request, response, nextFunction) => {
        try {
            let validationResult = userConsentValidation.validatUpdate(request.body)
            const validationError = responseConstants.validatIonError(response, validationResult.error);
            if (validationError) return;
            const latestConsent = await userConsentModel.findOne({
                _id: { $ne: request?.body?._id },
                type: request.body.type,
                is_deleted: "0"
            }).sort({ endDate: -1 });
            const data = await userConsentService.update(request);
            return responseConstants.success(response, "Data updated successfully", null, statusCodes.OK);
        } catch (error) {
            if (error instanceof userConsentService.UserConsentError) {
                return responseConstants.BadRequest(response, error.message, null, error.statusCode || statusCodes.BAD_REQUEST);
            }
            nextFunction(error)
        }

    }
    delete = async (request, response, nextFunction) => {
        try {
            let validationResult = commonValidation.validateForgetquery(request.query)
            const validationError = responseConstants.validatIonError(response, validationResult.error);
            if (validationError) return;
            const data = await userConsentService.delete(request);
    
            return responseConstants.success(response, "Data delete successfully", null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }

    }
    status = async (request, response, nextFunction) => {
        try {
            let validationResult = commonValidation.validateForgetquery(request.query)
            const validationError = responseConstants.validatIonError(response, validationResult.error);
            if (validationError) return;
            const data = await userConsentService.status(request);
        
            return responseConstants.success(response, "Data status update successfully", null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }

    }
    getAll = async (request, response, nextFunction) => {
        try {
            let validationResult = commonValidation.validateForgetquery(request.query)
            const validationError = responseConstants.validatIonError(response, validationResult.error);
            if (validationError) return;
            const data = await userConsentService.getAll(request);
           
            return responseConstants.success(response, "Data get successfully", data, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }

    }
    get = async (request, response, nextFunction) => {
        try {
            const data = await userConsentService.get(request);
            return responseConstants.success(response, "Data get successfully", data, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }

    }

}
module.exports = new userConsentController()