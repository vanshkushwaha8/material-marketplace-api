/**
 * Regression tests for N-03: internal error / stack disclosure on
 * verification & reset endpoints.
 *
 * Root cause was `passwordService.validateResetToken` reading
 * `resetDoc.userId` before checking whether `resetDoc` was null — so any
 * invalid/expired/missing token threw a raw TypeError instead of
 * returning a clean `{ valid: false, reason: "INVALID" }`.
 *
 * These tests assert the fixed behavior: a bad token must always resolve
 * to a clean result object, and must never throw.
 *
 * To run: `npm install --save-dev jest` then `npx jest` (no jest config
 * present in this snapshot — add `"test": "jest"` to package.json).
 */

jest.mock("../model/user.model", () => ({ findOne: jest.fn(), findById: jest.fn() }));
jest.mock("../model/passwordReset.model", () => ({ findOne: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() }));
jest.mock("../model/verification.model", () => ({ findOne: jest.fn() }));
jest.mock("../model/otp.model", () => ({}));
jest.mock("../model/session.model", () => ({}));
jest.mock("mongoose", () => ({ default: { Types: { ObjectId: { isValid: jest.fn() } } } }));
jest.mock("../helper/helper", () => ({
  hashToken: (token) => `hashed:${token}`,
  createPassword: jest.fn(),
  deleteSession: jest.fn(),
  comparePassword: jest.fn(),
}));
jest.mock("../helper/sendVerificationEmail", () => jest.fn());
jest.mock("../helper/audit.helper", () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../config/template", () => ({}));
jest.mock("../templates/verified.template", () => jest.fn());
jest.mock("../logger/error.logger", () => ({ error: jest.fn(), info: jest.fn() }));

const userModel = require("../model/user.model");
const passwordResetModel = require("../model/passwordReset.model");
const passwordService = require("../service/app/password.service");

describe("passwordService.validateResetToken", () => {
  const fakeRequest = { ip: "127.0.0.1", originalUrl: "/api/v1/validate-reset-token" };

  afterEach(() => jest.clearAllMocks());

  test("missing token resolves to a clean INVALID result, never throws", async () => {
    const result = await passwordService.validateResetToken(fakeRequest, undefined);
    expect(result).toEqual(
      expect.objectContaining({ valid: false, reason: "INVALID" })
    );
    // Must short-circuit before ever touching the DB.
    expect(passwordResetModel.findOne).not.toHaveBeenCalled();
  });

  test("non-string token resolves to a clean INVALID result, never throws", async () => {
    const result = await passwordService.validateResetToken(fakeRequest, { evil: true });
    expect(result).toEqual(
      expect.objectContaining({ valid: false, reason: "INVALID" })
    );
  });

  test("unknown token (resetDoc null) resolves to INVALID instead of throwing", async () => {
    passwordResetModel.findOne.mockResolvedValue(null);
    await expect(
      passwordService.validateResetToken(fakeRequest, "some-token-that-does-not-exist")
    ).resolves.toEqual(expect.objectContaining({ valid: false, reason: "INVALID" }));
  });

  test("already-used token: does not throw even if the associated user was deleted", async () => {
    passwordResetModel.findOne.mockResolvedValue({
      userId: "deleted-user-id",
      used: true,
      expiresAt: new Date(Date.now() + 1000 * 60),
    });
    userModel.findOne.mockResolvedValue(null); // user was deleted after the reset was requested

    await expect(
      passwordService.validateResetToken(fakeRequest, "used-token")
    ).resolves.toEqual(expect.objectContaining({ valid: false, reason: "USED" }));
  });

  test("valid, unused, unexpired token resolves valid: true", async () => {
    passwordResetModel.findOne.mockResolvedValue({
      userId: "user-1",
      used: false,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    userModel.findOne.mockResolvedValue({ _id: "user-1", userType: "investor" });

    await expect(
      passwordService.validateResetToken(fakeRequest, "good-token")
    ).resolves.toEqual({ valid: true });
  });
});
