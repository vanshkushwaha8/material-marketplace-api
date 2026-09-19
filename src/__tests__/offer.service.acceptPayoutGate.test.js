/**
 * Regression tests for the seller-payout-readiness gate on offer ACCEPT.
 *
 * Business rule (spec: "seller payout onboarding before accepting offer"):
 * a buyer's money must never be taken for a seller who cannot ultimately
 * be settled. ACCEPT (whether triggered by the seller accepting the
 * buyer's offer, or the buyer accepting the seller's counter) must be
 * blocked with SELLER_PAYOUT_SETUP_REQUIRED unless the seller has a
 * verified payout/bank account — and inventory must never be reserved
 * before that check passes.
 */

jest.mock('mongoose', () => ({ Types: { ObjectId: { isValid: jest.fn().mockReturnValue(true) } } }));
jest.mock('../model/offer.model', () => ({ findOne: jest.fn(), create: jest.fn() }));
jest.mock('../model/materialListing.model', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn() }));
jest.mock('../model/sellerBankAccount.model', () => ({ findOne: jest.fn() }));
jest.mock('../model/transaction.model', () => ({ create: jest.fn() }));
jest.mock('../helper/audit.helper', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));

const offerModel = require('../model/offer.model');
const materialListingModel = require('../model/materialListing.model');
const sellerBankAccountModel = require('../model/sellerBankAccount.model');
const transactionModel = require('../model/transaction.model');
const { OFFER_STATES } = require('../constants/offer.constants');
const { LISTING_STATES } = require('../constants/materialListing.constants');
const offerService = require('../service/app/offer.service');

function baseOffer(overrides = {}) {
  return {
    _id: 'offer-1',
    listing: 'listing-1',
    buyer: 'buyer-1',
    seller: 'seller-1',
    quantity: 20,
    currentAmount: 12000,
    status: OFFER_STATES.COUNTERED,
    lastActionBy: 'seller', // buyer's turn to respond, e.g. accepting a seller counter
    history: [],
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('offerService.respondToOffer — ACCEPT payout gate', () => {
  afterEach(() => jest.clearAllMocks());

  test('blocks ACCEPT and never touches inventory when seller has no bank account on file', async () => {
    const offer = baseOffer();
    offerModel.findOne.mockResolvedValue(offer);
    sellerBankAccountModel.findOne.mockResolvedValue(null);

    await expect(
      offerService.respondToOffer({ userId: 'buyer-1', offerId: 'offer-1', action: 'ACCEPT', req: {} })
    ).rejects.toMatchObject({ name: 'OfferError', statusCode: 409, errorCode: 'SELLER_PAYOUT_SETUP_REQUIRED' });

    expect(materialListingModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(transactionModel.create).not.toHaveBeenCalled();
    expect(offer.status).toBe(OFFER_STATES.COUNTERED); // untouched
  });

  test('blocks ACCEPT when the bank account exists but is not yet VERIFIED', async () => {
    const offer = baseOffer();
    offerModel.findOne.mockResolvedValue(offer);
    sellerBankAccountModel.findOne.mockResolvedValue({ seller: 'seller-1', verificationStatus: 'PENDING' });

    await expect(
      offerService.respondToOffer({ userId: 'buyer-1', offerId: 'offer-1', action: 'ACCEPT', req: {} })
    ).rejects.toMatchObject({ errorCode: 'SELLER_PAYOUT_SETUP_REQUIRED' });

    expect(materialListingModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('allows ACCEPT through to inventory reservation once the bank account is VERIFIED', async () => {
    const offer = baseOffer();
    offerModel.findOne.mockResolvedValue(offer);
    sellerBankAccountModel.findOne.mockResolvedValue({ seller: 'seller-1', verificationStatus: 'VERIFIED' });
    materialListingModel.findOneAndUpdate.mockResolvedValue({
      _id: 'listing-1', availableQuantity: 180, status: LISTING_STATES.LIVE, stateHistory: [], save: jest.fn(),
    });
    transactionModel.create.mockResolvedValue({ _id: 'txn-1' });

    const result = await offerService.respondToOffer({ userId: 'buyer-1', offerId: 'offer-1', action: 'ACCEPT', req: {} });

    expect(materialListingModel.findOneAndUpdate).toHaveBeenCalled();
    expect(transactionModel.create).toHaveBeenCalled();
    expect(result.status).toBe(OFFER_STATES.ACCEPTED);
  });
});
