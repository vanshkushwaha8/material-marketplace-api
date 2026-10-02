/**
 * Regression tests for F-01's dual-mode token extraction in authMiddleware:
 * the httpOnly cookie must be tried first; the Authorization header is
 * only consulted when there's no cookie at all (back-compat for non-
 * browser clients). We don't need a real DB/JWT round-trip to prove this —
 * an invalid token takes the same "Invalid or expired token" 401 path
 * regardless of source, so feeding a bogus value via cookie vs header and
 * asserting which failure message comes back (missing vs invalid) is
 * enough to prove which source won.
 */

jest.mock("../model/user.model", () => ({ findById: jest.fn(), findOne: jest.fn() }));
jest.mock("../helper/audit.helper", () => ({ createAuditLog: jest.fn().mockResolvedValue(null) }));
jest.mock("../model/session.model", () => ({ find: jest.fn(), create: jest.fn(), deleteMany: jest.fn() }));
jest.mock("../model/userconsent.model", () => ({ findOne: jest.fn() }));
jest.mock("../helper/sendVerificationEmail", () => jest.fn());
jest.mock("../templates/newlocation.template", () => ({ newLoginLocationTemplate: jest.fn() }));
jest.mock("../logger/error.logger", () => ({ error: jest.fn(), info: jest.fn() }));
jest.mock("../helper/helper", () => ({ hashToken: jest.fn(() => "hashed") }));
jest.mock("../config/env.config", () => ({
  SECRET_KEY: "test-secret",
  AUTH_COOKIE_NAME: "accessToken",
  ADMIN_AUTH_COOKIE_NAME: "adminAccessToken",
}));

const { authMiddleware } = require("../middleware/auth.middleware");

function mockResponse() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  // clearAuthCookie() runs on every 401 path — without this the
  // middleware threw and these tests never exercised the real responses.
  res.cookie = jest.fn().mockReturnValue(res);
  return res;
}

describe("authMiddleware — cookie-first, header-fallback", () => {
  const middleware = authMiddleware([]);

  test("no cookie and no Authorization header -> 'Authorization token is missing'", async () => {
    const req = { cookies: {}, headers: {} };
    const res = mockResponse();
    await middleware(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].message).toMatch(/missing/i);
  });

  test("cookie present (even if invalid) is read before ever checking the header", async () => {
    const req = { cookies: { accessToken: "bogus-cookie-token" }, headers: { authorization: "Bearer some-other-header-token" } };
    const res = mockResponse();
    await middleware(req, res, jest.fn());

    // Both are invalid JWTs, so both fail the same way — but we can prove
    // the cookie was the one actually used by checking hashToken was
    // called with the cookie's value, not the header's.
    const helper = require("../helper/helper");
    expect(helper.hashToken).toHaveBeenCalledWith("bogus-cookie-token");
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].message).toMatch(/invalid or expired/i);
  });

  test("no cookie, malformed Authorization header -> 'Invalid token format'", async () => {
    const req = { cookies: {}, headers: { authorization: "NotBearer sometoken" } };
    const res = mockResponse();
    await middleware(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].message).toMatch(/invalid token format/i);
  });

  test("no cookie, well-formed but invalid Authorization header -> falls back correctly and still validates", async () => {
    const req = { cookies: {}, headers: { authorization: "Bearer header-token-value" } };
    const res = mockResponse();
    await middleware(req, res, jest.fn());

    const helper = require("../helper/helper");
    expect(helper.hashToken).toHaveBeenCalledWith("header-token-value");
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].message).toMatch(/invalid or expired/i);
  });
});


describe("authMiddleware — realm and role separation", () => {
  const jwt = require("jsonwebtoken");
  const userModel = require("../model/user.model");
  const sign = (id) => jwt.sign({ _id: id }, "test-secret", { expiresIn: "1h" });
  const BUYER_ID = "64b000000000000000000002";

  test("admin session cookie only → user API answers 401 (admin has no user token)", async () => {
    const res = mockResponse();
    const next = jest.fn();
    await authMiddleware([])({ cookies: { adminAccessToken: "admin.jwt" }, headers: {} }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    // only the USER cookie is cleared — the admin session cookie is untouched
    expect(res.cookie.mock.calls.every(([name]) => name === "accessToken")).toBe(true);
  });

  test("expired token → 401", async () => {
    const res = mockResponse();
    const expired = jwt.sign({ _id: BUYER_ID, exp: Math.floor(Date.now() / 1000) - 60 }, "test-secret");
    await authMiddleware([])({ cookies: { accessToken: expired }, headers: {} }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("token signed with the wrong secret → 401", async () => {
    const res = mockResponse();
    const forged = jwt.sign({ _id: BUYER_ID }, "not-the-secret");
    await authMiddleware([])({ cookies: { accessToken: forged }, headers: {} }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("valid buyer token on a seller-only API → 403, not 401", async () => {
    userModel.findOne.mockResolvedValue({ _id: BUYER_ID, userType: "Buyer", status: "approved", isEmailVerified: true });
    const res = mockResponse();
    const next = jest.fn();
    await authMiddleware(["Seller"])({ cookies: { accessToken: sign(BUYER_ID) }, headers: {}, path: "/x" }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test("suspended user → 401 and sessions revoked", async () => {
    const sessionModel = require("../model/session.model");
    userModel.findOne.mockResolvedValue({ _id: BUYER_ID, userType: "Buyer", status: "suspended", fullName: "B", isEmailVerified: true });
    sessionModel.deleteMany.mockReturnValue({ catch: () => Promise.resolve() });
    const res = mockResponse();
    await authMiddleware(["Buyer"])({ cookies: { accessToken: sign(BUYER_ID) }, headers: {} }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(sessionModel.deleteMany).toHaveBeenCalled();
  });
});
