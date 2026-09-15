/**
 * Regression tests for F-01: JWT moved from localStorage to an httpOnly
 * cookie. These test the cookie helper's contract directly (mocking
 * express's res.cookie/clearCookie), since that's what every login/logout
 * site in the app now relies on.
 */

jest.mock("../config/env.config", () => ({
  AUTH_COOKIE_NAME: "accessToken",
  ADMIN_AUTH_COOKIE_NAME: "adminAccessToken",
  AUTH_COOKIE_SAMESITE: "lax",
  AUTH_COOKIE_SECURE: false,
  AUTH_COOKIE_DOMAIN: "",
}));

const {
  setAuthCookie,
  clearAuthCookie,
  setAdminAuthCookie,
  clearAdminAuthCookie,
} = require("../helper/authCookie");

function mockResponse() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };
}

describe("authCookie helper", () => {
  test("setAuthCookie sets an httpOnly cookie under the configured name", () => {
    const res = mockResponse();
    setAuthCookie(res, "some.jwt.value");

    expect(res.cookie).toHaveBeenCalledWith(
      "accessToken",
      "some.jwt.value",
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
      })
    );
  });

  test("setAuthCookie is a no-op when there's no token (never sets an empty/undefined cookie)", () => {
    const res = mockResponse();
    setAuthCookie(res, undefined);
    setAuthCookie(res, "");

    expect(res.cookie).not.toHaveBeenCalled();
  });

  test("setAuthCookie accepts a maxAge override (used for the short-lived 2FA-setup token)", () => {
    const res = mockResponse();
    setAuthCookie(res, "setup.jwt", { maxAge: 15 * 60 * 1000 });

    expect(res.cookie).toHaveBeenCalledWith(
      "accessToken",
      "setup.jwt",
      expect.objectContaining({ maxAge: 15 * 60 * 1000 })
    );
  });

  test("clearAuthCookie clears the same cookie name with matching attributes (no maxAge)", () => {
    const res = mockResponse();
    clearAuthCookie(res);

    expect(res.clearCookie).toHaveBeenCalledWith(
      "accessToken",
      expect.objectContaining({ httpOnly: true, path: "/" })
    );
    const [, opts] = res.clearCookie.mock.calls[0];
    expect(opts.maxAge).toBeUndefined();
  });

  test("admin cookie uses a distinct name from the regular user cookie", () => {
    const res = mockResponse();
    setAdminAuthCookie(res, "admin.jwt");
    clearAdminAuthCookie(res);

    expect(res.cookie).toHaveBeenCalledWith(
      "adminAccessToken",
      "admin.jwt",
      expect.anything()
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      "adminAccessToken",
      expect.anything()
    );
    // Never touches the regular user's cookie name.
    expect(res.cookie).not.toHaveBeenCalledWith(
      "accessToken",
      expect.anything(),
      expect.anything()
    );
  });
});
