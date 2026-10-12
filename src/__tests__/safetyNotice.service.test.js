/**
 * Fraud-awareness notice display policy (backend record, so it follows the
 * account across devices): shown once per role + version; dismissing or
 * acknowledging records it; a new version shows it again; the role comes
 * from the account, never the request.
 */
jest.mock('../model/user.model', () => ({ findById: jest.fn(), updateOne: jest.fn() }));
jest.mock('../helper/audit.helper', () => ({ createAuditLog: jest.fn().mockResolvedValue(null) }));

const userModel = require('../model/user.model');
const { createAuditLog } = require('../helper/audit.helper');
const { SAFETY_NOTICE_VERSIONS } = require('../constants/safetyNotice.constants');
const svc = require('../service/app/safetyNotice.service');

const USER = '64b0000000000000000000b1';
let user;
beforeEach(() => {
  jest.clearAllMocks();
  user = { _id: USER, userType: 'Buyer', safetyNoticeAcks: [] };
  userModel.findById.mockImplementation(() => ({ select: () => ({ lean: () => Promise.resolve(user) }) }));
  userModel.updateOne.mockImplementation(async (filter, update) => {
    const row = update.$push.safetyNoticeAcks;
    if (user.safetyNoticeAcks.some((a) => a.role === row.role && a.version === row.version)) return { modifiedCount: 0 };
    user.safetyNoticeAcks.push(row);
    return { modifiedCount: 1 };
  });
});

test('first login after release → shown, with the role from the account', async () => {
  expect(await svc.getStatus(USER)).toMatchObject({ role: 'buyer', shouldShow: true, currentVersion: SAFETY_NOTICE_VERSIONS.buyer });
  user.userType = 'Seller';
  expect(await svc.getStatus(USER)).toMatchObject({ role: 'seller', shouldShow: true, currentVersion: SAFETY_NOTICE_VERSIONS.seller });
});

test.each(['ACKNOWLEDGED', 'DISMISSED'])('%s once → not shown again; recorded once and audited once', async (action) => {
  const status = await svc.record({ userId: USER, version: SAFETY_NOTICE_VERSIONS.buyer, action });
  expect(status).toMatchObject({ shouldShow: false, lastAction: { action } });
  await svc.record({ userId: USER, version: SAFETY_NOTICE_VERSIONS.buyer, action });
  expect(user.safetyNoticeAcks).toHaveLength(1);
  expect(createAuditLog).toHaveBeenCalledTimes(1);
});

test('a material policy change (new version) shows it again', async () => {
  user.safetyNoticeAcks = [{ role: 'buyer', version: '2020-01-01', action: 'ACKNOWLEDGED', at: new Date() }];
  expect((await svc.getStatus(USER)).shouldShow).toBe(true);
});

test('a buyer acknowledgement does not cover the seller notice', async () => {
  user.safetyNoticeAcks = [{ role: 'buyer', version: SAFETY_NOTICE_VERSIONS.buyer, action: 'ACKNOWLEDGED', at: new Date() }];
  user.userType = 'Seller';
  expect((await svc.getStatus(USER)).shouldShow).toBe(true);
});

test('acknowledging a stale version is refused (user must see the new notice)', async () => {
  await expect(svc.record({ userId: USER, version: '2020-01-01', action: 'ACKNOWLEDGED' })).rejects.toMatchObject({ statusCode: 409 });
  expect(userModel.updateOne).not.toHaveBeenCalled();
});
