const { clearAuthCookie } = require("../../helper/authCookie");
const statusCodes = require("../../constants/httpConstants")
const responseConstants = require("../../constants/response.constatnts");
const sessionService = require("../../service/app/session.service");
const sessionValidation = require("../../validation/app/session.validation");
class sessionController {
    delete = async (request, response, nextFunction) => {
        try {
            let validationResult = sessionValidation.ValidateDeleteSession(request.query);
            const validationError = responseConstants.validatIonError(response, validationResult.error);
            if (validationError) return;
            const data = await sessionService.delete(request);
            // Ending the session you're using is a sign-out.
            if (data.endedCurrent) clearAuthCookie(response);
            return responseConstants.success(response, data.endedCurrent ? "Signed out of this device" : "Device signed out", data, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    deleteOthers = async (request, response, nextFunction) => {
        try {
            const count = await sessionService.deleteOthers(request);
            return responseConstants.success(response, count ? `Signed out of ${count} other device${count === 1 ? '' : 's'}` : "No other devices were signed in", { count }, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    get = async (request, response, nextFunction) => {
        try {
            const data = await sessionService.sessions(request);
            return responseConstants.success(response, "Device sessions retrieved successfully", data, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    
}

module.exports = new sessionController();