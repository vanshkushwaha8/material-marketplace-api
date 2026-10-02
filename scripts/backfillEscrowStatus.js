// One-off migration for transactions created before the escrow state
// machine (transaction.escrowStatus). Safe to run more than once.
//
//   npm run migrate:escrow
//
// Every transaction without escrowStatus gets the state derived from its
// existing order/payout status (escrow.service.js#deriveLegacyEscrowStatus)
// and a BACKFILL row in its escrow history. The API also backfills a
// transaction lazily the first time it is touched, so running this is only
// needed for admin filters/queues to be complete immediately.
require('dotenv').config();
const mongoose = require('mongoose');
const configenv = require('../src/config/env.config');
const transactionModel = require('../src/model/transaction.model');
const payoutModel = require('../src/model/payout.model');
const { deriveLegacyEscrowStatus } = require('../src/service/app/escrow.service');

async function run() {
  await mongoose.connect(configenv.MONGODB_URL + configenv.MONGODB_NAME);
  const cursor = transactionModel.find({ escrowStatus: { $exists: false } }).select('status').lean().cursor();
  let updated = 0;
  for await (const txn of cursor) {
    const payout = await payoutModel.findOne({ transaction: txn._id }).select('status').lean();
    const escrowStatus = deriveLegacyEscrowStatus(txn, payout);
    const res = await transactionModel.updateOne(
      { _id: txn._id, escrowStatus: { $exists: false } },
      {
        $set: { escrowStatus },
        $push: { escrowHistory: { from: null, to: escrowStatus, action: 'BACKFILL', actorType: 'system', reason: `Migrated from order status ${txn.status}`, at: new Date() } },
      }
    );
    updated += res.modifiedCount;
  }
  console.log(`Escrow status backfilled on ${updated} transaction(s).`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Escrow backfill failed:', err);
  process.exit(1);
});
