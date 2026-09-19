/**
 * supplyType (SURPLUS / NEW_UNUSED / NEW_STOCK) must stay orthogonal to
 * sellerType (INDIVIDUAL / BUSINESS_STORE) — never merged into one field
 * (spec: "keep Seller Type and Supply Type separate"). This is the one
 * server-side chokepoint that enforces it: a Business/Store seller can
 * never list anything but NEW_STOCK, and an Individual seller can never
 * submit NEW_STOCK, regardless of what the client sends.
 */

jest.mock('mongoose', () => ({ Types: { ObjectId: { isValid: jest.fn().mockReturnValue(true) } } }));
jest.mock('../model/materialListing.model', () => ({}));
jest.mock('../model/materialCategory.model', () => ({}));
jest.mock('../model/offer.model', () => ({}));
jest.mock('../model/user.model', () => ({}));
jest.mock('../model/storeProfile.model', () => ({}));
jest.mock('../validation/app/materialSpecs.validation', () => ({ validateSpecifications: jest.fn(), mergeSpecFieldDefs: jest.fn() }));
jest.mock('../helper/helper', () => ({}));
jest.mock('../helper/audit.helper', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));

const { resolveSupplyType, MaterialListingError } = require('../service/app/materialListing.service');
const { SUPPLY_TYPES } = require('../constants/materialListing.constants');
const { SELLER_TYPES } = require('../constants/sellerType.constants');

describe('materialListing.service.resolveSupplyType', () => {
  test('forces NEW_STOCK for a Business/Store seller regardless of what was requested', () => {
    expect(resolveSupplyType(SELLER_TYPES.BUSINESS_STORE, SUPPLY_TYPES.SURPLUS)).toBe(SUPPLY_TYPES.NEW_STOCK);
    expect(resolveSupplyType(SELLER_TYPES.BUSINESS_STORE, undefined)).toBe(SUPPLY_TYPES.NEW_STOCK);
  });

  test('accepts SURPLUS or NEW_UNUSED for an individual seller', () => {
    expect(resolveSupplyType(SELLER_TYPES.INDIVIDUAL, SUPPLY_TYPES.SURPLUS)).toBe(SUPPLY_TYPES.SURPLUS);
    expect(resolveSupplyType(SELLER_TYPES.INDIVIDUAL, SUPPLY_TYPES.NEW_UNUSED)).toBe(SUPPLY_TYPES.NEW_UNUSED);
  });

  test('rejects NEW_STOCK from an individual seller', () => {
    expect(() => resolveSupplyType(SELLER_TYPES.INDIVIDUAL, SUPPLY_TYPES.NEW_STOCK)).toThrow(MaterialListingError);
  });

  test('rejects a missing/invalid supplyType for an individual seller', () => {
    expect(() => resolveSupplyType(SELLER_TYPES.INDIVIDUAL, undefined)).toThrow(MaterialListingError);
  });

  test('treats a legacy seller with no sellerType set as INDIVIDUAL (pre-migration compatibility)', () => {
    expect(resolveSupplyType(null, SUPPLY_TYPES.SURPLUS)).toBe(SUPPLY_TYPES.SURPLUS);
    expect(() => resolveSupplyType(null, SUPPLY_TYPES.NEW_STOCK)).toThrow(MaterialListingError);
  });
});
