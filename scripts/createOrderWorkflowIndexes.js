/**
 * Builds the indexes added for the handover → confirmation → settlement,
 * notification-dedupe and revenue-analytics work. Safe to re-run.
 *
 * Uses createIndexes() (only adds missing indexes) — NOT syncIndexes(),
 * which would also drop indexes that aren't declared in the schemas.
 * Mongoose builds these automatically at startup when autoIndex is on; run
 * this where autoIndex is disabled:   node scripts/createOrderWorkflowIndexes.js
 *
 * No data migration is needed: every new field (transaction.handoverDetails,
 * receiptConfirmation, commissionTax*, user.safetyNoticeAcks,
 * notification.dedupeKey) is optional and defaults to "not recorded".
 */
require('dotenv').config();
const mongoose = require('mongoose');
const configenv = require('../src/config/env.config');
const notificationModel = require('../src/model/notification.model');
const transactionModel = require('../src/model/transaction.model');

(async () => {
  // Same connection string as src/config/db.js.
  if (!configenv.MONGODB_URL || !configenv.MONGODB_NAME) throw new Error('Set MONGODB_URL and MONGODB_NAME first');
  const uri = configenv.MONGODB_URL + configenv.MONGODB_NAME;
  await mongoose.connect(uri);
  await notificationModel.createIndexes(); // { dedupeKey: 1 } unique + sparse
  await transactionModel.createIndexes();  // { paymentConfirmedAt: -1, commissionStatus: 1 }
  console.log('Indexes ensured: notifications.dedupeKey, transactions.paymentConfirmedAt+commissionStatus');
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
