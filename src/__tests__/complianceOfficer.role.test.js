/**
 * OPL-274/OPL-275 fixes:
 *  - userTypeConstants.ComplianceOfficer didn't exist at all, so every
 *    route gated by authMiddleware([userTypeConstants.ComplianceOfficer])
 *    was unreachable by any account, ever ([undefined] never matches a
 *    real userType). Fixed the constant + the schema enum.
 */

describe("userTypeConstants.ComplianceOfficer", () => {
  test("is now a real, defined value (was undefined before this fix)", () => {
    const userTypeConstants = require("../constants/usertype.constants");
    expect(userTypeConstants.ComplianceOfficer).toBe("ComplianceOfficer");
  });
});

jest.mock("../model/user.model", () => ({ findById: jest.fn() }));
jest.mock("../model/session.model", () => ({ find: jest.fn(), findOne: jest.fn(), create: jest.fn(), deleteMany: jest.fn() }));
jest.mock("../model/userconsent.model", () => ({ findOne: jest.fn() }));
jest.mock("../helper/sendVerificationEmail", () => jest.fn());
jest.mock("../templates/newlocation.template", () => ({ newLoginLocationTemplate: jest.fn() }));
jest.mock("../logger/error.logger", () => ({ error: jest.fn(), info: jest.fn() }));
jest.mock("../helper/helper", () => ({ hashToken: jest.fn(() => "hashed") }));
jest.mock("../config/env.config", () => ({
  SECRET_KEY: "test-secret",
  AUTH_COOKIE_NAME: "accessToken",
}));

const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const userModel = require("../model/user.model");
const sessionModel = require("../model/session.model");
const { authMiddleware } = require("../middleware/auth.middleware");
const userTypeConstants = require("../constants/usertype.constants");

function mockResponse() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("authMiddleware — ComplianceOfficer route guard actually works now", () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const validToken = jwt.sign({ _id: userId }, "test-secret");

  beforeEach(() => {
    sessionModel.findOne.mockResolvedValue({
      _id: "session-1",
      ipAddress: "127.0.0.1",
    });
  });

  test("a real ComplianceOfficer account is now let through (was impossible before this fix)", async () => {
    userModel.findById.mockResolvedValue({
      _id: userId,
      userType: "ComplianceOfficer",
      isEmailVerified: true,
      status: "active",
      is_deleted: "0",
      inactivityDate: new Date(),
      toObject: function () { return this; },
    });
    const req = { cookies: { accessToken: validToken }, headers: {}, path: "/screening/x/resolve", socket: {} };
    const res = mockResponse();
    const next = jest.fn();

    const middleware = authMiddleware([userTypeConstants.ComplianceOfficer]);
    await middleware(req, res, next);

    // Before the fix, allowedRoles was [undefined] and this always 403'd
    // regardless of the account. Now a real ComplianceOfficer account
    // should be let through to the route handler.
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(next).toHaveBeenCalled();
  });

  test("an Investor account is correctly still rejected from a ComplianceOfficer-only route", async () => {
    userModel.findById.mockResolvedValue({
      _id: userId,
      userType: "Investor",
      isEmailVerified: true,
      status: "active",
      is_deleted: "0",
      inactivityDate: new Date(),
      toObject: function () { return this; },
    });
    const req = { cookies: { accessToken: validToken }, headers: {}, path: "/screening/x/resolve", socket: {} };
    const res = mockResponse();
    const next = jest.fn();

    const middleware = authMiddleware([userTypeConstants.ComplianceOfficer]);
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
