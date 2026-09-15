const sessionModel = require('../../model/session.model');
const statusCodes = require("../../constants/httpConstants");
const { createAuditLog } = require("../../helper/audit.helper");
const CollectionName = require("../../constants/auditLogcollection.constant");
const auditLogConstants = require("../../constants/auditLogConstants")
const sessionService = {};
sessionService.sessions = async (request) => {
    const sessions = await sessionModel.find({ userId: request?.auth?._id }, { token: 0 });

    return sessions
};
sessionService.delete = async (request) => {
    const sessionId = request.query._id;
    const result = await sessionModel.findOneAndDelete({
        _id: sessionId,
        userId: request.auth._id,
    });
    if (!result) {
        throw Object.assign(
            new Error("Session not found or access denied"),
            { statusCode: statusCodes.NOT_FOUND }
        );
    }
    await createAuditLog({
        req: request,
        userId: request?.auth._id,
        action: auditLogConstants.SESSION_DELETE,
        entity: CollectionName.sessions,
        entityId: sessionId,
        fromState: "HARD_DELETE",
        toState: "DELETED",
        metadata: {
            sessionId: sessionId,
            deleteType: "HARD_DELETE"
        }
    });
};
module.exports = sessionService;