const jwt = require("jsonwebtoken");
const responseConstants = require("../constants/response.constatnts");
const configenv = require("../config/env.config");
const auditLogConstants = require("../constants/auditLogConstants");
const CollectionName = require("../constants/auditLogcollection.constant");
const { createAuditLogAdmin } = require("../helper/audit.helper");
const statusConstants = require("../constants/status.constants");
const adminModel = require("../model/admin.model");
const permissionModel = require("../model/permission.model");
const statusCodes = require("../constants/httpConstants");
const mongoose = require("mongoose");
const logger = require("../logger/error.logger");
const sessionModel = require("../model/session.model");
const roleModel = require("../model/role.model");
const deleteConstants = require("../constants/delete.constants");
const helper = require('../helper/helper');
const { clearAdminAuthCookie } = require('../helper/authCookie');
const secretKey = configenv.SECRET_KEY;
const INACTIVITY_MS = 15 * 60 * 1000;
const getClientIp = (request) =>
    request.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    request.socket?.remoteAddress ||
    request.ip;

const adminMiddleWare = async (request, response, nextFunction) => {
    try {
        const cookieToken = request.cookies?.[configenv.ADMIN_AUTH_COOKIE_NAME];
        let token = cookieToken;
        if (!token) {
            const bearerToken = request.headers["authorization"];
            if (!bearerToken) {
                clearAdminAuthCookie(response);
                return responseConstants.unauthorized(response, "Authorization token is missing.", statusCodes.UNAUTHORIZED);
            }
            const tokenParts = bearerToken.split(" ");
            if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer") {
                clearAdminAuthCookie(response);
                return responseConstants.unauthorized(response, "Invalid token format. Use 'Bearer <token>'.", statusCodes.UNAUTHORIZED);
            }
            token = tokenParts[1];
        }
        const hashToken = await helper.hashToken(token)
        let decodedToken;
        try {
            decodedToken = jwt.verify(token, secretKey);
        } catch {
            clearAdminAuthCookie(response);
            return responseConstants.unauthorized(response, "Invalid or expired token.", statusCodes.UNAUTHORIZED);
        }
        if (!decodedToken?._id || !mongoose.Types.ObjectId.isValid(decodedToken._id)) {
            clearAdminAuthCookie(response);
            return responseConstants.unauthorized(response, "Invalid token payload.", statusCodes.UNAUTHORIZED);
        }
        const adminData = await adminModel.findOne({ _id: decodedToken._id, status: statusConstants.active, is_deleted: deleteConstants.NOT_DELETED });
        if (!adminData) {
            await sessionModel.deleteOne({ adminId: decodedToken._id, token: hashToken }).catch(() => { });
            clearAdminAuthCookie(response);
            return responseConstants.unauthorized(response, "Admin does not exist.", statusCodes.UNAUTHORIZED);
        }
        const fifteenMinutesAgo = new Date(Date.now() - INACTIVITY_MS);
        if (adminData.inactivityDate && new Date(adminData.inactivityDate) < fifteenMinutesAgo) {
            await createAuditLogAdmin({
                req: request, adminId: adminData?._id,
                action: auditLogConstants.SESSION_TIME_OUT,
                entity: CollectionName.admins,
                entityId: adminData?._id, metadata: {}
            });
            await sessionModel.deleteOne({
                adminId: adminData._id,
                token: hashToken,
            });
            clearAdminAuthCookie(response);
            return responseConstants.unauthorized(response, "Your session is expired. Please login again", statusCodes.UNAUTHORIZED);
        }
        const ipAddress = getClientIp(request);
        const sessionData = await sessionModel.findOne({ adminId: adminData._id, token: hashToken, expireOn: { $gt: new Date() } });
        if (!sessionData) {
            clearAdminAuthCookie(response);
               await createAuditLogAdmin({
                req: request, adminId: adminData?._id,
                action: auditLogConstants.SESSION_TIME_OUT,
                entity: CollectionName.admins,
                entityId: adminData?._id, metadata: {}
            });
            return responseConstants.unauthorized(response, "Your session is expired. Please login again", statusCodes.UNAUTHORIZED);
        }
        if (sessionData.ipAddress && ipAddress && sessionData.ipAddress !== ipAddress) {
            await sessionModel.findByIdAndUpdate(sessionData._id, { ipAddress });
        } else if (!sessionData.ipAddress && ipAddress) {
            await sessionModel.findByIdAndUpdate(sessionData._id, { ipAddress });
        }
        await adminModel.findByIdAndUpdate(adminData._id, { inactivityDate: new Date() });
        adminData.resData = { token };
        request.auth = adminData;
        return nextFunction();

    } catch (error) {
        logger.error(`Unexpected Error: admin middleware: ${error.message}`, { message: error.message, stack: error.stack });
        return responseConstants.error(response, "An unexpected error occurred.", statusCodes.INTERNAL_SERVER_ERROR);
    }
};

module.exports = adminMiddleWare;
