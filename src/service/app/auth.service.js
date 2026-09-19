const userModel = require('../../model/user.model');
const helper = require('../../helper/helper');
const { default: mongoose } = require('mongoose');
const fs = require('fs');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { createAuditLog } = require("../../helper/audit.helper");
const auditLogConstants = require("../../constants/auditLogConstants");
const userStatusConstants = require("../../constants/user.constants")
const statusConstants = require("../../constants/status.constants")
const deleteConstants = require("../../constants/delete.constants")
const userTypeConstants = require("../../constants/usertype.constants")
const path = require('path');
const sendEmail = require("../../helper/sendVerificationEmail");
const emailTemplateImage = require("../../config/template");
const configenv = require('../../config/env.config');
const otpModel = require('../../model/otp.model');
const verificationModel = require('../../model/verification.model');
const logger = require('../../logger/error.logger');
const verifyTemplate = require('../../templates/verified.template');
const sessionModel = require('../../model/session.model');
const userConsentModel = require('../../model/userconsent.model');
const userConsentHistoryModel = require('../../model/userConsentHistory.model');
const messageConstants = require('../../constants/message.constants');
const TwofaModel = require('../../model/twofa.model');
const twofaService = require('./twofa.service');
const activitySessionHelper = require('../../helper/activitySession.helper');
const storeProfileModel = require('../../model/storeProfile.model');
const { SELLER_TYPES } = require('../../constants/sellerType.constants');
const { STORE_VERIFICATION_STATES } = require('../../constants/storeProfile.constants');

// Mirrors materialListing.service.js's buildLocation() — `geo` is only
// set when real coordinates were supplied ("Use Current Location"),
// never auto-instantiated with empty coordinates (would break the
// 2dsphere index).
function buildUserLocation(location = {}) {
    const built = {
        city: location.city || '',
        state: location.state || '',
        pincode: location.pincode || '',
        area: location.area || '',
    };
    if (location.latitude != null && location.longitude != null) {
        built.geo = { type: 'Point', coordinates: [Number(location.longitude), Number(location.latitude)] };
    }
    return built;
}
const SUPPORTED_CONSENT_LANGUAGES = ["en", "fr"];
const normalizeConsentLanguage = (lang) => {
    if (!lang) return "en";
    const base = String(lang).split("-")[0].toLowerCase();
    return SUPPORTED_CONSENT_LANGUAGES.includes(base) ? base : "en";
};
const authService = {};
authService.register = async (request) => {
    const { body } = request;
    const { userType, sellerType } = body;
    body.userId = request.auth?._id || new mongoose.Types.ObjectId();
    if (userType === userTypeConstants.Buyer && userType === userTypeConstants.Seller && body.profile_pic?.file) {
        await helper.moveFileFromFolder(body.profile_pic.file, 'profilePicture');
        body.profile_pic = { file: body.profile_pic.file };
    }
    if (body.password) body.password = await helper.createPassword(body.password);
    const builtLocation = body.location ? buildUserLocation(body.location) : undefined;
    if (builtLocation) body.location = builtLocation;
    // The seller registration form no longer collects this at all
    // (BUILD MATERIAL only operates in India for sellers) — default it
    // rather than leaving it unset.
    if (userType === userTypeConstants.Seller && !body.countryOfResidence) {
        body.countryOfResidence = 'IN';
    }
    const userData = await userModel.create(body);

    // A Business/Store seller gets a StoreProfile alongside their User
    // doc — see storeProfile.schema.js. verificationStatus always starts
    // UNVERIFIED: there is no real store-verification step implemented,
    // so this must never be set to VERIFIED here.
    if (userType === userTypeConstants.Seller && sellerType === SELLER_TYPES.BUSINESS_STORE) {
        const store = await storeProfileModel.create({
            seller: userData._id,
            storeName: body.storeName,
            businessType: body.businessType,
            location: builtLocation,
            address: body.storeAddress,
            categories: body.categories || [],
            pickupAvailable: !!body.pickupAvailable,
            deliveryAvailable: !!body.deliveryAvailable,
            panNumber: body.panNumber || '',
            gstRegistered: !!body.gstRegistered,
            gstin: body.gstRegistered ? (body.gstin || '') : '',
            verificationStatus: STORE_VERIFICATION_STATES.UNVERIFIED,
            history: [{ action: 'CREATED', note: 'Created at registration' }],
        });
        await createAuditLog({ req: request, userId: userData._id, action: auditLogConstants.STORE_PROFILE_CREATED, entity: 'store_profiles', entityId: store._id });
    }
    const consentIds = [body.termsCondtions, body.privacyPolicy, body.cookiesPolicy
    ].filter(Boolean);
    if (consentIds.length) {
        const language = normalizeConsentLanguage(request?.query?.language);
        const consents = await userConsentModel.find({ _id: { $in: consentIds } });
        const history = consents.map((item) => ({
            userId: userData._id,
            consentId: item._id,
            type: item.type,
            userType: item.userType,
            version: item.version,
            language,
            acceptedAt: new Date(),
        }));
        await userConsentHistoryModel.insertMany(history);
    }
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = helper.hashToken(rawToken);
    await verificationModel.create({ userId: userData?._id, tokenHash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
    const subject = "Verification email"
    const verifyUrl = `${configenv.BACKEND_URL}?token=${rawToken}`;
    const html = await verifyTemplate({ verifyUrl });
    sendEmail(userData?.email, subject, html);
    await createAuditLog({ req: request, userId: userData._id, action: auditLogConstants.VERIFICATION_EMAIL_SENT, entity: userData.userType, entityId: userData._id });
    const result = {
        _id: userData?._id,
        availableStatus: userData?.availableStatus,
        fullName: userData?.fullName,
        email: userData?.email,
        userType: userData?.userType,
        profilePicture: userData?.profilePicture,
    };
    return result;
};
authService.login = async (request, userData) => {
    await userModel.findByIdAndUpdate(userData._id, { inactivityDate: new Date() });
    const token = await helper.generateTokken({ _id: userData._id, email: userData.email, userType: userData.userType });
    const ipAddress =
        request.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        request.socket.remoteAddress ||
        request.ip;
    const hashToken = await helper.hashToken(token)
    await sessionModel.create({ userId: userData?._id, token: hashToken, ipAddress: ipAddress, mfaVerified: true })
    const rounds = bcrypt.getRounds(userData?.password);
    if (request?.body?.password && rounds < configenv.COST_FACTOR) {
        const password = await bcrypt.hash(request.body.password, configenv.COST_FACTOR);
        await userModel.findByIdAndUpdate(userData._id, { password: password });
    }
    return {
        availableStatus: userData?.availableStatus, _id: userData?._id,
        fullName: userData?.fullName, email: userData?.email,
        userType: userData?.userType, sellerType: userData?.sellerType || null, token: token, createdAt: userData?.createdAt,
        profilePicture: userData?.profilePicture,
        mfaEnabled: userData?.mfaEnabled
    };

};

authService.completeLogin = async (request, userData) => {
    if (userData.mfaEnabled) {
        const twofa = await TwofaModel.findOne({ userId: userData._id });
        if (twofa) {
            const pendingToken = await twofaService.issuePendingLogin(userData._id);
            if (twofa.activeMethod === "email") {
                await twofaService.sendLoginEmailOtp(userData._id, otpModel);
            }
            await createAuditLog({ req: request, userId: userData._id, action: auditLogConstants.TWOFA_VERIFICATION_STARTED, entity: userData.userType, entityId: userData._id });
            await activitySessionHelper.createActivitySession(request, userData._id, pendingToken);
            return {
                message: messageConstants.USER.NEEDS_2FA,
                data: {
                    requires2FA: true,
                    activeMethod: twofa.activeMethod,
                    pendingToken
                }
            };
        }
    }
    const consentStatus = await authService.checkConsentUpdates(userData);
    if (consentStatus.needConsentUpdate) {
        const setupToken = await helper.generateTokken({
            _id: userData._id,
            email: userData.email,
            userType: userData.userType,
            scope: '2fa_setup_only'
        }, '15m');
        await activitySessionHelper.createActivitySession(request, userData._id, setupToken);
        await createAuditLog({
            req: request,
            userId: userData._id,
            action: auditLogConstants.CONSENT_UPDATE_REQUIRED,
            entity: userData.userType,
            entityId: userData._id
        });
        return {
            message: messageConstants.USER.NEEDS_CONSENT_UPDATE,
            data: {
                needConsentUpdate: true,
                updatedDocuments: consentStatus.updatedDocuments,
                requires2FASetup: false,
                mustLogoutAfterConsent: true,
                setupToken,
                user: {
                    _id: userData._id,
                    email: userData.email,
                    fullName: userData.fullName,
                    userType: userData.userType,
                    sellerType: userData.sellerType || null,
                    mfaEnabled: userData.mfaEnabled
                }
            }
        };
    }
    const sessionData = await authService.login(request, userData);
    await createAuditLog({ req: request, userId: userData._id, action: auditLogConstants.LOGIN, entity: userData.userType, entityId: userData._id });
    return {
        message: messageConstants.USER.LOGIN_SUCCESS(userData.fullName),
        data: { ...sessionData, needConsentUpdate: false }
    };
};

authService.update = async (request) => {
    const { body } = request;
    const { profilePicture, ...updateData } = body;
    const userData = await userModel.findOne({ _id: request?.auth?._id });
    if ((userData.userType === userTypeConstants.Seller || userData.userType === userTypeConstants.Buyer) && profilePicture) {
        const oldProfilePicture = userData.profilePicture || '';
        const newProfilePicture = profilePicture;
        const tempPath = path.join('public', 'tempUploads', newProfilePicture);
        if (fs.existsSync(tempPath)) {
            await helper.moveFileFromFolder(newProfilePicture, 'profile');
            fs.unlink(tempPath, (err) => {
                if (err) {
                    logger.error(`Failed to delete temp profile picture image: ${err.message}`, {
                        message: err.message,
                        stack: err.stack
                    });
                }
            });
            if (oldProfilePicture && oldProfilePicture !== newProfilePicture) {
                const oldProfilePicturePath = path.join('public', 'profile', oldProfilePicture);
                if (fs.existsSync(oldProfilePicturePath)) {
                    fs.unlink(oldProfilePicturePath, (err) => {
                        if (err) {
                            logger.error(`Failed to delete old profile picture image: ${err.message}`, {
                                message: err.message,
                                stack: err.stack
                            });
                        }
                    });
                }
            }
            updateData.profilePicture = newProfilePicture;
        }
    }
    await userModel.findByIdAndUpdate({ _id: request?.auth?._id }, { $set: updateData }, { new: true });
};
authService.checkConsentUpdates = async (user) => {
    const latestConsents = await userConsentModel.find({
        status: statusConstants.active,
        is_deleted: deleteConstants.NOT_DELETED,
        // Only consents that actually apply to this user's own type — a
        // Developer's consent update check must never be triggered by a
        // change to the Investor consent, and vice versa. 'all' still
        // applies to everyone (e.g. a platform-wide cookie policy).
        userType: { $in: [user.userType, 'all'] },
    });

    // If both an 'all' and a user-type-specific consent of the SAME type
    // are (incorrectly) active at once — a leftover from before every
    // add/update call correctly cross-deactivated overlapping scopes —
    // the more specific one is the one that actually applies to this
    // user; the 'all' one should be ignored for them entirely. Without
    // this, a user who accepts the correct (specific) consent would be
    // permanently flagged as needing to accept the OTHER (inapplicable)
    // one too, since they can only ever match one _id.
    const mostSpecificConsents = helper.mostSpecificConsentPerType(latestConsents);

    const updatedDocuments = [];

    for (const consent of mostSpecificConsents) {
        if (consent.type === 'TERMS') {
            if (!user.termsCondtions || user.termsCondtions.toString() !== consent._id.toString()) {
                updatedDocuments.push('TERMS');
            }
        }

        if (consent.type === 'PRIVACY') {
            if (!user.privacyPolicy || user.privacyPolicy.toString() !== consent._id.toString()) {
                updatedDocuments.push('PRIVACY');
            }
        }

        if (consent.type === 'COOKIE') {
            if (user.cookiesPolicy && user.cookiesPolicy.toString() !== consent._id.toString()) {
                updatedDocuments.push('COOKIE');
            }
        }
    }

    return {
        needConsentUpdate: updatedDocuments.length > 0,
        updatedDocuments
    };
};
authService.acceptConsent = async (request) => {
    const userId = request?.auth?._id;
    if (!userId) {
        throw new Error("Authenticated user not found.");
    }
    const body = request.body;
    const language = normalizeConsentLanguage(request?.query?.language);
    const ipAddress =
        request.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        request.socket.remoteAddress ||
        request.ip;
    const userAgent =
        request.headers["user-agent"] || "";
    const consentIds = [
        body.termsCondtions,
        body.privacyPolicy,
        body.cookiesPolicy
    ].filter(Boolean);
    const consents = await userConsentModel.find({
        _id: {
            $in: consentIds
        },
        status: "active",
        is_deleted: "0",
        userType: { $in: [request.auth.userType, 'all'] },
    });
    const termsConsent = consents.find(c => c.type === "TERMS");
    const privacyConsent = consents.find(c => c.type === "PRIVACY");
    if (!termsConsent) {
        throw Object.assign(
            new Error("Terms & Conditions consent not found."),
            { statusCode: 400 }
        );
    }
    if (!privacyConsent) {
        throw Object.assign(
            new Error("Privacy Policy consent not found."),
            { statusCode: 400 }
        );
    }
    const existingConsents = await userConsentHistoryModel.find({
        userId,
        consentId: { $in: consentIds }
    }).select("consentId");
    const existingConsentIds = existingConsents.map(item =>
        item.consentId.toString()
    );
    const allAlreadyAccepted = consentIds.every(id =>
        existingConsentIds.includes(id.toString())
    );
    if (allAlreadyAccepted) {
        throw Object.assign(
            new Error("You have already accepted these consent versions."),
            { statusCode: 409 }
        );
    }
    await userModel.updateOne(
        {
            _id: userId
        },
        {
            $set: {
                termsCondtions: body.termsCondtions,
                privacyPolicy: body.privacyPolicy,
                cookiesPolicy: body.cookiesPolicy || null
            }
        }
    );
    const history = consents.map(item => ({
        userId,
        consentId: item._id,
        type: item.type,
        userType: item.userType,
        version: item.version,
        language,
        acceptedAt: new Date(),
        ipAddress,
        userAgent
    }));
    await userConsentHistoryModel.insertMany(history);
};
authService.getProfileConsents = async (request) => {
    const userId = request.auth._id;
    const user = await userModel.findById(userId)
        .select(
            "termsCondtions privacyPolicy cookiesPolicy userType"
        );
    const latestConsentsRaw =
        await userConsentModel.find({
            status: statusConstants.active,
            is_deleted: deleteConstants.NOT_DELETED,
            userType: { $in: [user.userType, 'all'] },
        });
    const latestConsents = helper.mostSpecificConsentPerType(latestConsentsRaw);
    const history =
        await userConsentHistoryModel.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId)
                }
            },

            {
                $sort: {
                    acceptedAt: -1
                }
            },

            {
                $group: {

                    _id: "$type",

                    consentId: {
                        $first: "$consentId"
                    },

                    version: {
                        $first: "$version"
                    },

                    language: {
                        $first: "$language"
                    },

                    acceptedAt: {
                        $first: "$acceptedAt"
                    }

                }
            }

        ]);

    const historyMap =
        new Map();

    history.forEach(item => {

        historyMap.set(item._id, item);

    });

    const response = [];

    for (const consent of latestConsents) {

        const accepted =
            historyMap.get(consent.type);

        response.push({
            type: consent.type,
            acceptedVersion:
                accepted?.version || null,
            latestVersion:
                consent.version,
            acceptedLanguage:
                accepted?.language || null,
            acceptedAt:
                accepted?.acceptedAt || null,
            updateAvailable:
                accepted
                    ? accepted.consentId.toString() !== consent._id.toString()
                    : true
        });
    }
    return response;

};
authService.delete = async (request) => {
    const userId = request?.auth?._id;
    const user = await userModel.findById(userId);
    await helper.deleteSession(request?.auth?._id)
    if (user?.profilePicture && user.profilePicture.file) {
        const profilePicturePath = path.join('public', 'profilePicture', user.profilePicture.file);
        if (fs.existsSync(profilePicturePath)) {
            fs.unlink(profilePicturePath, (err) => {
                if (err) logger.error(`Failed to delete profile picture image: ${err.message}`, { message: err.message, stack: err.stack });

            });
        }
    }
    const data = await userModel.findByIdAndUpdate(
        { _id: new mongoose.Types.ObjectId(request?.auth?._id) },
        { is_deleted: "1" },
        { new: true }
    );

};
authService.getProfile = async (request) => {
    const userId = request?.auth?._id;
    const baseMatch = {
        is_deleted: deleteConstants.NOT_DELETED,
        _id: new mongoose.Types.ObjectId(userId),
    };
    const commonProjection = {
        _id: 1,
        fullName: 1,
        email: 1,
        phoneNumber: 1,
        userType: 1,
        buyerType: 1,
        sellerType: 1,
        location: 1,
        isEmailVerified: 1,
        profilePicture: 1,
        title: 1,
        preferredCurrency: 1,
        phoneNumber: 1,
        address1: 1,
        address2: 1,
        city: 1,
        state: 1,
        paymentMethodId: 1,
        zipCode: 1,
        countryOfResidence: 1,
        dob: 1,
        gender: 1,
        createdAt: 1
    };
    if (
        request?.auth?.userType === userTypeConstants.Seller ||
        request?.auth?.userType === userTypeConstants.Owner ||
        request?.auth?.userType === userTypeConstants.Buyer
    ) {
        const userData = await userModel.aggregate([
            { $match: baseMatch },
            {
                $project: {
                    ...commonProjection,
                    isPasswordKey: {
                        $cond: {
                            if: { $gt: [{ $strLenCP: { $ifNull: ["$password", ""] } }, 0] },
                            then: true,
                            else: false
                        }
                    }
                }
            }
        ]);

        return userData[0] || null;
    } else {
        const userData = await userModel.aggregate([
            { $match: baseMatch },
            { $project: { ...commonProjection } }
        ]);
        return userData[0] || null;
    }
};

module.exports = authService;