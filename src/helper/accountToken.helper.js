const crypto = require("crypto");
const passwordResetModel = require("../model/passwordReset.model");
const { TOKEN_TYPES } = require("../schema/passwordReset.Schema");
const helper = require("./helper");

// Single-use, expiring account tokens (password reset / staff invitation)
// for both realms. The raw token only ever exists in the emailed link; the
// database holds its SHA-256 hash. Validity is enforced here, server side:
//   type matches AND expiresAt > now AND usedAt == null AND revokedAt == null
// Consuming is one atomic update, so a link can't be used twice even by two
// simultaneous requests.

const ACCOUNTS = Object.freeze({ USER: "user", ADMIN: "admin" });
const STATES = Object.freeze({ VALID: "VALID", INVALID: "INVALID", EXPIRED: "EXPIRED", USED: "USED", REVOKED: "REVOKED" });

const TTL_MS = Object.freeze({
    [TOKEN_TYPES.PASSWORD_RESET]: 60 * 60 * 1000,          // 1 hour
    [TOKEN_TYPES.STAFF_INVITATION]: 24 * 60 * 60 * 1000,   // 24 hours
});
const TTL_LABEL = Object.freeze({
    [TOKEN_TYPES.PASSWORD_RESET]: "1 hour",
    [TOKEN_TYPES.STAFF_INVITATION]: "24 hours",
});

const MESSAGES = Object.freeze({
    [TOKEN_TYPES.PASSWORD_RESET]: {
        INVALID: "This password reset link is invalid. Please request a new one.",
        EXPIRED: "This password reset link has expired. Please request a new one.",
        USED: "This password reset link has already been used. If you need to change your password again, request a new link.",
        REVOKED: "This password reset link is no longer valid because a newer link was requested or your password was changed. Use the most recent email, or request a new link.",
    },
    [TOKEN_TYPES.STAFF_INVITATION]: {
        INVALID: "This invitation link is invalid. Ask the Super Admin to resend your invitation.",
        EXPIRED: "This invitation link has expired. Ask the Super Admin to resend your invitation.",
        USED: "Password has already been set. This link is no longer valid. If you want to change your password, use Forgot Password.",
        REVOKED: "This invitation link has been replaced by a newer one. Use the link in your most recent invitation email.",
    },
});

const TOKEN_FORMAT = /^[a-f0-9]{64}$/;
const ownerField = (account) => (account === ACCOUNTS.ADMIN ? "adminId" : "userId");

// Pre-tokenType records: admin ones were invitations, user ones resets.
const legacyType = (account) => (account === ACCOUNTS.ADMIN ? TOKEN_TYPES.STAFF_INVITATION : TOKEN_TYPES.PASSWORD_RESET);
const typeOf = (record) => record.tokenType || legacyType(record.adminId ? ACCOUNTS.ADMIN : ACCOUNTS.USER);
const typeFilter = (type, account) => (type === legacyType(account) ? { tokenType: { $in: [type, null] } } : { tokenType: type });
const activeFilter = (now) => ({ usedAt: null, revokedAt: null, used: { $ne: true }, expiresAt: { $gt: now } });

function stateOf(record, now = new Date()) {
    if (record.usedAt || record.used === true) return STATES.USED;
    if (record.revokedAt) return STATES.REVOKED;
    if (!(record.expiresAt > now)) return STATES.EXPIRED;
    return STATES.VALID;
}

/** Revoke every still-usable token of these types for one account. */
async function revokeActive({ account, ownerId, types = Object.values(TOKEN_TYPES), exceptId } = {}) {
    const now = new Date();
    const result = await passwordResetModel.updateMany(
        {
            [ownerField(account)]: ownerId,
            $or: types.map((type) => typeFilter(type, account)),
            ...activeFilter(now),
            ...(exceptId ? { _id: { $ne: exceptId } } : {}),
        },
        { $set: { revokedAt: now } }
    );
    return result.modifiedCount || 0;
}

/**
 * Create a new token, revoking the account's earlier ones of the same type
 * (only the newest emailed link works). Returns the raw token — put it in the
 * link and nowhere else (never log or persist it).
 */
async function issue({ type, account, ownerId }) {
    if (!TTL_MS[type]) throw new Error(`Unknown token type ${type}`);
    await revokeActive({ account, ownerId, types: [type] });
    const rawToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TTL_MS[type]);
    const record = await passwordResetModel.create({
        [ownerField(account)]: ownerId,
        tokenType: type,
        tokenHash: helper.hashToken(rawToken),
        expiresAt,
    });
    return { rawToken, record, expiresAt, validFor: TTL_LABEL[type] };
}

/** Most recent token of a type for an account (for resend cooldowns). */
async function latest({ type, account, ownerId }) {
    return passwordResetModel.findOne({ [ownerField(account)]: ownerId, ...typeFilter(type, account) }).sort({ createdAt: -1 }).lean();
}

/**
 * Look a raw token up for one type and realm. A token of another type or
 * realm (e.g. an invitation link sent to the reset endpoint, or a user reset
 * link sent to the admin one) is INVALID — tokens never cross over.
 * @returns {{ state: string, record: object|null, ownerId: any, message: string }}
 */
async function inspect(rawToken, { type, account }) {
    const result = (state, record = null) => ({ state, record, ownerId: record ? record[ownerField(account)] : null, message: state === STATES.VALID ? "" : MESSAGES[type][state] });
    if (typeof rawToken !== "string" || !TOKEN_FORMAT.test(rawToken)) return result(STATES.INVALID);
    const record = await passwordResetModel.findOne({ tokenHash: helper.hashToken(rawToken) }).lean();
    if (!record || !record[ownerField(account)] || typeOf(record) !== type) return result(STATES.INVALID);
    return result(stateOf(record), record);
}

/**
 * Atomically mark a token used. Returns false if it was used, revoked or
 * expired in the meantime (the caller must then refuse the request).
 */
async function consume(record) {
    const now = new Date();
    const claimed = await passwordResetModel.findOneAndUpdate(
        { _id: record._id, ...activeFilter(now) },
        { $set: { usedAt: now, used: true } },
        { new: true }
    ).lean();
    return Boolean(claimed);
}

module.exports = { TOKEN_TYPES, ACCOUNTS, STATES, TTL_LABEL, MESSAGES, issue, inspect, consume, revokeActive, latest, stateOf };
