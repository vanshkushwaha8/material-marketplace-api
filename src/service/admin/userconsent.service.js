const { default: mongoose } = require("mongoose");
const helper = require("../../helper/helper");
const userConsentModel = require("../../model/userconsent.model");
const deleteConstants = require("../../constants/delete.constants")
const userTypeConstants = require("../../constants/usertype.constants")
const logger = require("../../logger/error.logger");
const auditLogConstants = require("../../constants/auditLogConstants");
const CollectionName = require("../../constants/auditLogcollection.constant");
const statusCodes = require("../../constants/httpConstants");
const { createAuditLogAdmin } = require("../../helper/audit.helper");
const statusConstants = require("../../constants/status.constants");
const userConsentService = {}
class UserConsentError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = 'UserConsentError';
        this.statusCode = statusCode;
    }
}
userConsentService.UserConsentError = UserConsentError;
userConsentService.add = async (request) => {
    const userType = request.body.userType || 'all';
    const overlappingUserTypes = userType === 'all'
        ? [userTypeConstants.Buyer, userTypeConstants.Seller, 'all']
        : [userType, 'all'];
    await userConsentModel.updateMany(
        { type: request.body.type, userType: { $in: overlappingUserTypes }, is_deleted: deleteConstants.NOT_DELETED },
        { $set: { status: statusConstants.inactive } }
    );
    try {
        const data = await userConsentModel.create({
            ...request.body,
            userType,
            status: statusConstants.active
        });
        await createAuditLogAdmin({
            req: request,
            adminId: request?.auth._id,
            action: auditLogConstants.ADMIN_ADD_USERCONSENT,
            entity: CollectionName.userconsents,
            entityId: data._id, metadata: {}
        });
        return data;
    } catch (error) {
        if (error?.code === 11000) {
            throw new UserConsentError(
                'Could not publish this version — a database index from before Investor/Developer consent separation may still be blocking it. Restart the backend (it auto-repairs this on startup) and try again.',
                409
            );
        }
        throw error;
    }
};
userConsentService.update = async (request) => {
    if (request.body.status === statusConstants.active) {
        const userType = request.body.userType || 'all';
        const overlappingUserTypes = userType === 'all'
            ? [userTypeConstants.Buyer, userTypeConstants.Seller, 'all']
            : [userType, 'all'];
        await userConsentModel.updateMany(
            {
                _id: { $ne: new mongoose.Types.ObjectId(request.body._id) },
                type: request.body.type,
                userType: { $in: overlappingUserTypes },
                is_deleted: deleteConstants.NOT_DELETED
            },
            { $set: { status: statusConstants.inactive } }
        );
    }
    try {
        await userConsentModel.updateOne(
            { _id: new mongoose.Types.ObjectId(request?.body?._id) },
            { $set: request.body }
        );
    } catch (error) {
        if (error?.code === 11000) {
            throw new UserConsentError(
                'Could not activate this version — a database index from before Investor/Developer consent separation may still be blocking it. Restart the backend (it auto-repairs this on startup) and try again.',
                409
            );
        }
        throw error;
    }
};
userConsentService.delete = async (request) => {
    const moduleData = await userConsentModel.findOne({ _id: request?.query?._id, is_deleted: deleteConstants.NOT_DELETED })
    if (!moduleData) {
        throw Object.assign(new Error("Consent not found"), { statusCode: statusCodes.NOT_FOUND });
    }
    await userConsentModel.findByIdAndUpdate({ _id: new mongoose.Types.ObjectId(request?.query?._id) },
        { is_deleted: deleteConstants.DELETED })
    await createAuditLogAdmin({
        req: request,
        adminId: request?.auth._id,
        action: auditLogConstants.ADMIN_DELETE_USERCONSENT,
        entity: CollectionName.userconsents,
        entityId: moduleData?._id,
        fromState: "NOT_DELETED",
        toState: "DELETED",
        metadata: {
            roleId: moduleData._id,
            deleteType: "SOFT_DELETE"
        }
    });
}
userConsentService.get = async (request) => {
    const currentDate = new Date();
    const query = {
        status: statusConstants.active,
        is_deleted: deleteConstants.NOT_DELETED,
        startDate: { $lte: currentDate }
    };
    const userType = request?.query?.userType;
    if (userType === userTypeConstants.Buyer || userType === userTypeConstants.Seller) {
        query.userType = { $in: [userType, 'all'] };
    }
    const data = await userConsentModel.find(query);
    if (query.userType) {
        return helper.mostSpecificConsentPerType(data);
    }

    return data;
};
userConsentService.status = async (request) => {
    const userConsent = await userConsentModel.findOne({ _id: request?.query?._id, is_deleted: "0" });
    if (!userConsent) {
        return { status: false, message: "Consent record not found" };
    }
    if (userConsent.status == statusConstants.active) {
        await userConsentModel.findByIdAndUpdate({ _id: new mongoose.Types.ObjectId(request?.query?._id) }, { status: statusConstants.inactive })
        await createAuditLogAdmin({
            req: request, adminId: request?.auth._id,
            action: auditLogConstants.ADMIN_UPDATE_STATUS_USERCONSENT,
            entity: CollectionName.userconsents,
            entityId: userConsent._id,
            fromState: statusConstants.active,
            toState: statusConstants.inactive,
            metadata: {
                consentId: userConsent._id,
                deleteType: "CHANGE_STATUS"
            }
        });
    } else {
        await userConsentModel.findByIdAndUpdate({ _id: new mongoose.Types.ObjectId(request?.query?._id) }, { status: statusConstants.active })

        await createAuditLogAdmin({
            req: request, adminId: request?.auth._id,
            action: auditLogConstants.ADMIN_UPDATE_STATUS_USERCONSENT,
            entity: CollectionName.userconsents,
            entityId: userConsent._id,
            fromState: statusConstants.active,
            toState: statusConstants.inactive,
            metadata: {
                consentId: userConsent._id,
                deleteType: "CHANGE_STATUS"
            }
        });
    }
};
userConsentService.getAll = async (request) => {
    const search = request?.query?.search || "";
    const type = request?.query?.type || "";
    const status = request?.query?.status || "";
    const userType = request?.query?.userType || "";
    const page = Number(request?.query?.page) || 1;
    const limit = Number(request?.query?.limit) || 10;
    const skip = (page - 1) * limit;
    const matchCondition = {
        is_deleted: deleteConstants.NOT_DELETED,
    };

    if (search) {
        matchCondition.$or = [
            { version: { $regex: search, $options: "i" } },
            { type: { $regex: search, $options: "i" } },
        ];
    }

    if (type) {
        matchCondition.type = type;
    }

    if (status) {
        matchCondition.status = status;
    }

    if (userType) {
        matchCondition.userType = userType;
    }
    const data = await userConsentModel.aggregate([
        {
            $match: matchCondition
        },
        {
            $project: {
                is_deleted: 0,
                __v: 0,
            }
        },
        {
            $sort: { createdAt: -1 }
        },
        helper.applyPagination(skip, limit),
    ]);

    const response = {
        getData: data?.[0]?.paginatedResults || [],
        count: data?.[0]?.totalCount?.[0]?.total || 0
    };
    return response;
};
module.exports = userConsentService