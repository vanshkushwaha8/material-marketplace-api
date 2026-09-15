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

jest.mock("../model/user.model", () => ({ findById: jest.fn() }));
jest.mock("../model/session.model", () => ({ find: jest.fn(), create: jest.fn(), deleteMany: jest.fn() }));
jest.mock("../model/userconsent.model", () => ({ findOne: jest.fn() }));
jest.mock("../helper/sendVerificationEmail", () => jest.fn());
jest.mock("../templates/newlocation.template", () => ({ newLoginLocationTemplate: jest.fn() }));
jest.mock("../logger/error.logger", () => ({ error: jest.fn(), info: jest.fn() }));
jest.mock("../helper/helper", () => ({ hashToken: jest.fn(() => "hashed") }));
jest.mock("../config/env.config", () => ({
  SECRET_KEY: "test-secret",
  AUTH_COOKIE_NAME: "accessToken",
}));

const { authMiddleware } = require("../middleware/auth.middleware");

function mockResponse() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
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
