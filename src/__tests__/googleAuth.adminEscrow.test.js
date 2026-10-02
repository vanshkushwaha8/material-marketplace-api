/**
 * Google sign-in (googleAuth.service.js) and admin manual-resolution guards.
 */
const mockVerify = jest.fn();
jest.mock('google-auth-library', () => ({ OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: mockVerify })) }));
jest.mock('../config/env.config', () => ({ GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com' }));
jest.mock('../model/user.model', () => ({ findOne: jest.fn(), updateOne: jest.fn().mockResolvedValue({}), create: jest.fn() }));
jest.mock('../helper/audit.helper', () => ({ createAuditLog: jest.fn().mockResolvedValue(null), createAuditLogAdmin: jest.fn() }));

const userModel = require('../model/user.model');
const google = require('../service/app/googleAuth.service');

const ticket = (p) => ({ getPayload: () => p });
const TOKEN = 'x'.repeat(40);

describe('Google sign-in', () => {
  beforeEach(() => jest.clearAllMocks());

  test('token is verified against OUR client id', async () => {
    mockVerify.mockResolvedValue(ticket({ sub: 'g1', email: 'a@b.com', email_verified: true }));
    userModel.findOne.mockResolvedValue(null);
    await google.resolveUser({ idToken: TOKEN });
    expect(mockVerify).toHaveBeenCalledWith({ idToken: TOKEN, audience: 'client-123.apps.googleusercontent.com' });
  });

  test('invalid / forged token → 401', async () => {
    mockVerify.mockRejectedValue(new Error('Wrong recipient'));
    await expect(google.resolveUser({ idToken: TOKEN })).rejects.toMatchObject({ statusCode: 401, errorCode: 'GOOGLE_TOKEN_INVALID' });
  });

  test('unverified Google email is refused', async () => {
    mockVerify.mockResolvedValue(ticket({ sub: 'g1', email: 'a@b.com', email_verified: false }));
    await expect(google.resolveUser({ idToken: TOKEN })).rejects.toMatchObject({ statusCode: 401 });
  });

  test('new user without a role → needUserType (no account created)', async () => {
    mockVerify.mockResolvedValue(ticket({ sub: 'g1', email: 'New@B.com', email_verified: true, name: 'New' }));
    userModel.findOne.mockResolvedValue(null);
    await expect(google.resolveUser({ idToken: TOKEN })).resolves.toMatchObject({ needUserType: true, email: 'new@b.com' });
    expect(userModel.create).not.toHaveBeenCalled();
  });

  test('new Seller via Google is an INDIVIDUAL seller with a verified email', async () => {
    mockVerify.mockResolvedValue(ticket({ sub: 'g1', email: 'new@b.com', email_verified: true, name: 'New' }));
    userModel.findOne.mockResolvedValue(null);
    userModel.create.mockImplementation(async (d) => ({ _id: 'u1', ...d }));
    const r = await google.resolveUser({ idToken: TOKEN, userType: 'Seller' });
    expect(userModel.create).toHaveBeenCalledWith(expect.objectContaining({ userType: 'Seller', sellerType: 'INDIVIDUAL', isEmailVerified: true, googleSub: 'g1' }));
    expect(r.created).toBe(true);
  });

  test('a role outside Buyer/Seller is rejected', async () => {
    mockVerify.mockResolvedValue(ticket({ sub: 'g1', email: 'new@b.com', email_verified: true }));
    userModel.findOne.mockResolvedValue(null);
    await expect(google.resolveUser({ idToken: TOKEN, userType: 'Admin' })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('existing account is linked to the Google id on first use', async () => {
    mockVerify.mockResolvedValue(ticket({ sub: 'g1', email: 'a@b.com', email_verified: true }));
    userModel.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: 'u1', email: 'a@b.com', userType: 'Buyer', isEmailVerified: true });
    const r = await google.resolveUser({ idToken: TOKEN });
    expect(userModel.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $set: { googleSub: 'g1' } });
    expect(r.created).toBe(false);
  });

  test('email already linked to a DIFFERENT Google account is refused', async () => {
    mockVerify.mockResolvedValue(ticket({ sub: 'g-attacker', email: 'a@b.com', email_verified: true }));
    userModel.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: 'u1', email: 'a@b.com', userType: 'Buyer', googleSub: 'g-owner' });
    await expect(google.resolveUser({ idToken: TOKEN })).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('admin manual payment resolution guards', () => {
  const adminEscrow = () => {
    jest.resetModules();
    jest.doMock('../service/app/escrow.service', () => ({ loadWithEscrow: jest.fn(), transition: jest.fn(), EscrowTransitionError: class extends Error {} }));
    jest.doMock('../service/app/refund.service', () => ({}));
    jest.doMock('../service/app/payout.service', () => ({}));
    jest.doMock('../model/transaction.model', () => ({}));
    jest.doMock('../model/payment.model', () => ({}));
    jest.doMock('../model/payout.model', () => ({}));
    jest.doMock('../model/commissionSetting.model', () => ({}));
    return require('../service/admin/escrow.service');
  };

  test('manual resolution requires the manual-resolution permission', async () => {
    const svc = adminEscrow();
    await expect(svc.performAction({ transactionId: 't', action: 'MANUAL_RELEASE', reason: 'paid by NEFT', externalReference: 'UTR123456', adminId: 'a', canManual: false }))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  test('manual resolution requires an external reference', async () => {
    const svc = adminEscrow();
    await expect(svc.performAction({ transactionId: 't', action: 'MANUAL_REFUND', reason: 'refunded by bank', externalReference: '', adminId: 'a', canManual: true }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('available actions follow the escrow state', () => {
    const svc = adminEscrow();
    expect(svc.availableActions({ escrowStatus: 'REFUND_FAILED' }, null)).toEqual(expect.arrayContaining(['RETRY_REFUND', 'MANUAL_REFUND']));
    expect(svc.availableActions({ escrowStatus: 'REQUIRES_ADMIN_ACTION', escrowPendingOperation: 'RELEASE' }, null)).toEqual(expect.arrayContaining(['RETRY_RELEASE', 'MANUAL_RELEASE']));
    expect(svc.availableActions({ escrowStatus: 'RELEASED' }, null)).toEqual([]);
    expect(svc.availableActions({ escrowStatus: 'REFUNDED' }, null)).toEqual([]);
  });
});
