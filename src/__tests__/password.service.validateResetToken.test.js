/**
 * Reset/invitation token rules (helper/accountToken.helper.js) and the user
 * reset-link check built on it.
 *
 * Originally a regression test for N-03 (a missing/unknown token threw a raw
 * TypeError instead of a clean INVALID result) — still covered below — plus
 * the single-use / expiry / revocation / no-crossover rules.
 */

const store = { record: null, user: null };
const lean = (value) => ({ lean: () => Promise.resolve(value), select: () => ({ lean: () => Promise.resolve(value) }) });

jest.mock("../model/user.model", () => ({ findOne: jest.fn(() => lean(store.user)), findById: jest.fn() }));
jest.mock("../model/passwordReset.model", () => ({
  findOne: jest.fn(() => lean(store.record)),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn(),
  create: jest.fn(),
}));
jest.mock("../model/verification.model", () => ({ findOne: jest.fn() }));
jest.mock("../model/session.model", () => ({ deleteMany: jest.fn() }));
jest.mock("../helper/helper", () => ({
  hashToken: (token) => `hashed:${token}`,
  createPassword: jest.fn(),
  deleteSession: jest.fn(),
  comparePassword: jest.fn(),
}));
jest.mock("../helper/sendVerificationEmail", () => jest.fn());
jest.mock("../helper/audit.helper", () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../logger/error.logger", () => ({ error: jest.fn(), info: jest.fn() }));

const passwordResetModel = require("../model/passwordReset.model");
const passwordService = require("../service/app/password.service");
const accountToken = require("../helper/accountToken.helper");
const { TOKEN_TYPES, ACCOUNTS } = accountToken;

const TOKEN = "a".repeat(64);
const future = () => new Date(Date.now() + 60 * 60 * 1000);
const past = () => new Date(Date.now() - 1000);
const userReset = (extra = {}) => ({ _id: "t1", userId: "user-1", tokenType: TOKEN_TYPES.PASSWORD_RESET, expiresAt: future(), usedAt: null, revokedAt: null, used: false, ...extra });

describe("passwordService.validateResetToken", () => {
  const fakeRequest = { ip: "127.0.0.1" };
  beforeEach(() => { store.record = null; store.user = { _id: "user-1", status: "approved" }; jest.clearAllMocks(); });

  test("missing token → INVALID without touching the DB, never throws", async () => {
    await expect(passwordService.validateResetToken(fakeRequest, undefined)).resolves.toEqual(expect.objectContaining({ valid: false, reason: "INVALID" }));
    expect(passwordResetModel.findOne).not.toHaveBeenCalled();
  });

  test("non-string or malformed token → INVALID", async () => {
    await expect(passwordService.validateResetToken(fakeRequest, { evil: true })).resolves.toEqual(expect.objectContaining({ valid: false, reason: "INVALID" }));
    await expect(passwordService.validateResetToken(fakeRequest, "not-a-real-token")).resolves.toEqual(expect.objectContaining({ valid: false, reason: "INVALID" }));
    expect(passwordResetModel.findOne).not.toHaveBeenCalled();
  });

  test("unknown token → INVALID instead of throwing", async () => {
    await expect(passwordService.validateResetToken(fakeRequest, TOKEN)).resolves.toEqual(expect.objectContaining({ valid: false, reason: "INVALID" }));
  });

  test("looks up the hash, never the raw token", async () => {
    store.record = userReset();
    await passwordService.validateResetToken(fakeRequest, TOKEN);
    expect(passwordResetModel.findOne).toHaveBeenCalledWith({ tokenHash: `hashed:${TOKEN}` });
  });

  test.each([
    ["used (usedAt set)", { usedAt: new Date() }, "USED"],
    ["used (legacy flag)", { used: true }, "USED"],
    ["revoked", { revokedAt: new Date() }, "REVOKED"],
    ["expired", { expiresAt: past() }, "EXPIRED"],
  ])("%s → %s, even if the user is gone", async (_label, extra, reason) => {
    store.record = userReset(extra);
    store.user = null;
    await expect(passwordService.validateResetToken(fakeRequest, TOKEN)).resolves.toEqual(expect.objectContaining({ valid: false, reason }));
  });

  test("valid, unused, unrevoked, unexpired token → valid", async () => {
    store.record = userReset();
    await expect(passwordService.validateResetToken(fakeRequest, TOKEN)).resolves.toEqual(expect.objectContaining({ valid: true }));
  });

  test("valid token for a deleted/suspended account → INVALID", async () => {
    store.record = userReset();
    store.user = { _id: "user-1", status: "suspended" };
    await expect(passwordService.validateResetToken(fakeRequest, TOKEN)).resolves.toEqual(expect.objectContaining({ valid: false, reason: "INVALID" }));
  });
});

describe("accountToken: tokens never cross types or realms", () => {
  beforeEach(() => { store.record = null; jest.clearAllMocks(); });

  test("a staff invitation can't be used as a reset link", async () => {
    store.record = { _id: "t2", adminId: "admin-1", tokenType: TOKEN_TYPES.STAFF_INVITATION, expiresAt: future(), usedAt: null, revokedAt: null };
    expect((await accountToken.inspect(TOKEN, { type: TOKEN_TYPES.PASSWORD_RESET, account: ACCOUNTS.ADMIN })).state).toBe("INVALID");
    expect((await accountToken.inspect(TOKEN, { type: TOKEN_TYPES.STAFF_INVITATION, account: ACCOUNTS.ADMIN })).state).toBe("VALID");
  });

  test("a user reset link doesn't work on the admin side (and vice versa)", async () => {
    store.record = userReset();
    expect((await accountToken.inspect(TOKEN, { type: TOKEN_TYPES.PASSWORD_RESET, account: ACCOUNTS.ADMIN })).state).toBe("INVALID");
    store.record = { _id: "t3", adminId: "admin-1", tokenType: TOKEN_TYPES.PASSWORD_RESET, expiresAt: future(), usedAt: null, revokedAt: null };
    expect((await accountToken.inspect(TOKEN, { type: TOKEN_TYPES.PASSWORD_RESET, account: ACCOUNTS.USER })).state).toBe("INVALID");
  });

  test("legacy untyped admin records are invitations, untyped user records resets", async () => {
    store.record = { _id: "t4", adminId: "admin-1", expiresAt: future(), used: false };
    expect((await accountToken.inspect(TOKEN, { type: TOKEN_TYPES.STAFF_INVITATION, account: ACCOUNTS.ADMIN })).state).toBe("VALID");
    expect((await accountToken.inspect(TOKEN, { type: TOKEN_TYPES.PASSWORD_RESET, account: ACCOUNTS.ADMIN })).state).toBe("INVALID");
  });

  test("consume is a single conditional update (usedAt/revokedAt null, not expired)", async () => {
    passwordResetModel.findOneAndUpdate.mockReturnValueOnce(lean({ _id: "t1" })).mockReturnValueOnce(lean(null));
    expect(await accountToken.consume({ _id: "t1" })).toBe(true);
    expect(await accountToken.consume({ _id: "t1" })).toBe(false);
    const [filter, update] = passwordResetModel.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual(expect.objectContaining({ _id: "t1", usedAt: null, revokedAt: null, used: { $ne: true }, expiresAt: { $gt: expect.any(Date) } }));
    expect(update.$set).toEqual(expect.objectContaining({ usedAt: expect.any(Date), used: true }));
  });

  test("issue stores only the hash and revokes the previous link", async () => {
    passwordResetModel.create.mockImplementation(async (doc) => doc);
    passwordResetModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
    const { rawToken, record } = await accountToken.issue({ type: TOKEN_TYPES.PASSWORD_RESET, account: ACCOUNTS.USER, ownerId: "user-1" });
    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
    expect(record.tokenHash).toBe(`hashed:${rawToken}`);
    expect(Object.keys(record).sort()).toEqual(['expiresAt', 'tokenHash', 'tokenType', 'userId']);
    expect(passwordResetModel.updateMany).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), { $set: { revokedAt: expect.any(Date) } });
  });
});
