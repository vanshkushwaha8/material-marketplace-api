const mongoose = require('mongoose');
const sellerBankAccountSchema = require('../schema/sellerBankAccount.schema');
const SellerBankAccount = mongoose.model('seller_bank_accounts', sellerBankAccountSchema);
module.exports = SellerBankAccount;