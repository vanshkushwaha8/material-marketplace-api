/**
 * A notification is a side effect of a real business action (offer
 * accepted, payment confirmed, etc.) — if writing the notification fails,
 * that must NEVER surface as an error to the caller, since the caller is
 * always the actual business logic (payment/offer/payout), and a broken
 * notification must not roll back or fail a real transaction.
 */
jest.mock('../model/notification.model', () => ({
  create: jest.fn(),
}));

const notificationModel = require('../model/notification.model');
const { createNotification } = require('../service/app/notification.service');

describe('notification.service.createNotification', () => {
  afterEach(() => jest.clearAllMocks());

  test('resolves to null instead of throwing when the DB write fails', async () => {
    notificationModel.create.mockRejectedValue(new Error('Mongo down'));
    const result = await createNotification({ recipientId: 'user1', type: 'OFFER_RECEIVED', title: 't', message: 'm' });
    expect(result).toBeNull();
  });

  test('returns null immediately without touching the DB when recipientId is missing', async () => {
    const result = await createNotification({ recipientId: null, type: 'OFFER_RECEIVED', title: 't', message: 'm' });
    expect(result).toBeNull();
    expect(notificationModel.create).not.toHaveBeenCalled();
  });

  test('creates successfully with the expected shape when the DB write succeeds', async () => {
    notificationModel.create.mockResolvedValue({ _id: 'n1', recipient: 'user1', type: 'OFFER_RECEIVED' });
    const result = await createNotification({ recipientId: 'user1', type: 'OFFER_RECEIVED', title: 't', message: 'm', entityType: 'offer', entityId: 'o1' });
    expect(notificationModel.create).toHaveBeenCalledWith({
      recipient: 'user1', actor: null, actorName: null, type: 'OFFER_RECEIVED', title: 't', message: 'm',
      entityType: 'offer', entityId: 'o1', entityName: null,
    });
    expect(result._id).toBe('n1');
  });

  test('resolves a function title/message with the actor name before saving', async () => {
    jest.mock('../model/user.model', () => ({ findById: jest.fn() }));
    const userModel = require('../model/user.model');
    userModel.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ fullName: 'Rahul Sharma' }) }) });
    notificationModel.create.mockResolvedValue({ _id: 'n2', recipient: 'seller1', type: 'OFFER_RECEIVED' });

    await createNotification({
      recipientId: 'seller1', actorId: 'buyer1', type: 'OFFER_RECEIVED',
      title: (actorName) => `New offer from ${actorName}`,
      message: (actorName) => `${actorName} made an offer`,
    });

    expect(notificationModel.create).toHaveBeenCalledWith(expect.objectContaining({
      actor: 'buyer1', actorName: 'Rahul Sharma',
      title: 'New offer from Rahul Sharma', message: 'Rahul Sharma made an offer',
    }));
  });
});