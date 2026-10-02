require('../../model/admin.model'); // registers `admins` for the populate() of admin refs below
const mongoose = require('mongoose');
const commissionSettingModel = require('../../model/commissionSetting.model');
const { SELLER_TYPES } = require('../../constants/sellerType.constants');
const configenv = require('../../config/env.config');
const cache = require('../../helper/cache.helper');
const { createAuditLogAdmin } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');

class CommissionError extends Error {
  constructor(message, statusCode = 400) { super(message); this.name = 'CommissionError'; this.statusCode = statusCode; }
}

// Fallback until an admin saves a rate for a seller type: the deployment's
// MARKETPLACE_COMMISSION_PCT (the single global rate used before
// per-seller-type commission existed).
const fallbackPct = () => {
  const n = Number(configenv.MARKETPLACE_COMMISSION_PCT);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

// Sellers created before sellerType existed are treated as INDIVIDUAL
// everywhere else in the app (see user.schema.js) — same rule here.
const normalizeSellerType = (t) => (t === SELLER_TYPES.BUSINESS_STORE ? SELLER_TYPES.BUSINESS_STORE : SELLER_TYPES.INDIVIDUAL);

async function loadCurrent() {
  const rows = await Promise.all(Object.values(SELLER_TYPES).map((sellerType) =>
    commissionSettingModel.findOne({ sellerType }).sort({ createdAt: -1 }).lean()));
  const out = {};
  Object.values(SELLER_TYPES).forEach((sellerType, i) => {
    const row = rows[i];
    out[sellerType] = row
      ? { sellerType, pct: row.pct, settingId: String(row._id), updatedAt: row.createdAt, source: 'admin' }
      : { sellerType, pct: fallbackPct(), settingId: null, updatedAt: null, source: 'default' };
  });
  return out;
}

/** Current rate for every seller type (cached 5 min; invalidated on change). */
async function getCurrentRates() {
  return cache.getOrSet(cache.NAMESPACES.COMMISSION, 'current', 5 * 60, loadCurrent);
}

/**
 * The commission that applies to a seller type RIGHT NOW. Called once per
 * transaction, at the moment the payment is captured (the financial lock);
 * the returned settingId and pct are stored on the transaction.
 */
async function getApplicableCommission(sellerType) {
  const rates = await getCurrentRates();
  const r = rates[normalizeSellerType(sellerType)];
  return { sellerType: r.sellerType, pct: r.pct, settingId: r.settingId };
}

async function history({ sellerType, page = 1, limit = 20 }) {
  const query = sellerType ? { sellerType } : {};
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);
  const [getData, count] = await Promise.all([
    commissionSettingModel.find(query).populate('changedBy', 'fullName email').sort({ createdAt: -1 })
      .skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    commissionSettingModel.countDocuments(query),
  ]);
  return { getData, count, page: pageNum, limit: pageLimit };
}

/** Admin: set a new rate for one seller type (new version; audited). */
async function update({ sellerType, pct, reason, adminId, req }) {
  if (!Object.values(SELLER_TYPES).includes(sellerType)) throw new CommissionError('Unknown seller type');
  const value = Math.round(Number(pct) * 100) / 100; // 2 decimals
  if (!Number.isFinite(value) || value < 0 || value > 50) throw new CommissionError('Commission must be between 0% and 50%');
  const current = (await loadCurrent())[sellerType];
  if (current.source === 'admin' && current.pct === value) throw new CommissionError(`Commission is already ${value}%`, 409);

  const row = await commissionSettingModel.create({
    sellerType, pct: value, previousPct: current.pct, reason: reason || '',
    changedBy: mongoose.Types.ObjectId.isValid(adminId) ? adminId : null,
  });
  await cache.invalidateNamespace(cache.NAMESPACES.COMMISSION);
  await createAuditLogAdmin({
    req, adminId, action: auditLogConstants.ADMIN_COMMISSION_UPDATED, entity: 'commission_settings', entityId: row._id,
    fromState: String(current.pct), toState: String(value), reason,
    metadata: { sellerType, previousPct: current.pct, pct: value },
  });
  return row;
}

module.exports = { CommissionError, normalizeSellerType, getCurrentRates, getApplicableCommission, history, update };
