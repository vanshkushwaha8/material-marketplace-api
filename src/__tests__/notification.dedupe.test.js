/**
 * One notification per business event: a second createNotification with the
 * same dedupeKey (retried request, duplicate webhook, racing callback) hits
 * the unique index and is dropped — nothing streamed or pushed twice.
 */
jest.mock('../model/notification.model', () => ({ create: jest.fn() }));
jest.mock('../config/firebase.config', () => ({ getMessaging: () => null }));

const notificationModel = require('../model/notification.model');
const { createNotification, notificationEmitter } = require('../service/app/notification.service');

const RECIPIENT = '64b0000000000000000000b1';
const base = { recipientId: RECIPIENT, type: 'HANDOVER_STARTED', title: 't', message: 'm', dedupeKey: 'HANDOVER_STARTED:txn-1' };

beforeEach(() => jest.clearAllMocks());

test('the dedupe key is stored with the notification', async () => {
  notificationModel.create.mockResolvedValue({ _id: 'n1', recipient: RECIPIENT });
  await createNotification(base);
  expect(notificationModel.create).toHaveBeenCalledWith(expect.objectContaining({ dedupeKey: 'HANDOVER_STARTED:txn-1' }));
});

test('a duplicate event is dropped silently and not streamed', async () => {
  const listener = jest.fn();
  notificationEmitter.on(`notify:${RECIPIENT}`, listener);
  notificationModel.create.mockRejectedValueOnce(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
  await expect(createNotification(base)).resolves.toBeNull();
  expect(listener).not.toHaveBeenCalled();
  notificationEmitter.off(`notify:${RECIPIENT}`, listener);
});

test('notifications without a key are unaffected', async () => {
  notificationModel.create.mockResolvedValue({ _id: 'n2', recipient: RECIPIENT });
  await createNotification({ ...base, dedupeKey: null });
  expect(notificationModel.create.mock.calls[0][0]).not.toHaveProperty('dedupeKey');
});
