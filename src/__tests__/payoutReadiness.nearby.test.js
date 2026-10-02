/**
 * Pure business rules:
 *  - seller payout readiness derived from bank-account + account status,
 *  - distance privacy for nearby discovery,
 *  - nearby query validation bounds.
 */
jest.mock('../service/admin/adminNotification.service', () => ({ notifyAdmins: jest.fn().mockResolvedValue(null) }));
jest.mock('../service/app/notification.service', () => ({ createNotification: jest.fn() }));

const { resolvePayoutReadiness } = require('../service/app/payout.service');
const { coarsenIndividualKm, roundStoreKm } = require('../service/app/nearby.service');
const nearbyValidation = require('../validation/app/nearby.validation');

describe('resolvePayoutReadiness', () => {
  test.each([
    [null, 'approved', 'PAYOUT_NOT_STARTED'],
    [{ verificationStatus: 'PENDING' }, 'approved', 'PAYOUT_PENDING'],
    [{ verificationStatus: 'VERIFIED' }, 'approved', 'PAYOUT_READY'],
    [{ verificationStatus: 'FAILED' }, 'approved', 'PAYOUT_FAILED'],
    [{ verificationStatus: 'DISABLED' }, 'approved', 'PAYOUT_RESTRICTED'],
    [{ verificationStatus: 'VERIFIED' }, 'suspended', 'PAYOUT_RESTRICTED'],
  ])('bank %j + seller %s -> %s', (bankAccount, sellerStatus, expected) => {
    expect(resolvePayoutReadiness({ bankAccount, sellerStatus })).toBe(expected);
  });
});

describe('nearby distance privacy', () => {
  test('store distance is rounded to 100 m', () => {
    expect(roundStoreKm(1834)).toBe(1.8);
  });

  test('individual seller distance is coarsened UP to the next 0.5 km, never below 0.5', () => {
    expect(coarsenIndividualKm(40)).toBe(0.5);
    expect(coarsenIndividualKm(2401)).toBe(2.5);
    expect(coarsenIndividualKm(3000)).toBe(3);
  });
});

describe('nearby query validation', () => {
  test('requires lat/lng and defaults the radius', () => {
    expect(nearbyValidation.ValidateSellers({}).error).toBeTruthy();
    const { value, error } = nearbyValidation.ValidateSellers({ lat: '25.61', lng: '85.14' });
    expect(error).toBeUndefined();
    expect(value.radiusKm).toBe(5);
  });

  test('rejects out-of-range coordinates and radius', () => {
    expect(nearbyValidation.ValidateSellers({ lat: 95, lng: 85 }).error).toBeTruthy();
    expect(nearbyValidation.ValidateSellers({ lat: 25, lng: 185 }).error).toBeTruthy();
    expect(nearbyValidation.ValidateSellers({ lat: 25, lng: 85, radiusKm: 1000 }).error).toBeTruthy();
  });
});
