const sessionModel = require('../../model/session.model');
const statusCodes = require("../../constants/httpConstants");
const { createAuditLog } = require("../../helper/audit.helper");
const CollectionName = require("../../constants/auditLogcollection.constant");
const auditLogConstants = require("../../constants/auditLogConstants")
const sessionService = {};
// Live sessions of the signed-in user (never the token hash), newest
// first, with the one making this request flagged as `current`.
sessionService.sessions = async (request) => {
    const currentId = String(request?.session?._id || '');
    const sessions = await sessionModel
        .find({ userId: request?.auth?._id, expireOn: { $gt: new Date() } })
        .select('ipAddress userAgent createdAt updatedAt expireOn mfaVerified')
        .sort({ createdAt: -1 })
        .lean();
    return sessions.map((s) => ({ ...s, ipAddress: (s.ipAddress || '').replace('::ffff:', ''), current: String(s._id) === currentId }));
};

// "Sign out all other devices": every session of this user except the
// one making the request. Returns how many were ended.
sessionService.deleteOthers = async (request) => {
    const result = await sessionModel.deleteMany({ userId: request.auth._id, _id: { $ne: request.session?._id } });
    await createAuditLog({
        req: request,
        userId: request.auth._id,
        action: auditLogConstants.SESSION_DELETE,
        entity: CollectionName.sessions,
        entityId: request.auth._id,
        metadata: { deleteType: "ALL_OTHER_SESSIONS", count: result.deletedCount },
    });
    return result.deletedCount;
};
sessionService.delete = async (request) => {
    const sessionId = request.query._id;
    // Ownership: only this user's sessions; anyone else's id → 404.
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
    return { endedCurrent: String(result._id) === String(request?.session?._id || '') };
};
module.exports = sessionService;