const sellerBankAccountModel = require('../../model/sellerBankAccount.model');
const userModel = require('../../model/user.model');
const deleteConstants = require('../../constants/delete.constants');
const { BANK_ACCOUNT_STATES } = require('../../constants/payout.constants');
const configenv = require('../../config/env.config');
const { getPayoutAdapter } = require('../../config/integrations.config');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');

class BankAccountError extends Error {
  constructor(message, statusCode = 400) { super(message); this.name = 'BankAccountError'; this.statusCode = statusCode; }
}

// Full account number only ever exists in memory for this call — it goes
// to the provider to create a Fund Account and is never written to the
// database. Re-linking replaces the existing doc (one active account per seller).
async function linkBankAccount({ sellerId, body, req }) {
  const seller = await userModel.findById(sellerId).select('fullName email');
  if (!seller) throw new BankAccountError('Seller not found', 404);

  const adapter = getPayoutAdapter();
  const { providerContactId } = await adapter.createContact({ name: seller.fullName, email: seller.email, reference: String(sellerId) });
  const { providerFundAccountId } = await adapter.createFundAccount({
    providerContactId, accountHolderName: body.accountHolderName, accountNumber: body.accountNumber, ifsc: body.ifsc,
  });

  const account = await sellerBankAccountModel.findOneAndUpdate(
    { seller: sellerId },
    {
      $set: {
        seller: sellerId, accountHolderName: body.accountHolderName, bankName: body.bankName,
        accountNumberLast4: body.accountNumber.slice(-4), ifsc: body.ifsc,
        provider: configenv.PAYOUT_PROVIDER || 'manual', providerContactId, providerFundAccountId,
        verificationStatus: BANK_ACCOUNT_STATES.PENDING, verificationMethod: '', verifiedAt: null, failureReason: '', providerValidationId: null,
      },
      $push: { history: { action: 'LINKED', note: `Bank: ${body.bankName}` } },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await createAuditLog({ req, userId: sellerId, action: auditLogConstants.BANK_ACCOUNT_LINKED, entity: 'seller_bank_accounts', entityId: account._id });
  return verifyBankAccount({ sellerId, req });
}

async function verifyBankAccount({ sellerId, req }) {
  const account = await sellerBankAccountModel.findOne({ seller: sellerId, is_deleted: deleteConstants.NOT_DELETED });
  if (!account) throw new BankAccountError('No bank account linked', 404);
  if (account.verificationStatus === BANK_ACCOUNT_STATES.DISABLED) throw new BankAccountError('This bank account has been disabled', 409);

  if (account.verificationStatus === BANK_ACCOUNT_STATES.VERIFIED) return account;

  const adapter = getPayoutAdapter();
  try {
    // Re-read an in-flight penny drop rather than starting a second one.
    const { status, method, validationId } = account.providerValidationId && account.verificationStatus === BANK_ACCOUNT_STATES.PENDING
      ? await adapter.fetchFundAccountValidation(account.providerValidationId)
      : await adapter.validateFundAccount({ providerFundAccountId: account.providerFundAccountId });

    account.providerValidationId = validationId || account.providerValidationId;
    account.verificationMethod = method;
    if (status === 'pending') {
      // Still with the bank — stays PENDING (PAYOUT_PENDING to the seller).
      account.verificationStatus = BANK_ACCOUNT_STATES.PENDING;
      account.failureReason = '';
      await account.save();
      return account;
    }
    const verified = status === 'active';
    account.verificationStatus = verified ? BANK_ACCOUNT_STATES.VERIFIED : BANK_ACCOUNT_STATES.FAILED;
    account.verifiedAt = verified ? new Date() : null;
    account.failureReason = verified ? '' : 'The bank could not validate this account. Check the account number and IFSC.';
    account.history.push({ action: verified ? 'VERIFIED' : 'VERIFICATION_FAILED' });
    await account.save();
    await createAuditLog({
      req, userId: sellerId,
      action: verified ? auditLogConstants.BANK_ACCOUNT_VERIFIED : auditLogConstants.BANK_ACCOUNT_VERIFICATION_FAILED,
      entity: 'seller_bank_accounts', entityId: account._id,
    });
  } catch (err) {
    // Payouts not configured on this server (production without
    // RazorpayX) — not the seller's fault; leave the account PENDING.
    if (err.statusCode === 503) {
      account.verificationStatus = BANK_ACCOUNT_STATES.PENDING;
      account.failureReason = err.message;
      await account.save();
      return account;
    }
    account.verificationStatus = BANK_ACCOUNT_STATES.FAILED;
    account.failureReason = err.message;
    account.history.push({ action: 'VERIFICATION_FAILED', note: err.message });
    await account.save();
    await createAuditLog({ req, userId: sellerId, action: auditLogConstants.BANK_ACCOUNT_VERIFICATION_FAILED, entity: 'seller_bank_accounts', entityId: account._id, metadata: { reason: err.message } });
  }
  return account;
}

async function getMyBankAccount(sellerId) {
  return sellerBankAccountModel.findOne({ seller: sellerId, is_deleted: deleteConstants.NOT_DELETED }).lean();
}

module.exports = { BankAccountError, linkBankAccount, verifyBankAccount, getMyBankAccount };