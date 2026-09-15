const bcrypt = require("bcrypt");
const path = require("path")
const jwt = require("jsonwebtoken");
const otpGenerator = require('otp-generator');
const configenv = require('../config/env.config');
const { mkdir } = require('node:fs/promises');
const fs = require("fs");
const helper = {}
const crypto = require("crypto");
const saltnumber = configenv.COST_FACTOR;
const secretkey = configenv.SECRET_KEY;
const PDFDocument = require("pdfkit");
const sessionModel = require("../model/session.model");
const BASE_PATH = "public/documents";
helper.createPassword = async (password) => {
    return await bcrypt.hash(password, configenv.COST_FACTOR);
}
helper.comparePassword = async (password, hashPassword) => {
    return await bcrypt.compare(password, hashPassword)
}
// Transparent hash-cost upgrade — the second half of Bug M-03's fix
// requirement. bcrypt encodes its own cost factor in the hash string
// itself, so this can tell an old cost-10 hash from a current cost-12 one
// without any extra metadata. Called right after a successful password
// verify in every login/password-check path; a mismatch means the
// account predates the cost-factor fix, so it's silently re-hashed at the
// current cost and persisted — the user experiences nothing different,
// but their stored hash strengthens the next time they authenticate.
helper.upgradePasswordHashIfNeeded = async (userModelRef, userId, plainPassword, currentHash) => {
    try {
        const currentCost = bcrypt.getRounds(currentHash);
        if (currentCost >= configenv.COST_FACTOR) return;
        const upgradedHash = await bcrypt.hash(plainPassword, configenv.COST_FACTOR);
        await userModelRef.findByIdAndUpdate(userId, { password: upgradedHash });
    } catch (_err) {
        // Never let a hash-upgrade failure block an otherwise-successful
        // login — this is a best-effort strengthening, not a gate.
    }
};
helper.hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
helper.hashPassword = async (plain) => bcrypt.hash(plain, configenv.COST_FACTOR);
helper.compareprotectedLinksPassword = function (candidate) {
    return bcrypt.compare(candidate, this.protectedLinksPassword);
};
// expiresIn override added for short-lived, scope-restricted tokens (e.g. the
// consent-only token issued mid-login — see auth.controller.js#login).
// Defaults to the original 24h so every existing call site is unaffected.
helper.generateTokken = (Data, expiresIn = "24h") => {
    return jwt.sign(Data, secretkey, { expiresIn })
}
helper.deleteSession = async (userId) => {
    await sessionModel.deleteMany({ userId: userId })
}
helper.AdmindeleteSession = async (userId) => {
    await sessionModel.deleteMany({ adminId: userId })
}
helper.verifyToken = (token) => {
    try {
        const decoded = jwt.verify(token, secretkey);
        return { success: true, data: decoded };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
helper.applyPagination = (skip, limit = 5) => {
    return {
        $facet: {
            paginatedResults: [
                { $skip: skip },
                { $limit: limit }
            ],
            totalCount: [{ $count: "total" }]
        }
    };
};
helper.getFilteredTopic = (language) => ({
    $filter: {
        input: "$topic",
        as: "t",
        cond: { $eq: ["$$t.language", language] },
    },
});
helper.otp = () => {
    const response = otpGenerator.generate(6, {
        upperCaseAlphabets: false,
        lowerCaseAlphabets: false,
        specialChars: false,
    });
    return response
}
const { resolveTempUploadPath } = require('../service/upload/tempUploadPathResolver');

helper.moveFileFromFolder = async (filename, targetFolder) => {
    const targetDir = path.join(__dirname, "../../public", targetFolder);
    await mkdir(targetDir, { recursive: true });

    // Was: jetpack.cwd("public/tempUploads").find({ matching: filename })
    // — an O(n) scan of the ENTIRE tempUploads directory to find a file
    // whose exact path was already knowable. resolveTempUploadPath()
    // computes the path directly (from the filename's own leading
    // timestamp — see tempUploadPathResolver.js), so this is now a single
    // O(1) rename with no directory listing at all, regardless of how
    // many files are sitting in tempUploads.
    const srcPath = resolveTempUploadPath(filename);
    const destPath = path.join(targetDir, filename);
    try {
        await fs.promises.rename(srcPath, destPath);
    } catch (err) {
        if (err.code === 'ENOENT') return; // same "silently no-op if the temp file's gone" behavior as the old fs.existsSync guard
        throw err;
    }
}

helper.createPDF = async (fileName, title, lines) => {
    if (!fs.existsSync(BASE_PATH)) fs.mkdirSync(BASE_PATH, { recursive: true });

    const filePath = path.join(BASE_PATH, fileName);
    const pdf = new PDFDocument();
    pdf.pipe(fs.createWriteStream(filePath));
    pdf.fontSize(18).text(title, { align: "center" }).moveDown();
    lines.forEach(l => pdf.fontSize(12).text(l).moveDown());
    pdf.end();
    return filePath;
};
helper.getIpAddress = (request) => {
    return (
        request.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        request.socket?.remoteAddress ||
        request.ip ||
        ""
    );
};

// Collapses a list of active consents down to the single most-specific
// one per `type` — a concrete userType match (Investor/Developer) wins
// over 'all' whenever both happen to be active for the same type at once.
// This is the one place that decision is made; every consent-reading path
// (checkConsentUpdates, the public get() endpoint, getProfileConsents)
// calls this instead of each independently deciding which record "really"
// applies to a given user.
helper.mostSpecificConsentPerType = (consents) => {
    const byType = {};
    for (const consent of consents) {
        const existing = byType[consent.type];
        const isMoreSpecific = !existing || (existing.userType === 'all' && consent.userType !== 'all');
        if (isMoreSpecific) byType[consent.type] = consent;
    }
    return Object.values(byType);
};

module.exports = helper