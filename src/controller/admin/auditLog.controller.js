const responseConstants = require("../../constants/response.constatnts");
const statusCodes = require("../../constants/httpConstants");
const auditLogService = require("../../service/admin/auditLog.service");

class auditLogController {
    get = async (request, response, nextFunction) => {
        try {
            const data = await auditLogService.get(request);
            return responseConstants.success(response, "audit log fetched successfully", data, statusCodes.OK);
        } catch (error) {
            nextFunction(error);
        }
    };

    getActionOptions = async (request, response, nextFunction) => {
        try {
            const data = auditLogService.getActionOptions();
            return responseConstants.success(response, "action options fetched successfully", data, statusCodes.OK);
        } catch (error) {
            nextFunction(error);
        }
    };

    getRoleOptions = async (request, response, nextFunction) => {
        try {
            const data = auditLogService.getRoleOptions();
            return responseConstants.success(response, "role options fetched successfully", data, statusCodes.OK);
        } catch (error) {
            nextFunction(error);
        }
    };

    export = async (request, response, nextFunction) => {
        try {
            const { buffer, contentType, filename } = await auditLogService.exportLogs(request);
            response.setHeader('Content-Type', contentType);
            response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            response.setHeader('Content-Length', buffer.length);
            return response.status(statusCodes.OK).send(buffer);
        } catch (error) {
            if (error.statusCode) {
                return response.status(error.statusCode).json({
                    success: false,
                    message: error.message,
                });
            }
            nextFunction(error);
        }
    };
}

module.exports = new auditLogController();