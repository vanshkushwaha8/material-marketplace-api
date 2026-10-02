/**
 * Regression tests for the seller-payout-readiness gate on offer ACCEPT,
 * plus the atomic accept -> reserve -> transaction sequence.
 *
 * Business rules:
 *  - A buyer's money must never be taken for a seller who cannot ultimately
 *    be settled: ACCEPT is blocked with SELLER_PAYOUT_SETUP_REQUIRED unless
 *    the seller's payout readiness is PAYOUT_READY, and inventory is never
 *    reserved before that check passes.
 *  - Two racing responses can't both win: the offer is claimed with a
 *    conditional update before inventory is touched, and the claim is
 *    rolled back if the reservation fails.
 *
 * (Previously this suite mocked `mongoose` itself, which broke every real
 * schema loaded transitively, so it never actually ran.)
 */

jest.mock('../service/admin/adminNotification.service', () => ({ notifyAdmins: jest.fn().mockResolvedValue(null) }));
jest.mock('../model/offer.model', () => ({ findOne: jest.fn(), create: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn() }));
jest.mock('../model/materialListing.model', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn(), findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ status: 'LIVE', availableQuantity: 5, unit: 'rod' }) }) })) }));
jest.mock('../model/sellerBankAccount.model', () => ({ findOne: jest.fn() }));
jest.mock('../model/transaction.model', () => ({ create: jest.fn(), findOne: jest.fn(), findById: jest.fn(), updateOne: jest.fn() }));
jest.mock('../model/payout.model', () => ({}));
jest.mock('../model/user.model', () => ({ findById: jest.fn() }));
jest.mock('../service/app/notification.service', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../helper/audit.helper', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined), createAuditLogAdmin: jest.fn() }));

const offerModel = require('../model/offer.model');
const materialListingModel = require('../model/materialListing.model');
const sellerBankAccountModel = require('../model/sellerBankAccount.model');
const transactionModel = require('../model/transaction.model');
const userModel = require('../model/user.model');
const { OFFER_STATES } = require('../constants/offer.constants');
const { LISTING_STATES } = require('../constants/materialListing.constants');
const offerService = require('../service/app/offer.service');

function baseOffer(overrides = {}) {
  return {
    _id: 'offer-1',
    __v: 3,
    listing: 'listing-1',
    buyer: 'buyer-1',
    seller: 'seller-1',
    quantity: 20,
    currentAmount: 12000,
    status: OFFER_STATES.COUNTERED,
    lastActionBy: 'seller', // buyer's turn, e.g. accepting a seller counter
    history: [],
    populate: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const activeSeller = (status = 'approved') => ({ select: () => ({ lean: () => Promise.resolve({ status }) }) });

describe('offerService.respondToOffer — ACCEPT payout gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    userModel.findById.mockImplementation(() => activeSeller());
  });

  test('blocks ACCEPT and never touches inventory when seller has no bank account on file', async () => {
    const offer = baseOffer();
    offerModel.findOne.mockResolvedValue(offer);
    sellerBankAccountModel.findOne.mockResolvedValue(null);

    await expect(
      offerService.respondToOffer({ userId: 'buyer-1', offerId: '64b000000000000000000001', action: 'ACCEPT', req: {} })
    ).rejects.toMatchObject({ name: 'OfferError', statusCode: 409, errorCode: 'SELLER_PAYOUT_SETUP_REQUIRED', readiness: 'PAYOUT_NOT_STARTED' });

    expect(offerModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(materialListingModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(transactionModel.create).not.toHaveBeenCalled();
  });

  test('blocks ACCEPT when the bank account exists but is not yet VERIFIED', async () => {
    offerModel.findOne.mockResolvedValue(baseOffer());
    sellerBankAccountModel.findOne.mockResolvedValue({ seller: 'seller-1', verificationStatus: 'PENDING' });

    await expect(
      offerService.respondToOffer({ userId: 'buyer-1', offerId: '64b000000000000000000001', action: 'ACCEPT', req: {} })
    ).rejects.toMatchObject({ errorCode: 'SELLER_PAYOUT_SETUP_REQUIRED', readiness: 'PAYOUT_PENDING' });

    expect(materialListingModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('blocks ACCEPT for a suspended seller even with a verified account (PAYOUT_RESTRICTED)', async () => {
    offerModel.findOne.mockResolvedValue(baseOffer());
    sellerBankAccountModel.findOne.mockResolvedValue({ seller: 'seller-1', verificationStatus: 'VERIFIED' });
    userModel.findById.mockImplementation(() => activeSeller('suspended'));

    await expect(
      offerService.respondToOffer({ userId: 'buyer-1', offerId: '64b000000000000000000001', action: 'ACCEPT', req: {} })
    ).rejects.toMatchObject({ errorCode: 'SELLER_PAYOUT_SETUP_REQUIRED', readiness: 'PAYOUT_RESTRICTED' });
  });

  test('allows ACCEPT through to reservation + transaction once payout is READY', async () => {
    const offer = baseOffer();
    offerModel.findOne.mockResolvedValue(offer);
    sellerBankAccountModel.findOne.mockResolvedValue({ seller: 'seller-1', verificationStatus: 'VERIFIED' });
    offerModel.findOneAndUpdate.mockResolvedValue({ ...offer, status: OFFER_STATES.ACCEPTED, __v: 4 });
    materialListingModel.findOneAndUpdate.mockResolvedValue({
      _id: 'listing-1', availableQuantity: 180, status: LISTING_STATES.LIVE, stateHistory: [], save: jest.fn(),
    });
    transactionModel.create.mockResolvedValue({ _id: 'txn-1' });

    const result = await offerService.respondToOffer({ userId: 'buyer-1', offerId: '64b000000000000000000001', action: 'ACCEPT', req: {} });

    // Claimed conditionally on the exact version + status that was read.
    expect(offerModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'offer-1', __v: 3, status: OFFER_STATES.COUNTERED }),
      expect.anything(),
      expect.anything()
    );
    // Partial quantity reserved atomically against availableQuantity.
    expect(materialListingModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ availableQuantity: { $gte: 20 } }),
      { $inc: { availableQuantity: -20, reservedQuantity: 20 } },
      expect.anything()
    );
    expect(transactionModel.create).toHaveBeenCalledWith(expect.objectContaining({ agreedQuantity: 20, agreedAmount: 12000, unitPrice: 600 }));
    expect(result.status).toBe(OFFER_STATES.ACCEPTED);
  });

  test('a racing response that already changed the offer makes ACCEPT fail with 409 and reserves nothing', async () => {
    offerModel.findOne.mockResolvedValue(baseOffer());
    sellerBankAccountModel.findOne.mockResolvedValue({ verificationStatus: 'VERIFIED' });
    offerModel.findOneAndUpdate.mockResolvedValue(null); // lost the conditional claim

    await expect(
      offerService.respondToOffer({ userId: 'buyer-1', offerId: '64b000000000000000000001', action: 'ACCEPT', req: {} })
    ).rejects.toMatchObject({ statusCode: 409, errorCode: 'CONCURRENT_UPDATE' });
    expect(materialListingModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('rolls the offer claim back when there is not enough inventory left', async () => {
    const offer = baseOffer();
    offerModel.findOne.mockResolvedValue(offer);
    sellerBankAccountModel.findOne.mockResolvedValue({ verificationStatus: 'VERIFIED' });
    offerModel.findOneAndUpdate.mockResolvedValue({ ...offer, status: OFFER_STATES.ACCEPTED });
    materialListingModel.findOneAndUpdate.mockResolvedValue(null); // availableQuantity < 20

    await expect(
      offerService.respondToOffer({ userId: 'buyer-1', offerId: '64b000000000000000000001', action: 'ACCEPT', req: {} })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(offerModel.updateOne).toHaveBeenCalledWith(
      { _id: 'offer-1', status: OFFER_STATES.ACCEPTED },
      expect.objectContaining({ $set: { status: OFFER_STATES.COUNTERED }, $pop: { history: 1 } })
    );
    expect(transactionModel.create).not.toHaveBeenCalled();
  });
});

describe('offerService.respondToOffer — COUNTER on a fixed-price listing', () => {
  test('is rejected with LISTING_NOT_NEGOTIABLE', async () => {
    const offer = baseOffer({ status: OFFER_STATES.PENDING, lastActionBy: 'buyer' });
    offer.populate.mockImplementation(async () => { offer.listing = { _id: 'listing-1', title: 'TMT', negotiable: false }; });
    offerModel.findOne.mockResolvedValue(offer);

    await expect(
      offerService.respondToOffer({ userId: 'seller-1', offerId: '64b000000000000000000001', action: 'COUNTER', amount: 13000, req: {} })
    ).rejects.toMatchObject({ statusCode: 409, errorCode: 'LISTING_NOT_NEGOTIABLE' });
    expect(offer.save).not.toHaveBeenCalled();
  });
});

describe('offerService.respondToOffer — negotiation rules', () => {
  const notificationService = require('../service/app/notification.service');
  beforeEach(() => jest.clearAllMocks());

  const negotiable = (offer) => {
    offer.populate.mockImplementation(async () => { offer.listing = { _id: 'listing-1', title: 'TMT', negotiable: true }; });
    return offer;
  };

  test('a counter restarts the expiry window and is only announced after it is saved', async () => {
    const soon = new Date(Date.now() + 60 * 1000);
    const offer = negotiable(baseOffer({ status: OFFER_STATES.PENDING, lastActionBy: 'buyer', expiresAt: soon }));
    const order = [];
    offer.save.mockImplementation(async () => { order.push('save'); });
    notificationService.createNotification.mockImplementation(async () => { order.push('notify'); });
    offerModel.findOne.mockResolvedValue(offer);

    await offerService.respondToOffer({ userId: 'seller-1', offerId: '64b000000000000000000001', action: 'COUNTER', amount: 13000, req: {} });

    expect(offer.expiresAt.getTime()).toBeGreaterThan(Date.now() + 70 * 60 * 60 * 1000);
    expect(offer.history.at(-1)).toMatchObject({ action: 'COUNTER', by: 'seller', amount: 13000, unitPrice: 650 });
    expect(order).toEqual(['save', 'notify']);
  });

  test('a failed save (concurrent edit) sends no notification', async () => {
    const offer = negotiable(baseOffer({ status: OFFER_STATES.PENDING, lastActionBy: 'buyer', expiresAt: new Date(Date.now() + 3600e3) }));
    offer.save.mockRejectedValue(Object.assign(new Error('No matching document'), { name: 'VersionError' }));
    offerModel.findOne.mockResolvedValue(offer);

    await expect(offerService.respondToOffer({ userId: 'seller-1', offerId: '64b000000000000000000001', action: 'COUNTER', amount: 13000, req: {} }))
      .rejects.toMatchObject({ name: 'VersionError' });
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  test('counter equal to the current amount is rejected', async () => {
    const offer = negotiable(baseOffer({ status: OFFER_STATES.PENDING, lastActionBy: 'buyer', expiresAt: new Date(Date.now() + 3600e3) }));
    offerModel.findOne.mockResolvedValue(offer);
    await expect(offerService.respondToOffer({ userId: 'seller-1', offerId: '64b000000000000000000001', action: 'COUNTER', amount: 12000, req: {} }))
      .rejects.toMatchObject({ errorCode: 'COUNTER_UNCHANGED' });
  });

  test('an offer past its deadline cannot be accepted even before the sweep runs', async () => {
    const offer = negotiable(baseOffer({ expiresAt: new Date(Date.now() - 1000) }));
    offerModel.findOne.mockResolvedValue(offer);
    await expect(offerService.respondToOffer({ userId: 'buyer-1', offerId: '64b000000000000000000001', action: 'ACCEPT', req: {} }))
      .rejects.toMatchObject({ errorCode: 'OFFER_EXPIRED' });
    expect(offerModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('you cannot REJECT your own latest offer (that is a withdraw)', async () => {
    const offer = negotiable(baseOffer({ status: OFFER_STATES.COUNTERED, lastActionBy: 'seller', expiresAt: new Date(Date.now() + 3600e3) }));
    offerModel.findOne.mockResolvedValue(offer);
    await expect(offerService.respondToOffer({ userId: 'seller-1', offerId: '64b000000000000000000001', action: 'REJECT', req: {} }))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});
