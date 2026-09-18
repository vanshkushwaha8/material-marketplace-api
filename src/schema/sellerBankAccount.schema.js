const mongoose = require('mongoose');
const { BANK_ACCOUNT_STATES } = require('../constants/payout.constants');
const deleteConstants = require('../constants/delete.constants');

// Deliberately does NOT persist the full account number — it's handed to
// the payout provider once (to create a Fund Account) and only the
// provider's own reference id is kept here, plus a masked last-4 for
// display. "Avoid storing sensitive payment credentials unnecessarily."
const sellerBankAccountSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, unique: true, index: true },
    accountHolderName: { type: String, required: true, trim: true },
    bankName: { type: String, required: true, trim: true },
    accountNumberLast4: { type: String, required: true },
    ifsc: { type: String, required: true, uppercase: true, trim: true },

    provider: { type: String, required: true },
    providerContactId: { type: String, default: null },
    providerFundAccountId: { type: String, default: null, index: true },

    verificationStatus: { type: String, enum: Object.values(BANK_ACCOUNT_STATES), default: BANK_ACCOUNT_STATES.PENDING, index: true },
    verificationMethod: { type: String, default: '' },
    verifiedAt: { type: Date, default: null },
    failureReason: { type: String, trim: true, default: '' },

    history: [{ action: { type: String, required: true }, note: { type: String, trim: true, default: '' }, at: { type: Date, default: Date.now } }],
    is_deleted: { type: String, enum: [deleteConstants.NOT_DELETED, deleteConstants.DELETED], default: deleteConstants.NOT_DELETED, index: true },
  },
  { timestamps: true }
);

module.exports = sellerBankAccountSchema;