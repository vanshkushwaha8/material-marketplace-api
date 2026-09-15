const { createAuditLog } = require("../../helper/audit.helper");
const statusCodes = require("../../constants/httpConstants")
const responseConstants = require("../../constants/response.constatnts");
const sessionService = require("../../service/app/session.service");
const sessionValidation = require("../../validation/app/session.validation");
const sessionModel = require("../../model/session.model");
const auditLogConstants = require("../../constants/auditLogConstants");
class sessionController {
    delete = async (request, response, nextFunction) => {
        try {
            let validationResult = sessionValidation.ValidateDeleteSession(request.query);
            const validationError = responseConstants.validatIonError(response, validationResult.error);
            if (validationError) return;
            const data = await sessionService.delete(request);
            await createAuditLog({ req: request, userId: request?.auth?._id, action: auditLogConstants.SESSION_DELETE, entity: request?.auth.userType, entityId: request?.auth?._id });
            return responseConstants.success(response, "Device session is deleted successfully", null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    get = async (request, response, nextFunction) => {
        try {
            const data = await sessionService.sessions(request);
            await createAuditLog({ req: request, userId: request?.auth?._id, action: auditLogConstants.SESSION_GET, entity: request?.auth.userType, entityId: request?.auth?._id });
            return responseConstants.success(response, "Device sessions retrieved successfully", data, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    
}

module.exports = new sessionController();