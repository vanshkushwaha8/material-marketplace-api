/**
 * Regression tests for the hardened error handler (N-03 follow-up).
 *
 * Contract under test:
 *  - An AppError (or anything with isOperational === true) may show its
 *    real message to the client.
 *  - Any other error (plain TypeError, driver error, etc.) must ALWAYS
 *    return the generic "Internal server error" message, regardless of
 *    NODE_ENV, unless SHOW_ERROR_DETAILS=true is explicitly set.
 *  - The response always carries an errorId when request.id is present,
 *    so an "Internal server error" report can be correlated to a log line.
 *  - Sensitive query params (token, password, otp, ...) are redacted
 *    before being written to the log.
 */

jest.mock("../config/env.config", () => ({
  NODE_ENV: "production",
  SHOW_ERROR_DETAILS: false,
}));

const logger = require("../logger/error.logger");
jest.mock("../logger/error.logger", () => ({ error: jest.fn() }));

const configenv = require("../config/env.config");
const errorHandler = require("../middleware/errorHandler.middleware");
const { AppError, BadRequestError } = require("../utils/AppError");

function mockResponse() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockRequest(overrides = {}) {
  return {
    id: "req-123",
    originalUrl: "/api/v1/validate-reset-token?token=SUPER-SECRET-VALUE",
    method: "GET",
    ip: "127.0.0.1",
    ...overrides,
  };
}

describe("errorHandler middleware", () => {
  afterEach(() => jest.clearAllMocks());

  test("AppError: shows the real message and its status code", () => {
    const err = new BadRequestError("Reset link is invalid or has expired.", "RESET_LINK_INVALID");
    const req = mockRequest();
    const res = mockResponse();

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe("Reset link is invalid or has expired.");
    expect(body.code).toBe("RESET_LINK_INVALID");
    expect(body.errorId).toBe("req-123");
  });

  test("plain unexpected TypeError: never leaks the raw message, even outside production", () => {
    configenv.NODE_ENV = "development"; // simulate a misconfigured/staging env
    const err = new TypeError("Cannot read properties of null (reading 'userId')");
    const req = mockRequest();
    const res = mockResponse();

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe("Internal server error");
    expect(body.message).not.toMatch(/userId|TypeError/);
  });

  test("plain unexpected error: SHOW_ERROR_DETAILS=true is the only way to see the raw message", () => {
    configenv.SHOW_ERROR_DETAILS = true;
    const err = new TypeError("boom - internal detail");
    const req = mockRequest();
    const res = mockResponse();

    errorHandler(err, req, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe("boom - internal detail");
    configenv.SHOW_ERROR_DETAILS = false; // reset for other tests
  });

  test("plain Error with an explicit non-500 statusCode (the codebase's pre-existing validation-error pattern) shows its real message", () => {
    // This is the `const err = new Error("..."); err.statusCode = 400; throw err;`
    // pattern used at 60+ call sites across this codebase, predating
    // AppError. It must keep working — this was a real regression
    // introduced by the initial N-03 hardening pass and is fixed here.
    const err = new Error("selectedOptionIndex 99 is out of range for question abc123 (must be 0-3).");
    err.statusCode = 400;
    const req = mockRequest();
    const res = mockResponse();

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe("selectedOptionIndex 99 is out of range for question abc123 (must be 0-3).");
  });

  test("plain Error with statusCode explicitly set to 500 is still masked (not treated as operational just because .statusCode exists)", () => {
    const err = new Error("some deliberate but unexpected 500");
    err.statusCode = 500;
    const req = mockRequest();
    const res = mockResponse();

    errorHandler(err, req, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe("Internal server error");
  });

  test("CORS rejection keeps its dedicated clean message", () => {
    const err = new Error("Not allowed by CORS");
    const req = mockRequest();
    const res = mockResponse();

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("redacts sensitive query params (token) before logging the URL", () => {
    const err = new AppError("Invalid.", 400);
    const req = mockRequest({
      originalUrl: "/api/v1/emailVerification?token=abcdef1234567890&foo=bar",
    });
    const res = mockResponse();

    errorHandler(err, req, res, jest.fn());

    const loggedMeta = logger.error.mock.calls[0][1];
    expect(loggedMeta.url).not.toMatch(/abcdef1234567890/);
    expect(loggedMeta.url).toMatch(/token=(\[REDACTED\]|%5BREDACTED%5D)/);
    expect(loggedMeta.url).toMatch(/foo=bar/);
  });
});
