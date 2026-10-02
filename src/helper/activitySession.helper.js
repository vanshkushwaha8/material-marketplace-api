const sessionModel = require("../model/session.model");
const helper = require("./helper");
const createActivitySession = async (request, userId, token) => {
    const hashToken = await helper.hashToken(token)
    const session = await sessionModel.create({ userId: userId, token: hashToken, ipAddress: helper.getIpAddress(request), userAgent: String(request?.headers?.['user-agent'] || '').slice(0, 300) });
};
module.exports = { createActivitySession, };