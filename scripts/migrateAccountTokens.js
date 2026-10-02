#!/usr/bin/env node
/*
 * Account-token migration (password reset + staff invitation links).
 *
 *   npm run migrate:tokens               dry run — prints what would change, writes nothing
 *   npm run migrate:tokens -- --apply    applies the changes below
 *
 * 1. Audit-log scrub. Until this release the staff-invite audit entries
 *    (SUBADMINCREATED / SUBADMININVITERESEND) stored the full invitation URL
 *    — i.e. the RAW token — in metadata.info.inviteUrl, readable by anyone
 *    with audit_log:read. That field is removed.
 * 2. Any invitation link still usable today was exposed that way, so it is
 *    revoked (revokedAt = now). The staff members affected are listed: the
 *    Super Admin resends their invitation from Staff Management.
 * 3. Backfill on older token records: tokenType (adminId → STAFF_INVITATION,
 *    userId → PASSWORD_RESET) and usedAt for ones marked used. (The code
 *    already treats untyped/legacy records this way — this is for clarity.)
 * 4. The passwordresets TTL index is rebuilt to keep records 7 days past
 *    expiry (was: deleted at expiry, which turned "expired" into "invalid").
 *
 * Validity never depends on this script: tokens are checked server side on
 * every use. Safe to re-run.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const configenv = require('../src/config/env.config');

const APPLY = process.argv.includes('--apply');
const SEVEN_DAYS = 7 * 24 * 60 * 60;

(async () => {
  await mongoose.connect(configenv.MONGODB_URL + configenv.MONGODB_NAME);
  const db = mongoose.connection.db;
  const audit = db.collection('auditlogs');
  const tokens = db.collection('passwordresets');
  const admins = db.collection('admins');
  const now = new Date();
  console.log(APPLY ? 'APPLYING changes' : 'DRY RUN — nothing is written (add --apply)');

  // 1. audit-log scrub
  const leaked = { 'metadata.info.inviteUrl': { $exists: true } };
  const leakedCount = await audit.countDocuments(leaked);
  console.log(`\n1. Audit entries holding a raw invitation URL: ${leakedCount}`);
  if (APPLY && leakedCount) {
    const r = await audit.updateMany(leaked, { $unset: { 'metadata.info.inviteUrl': '' } });
    console.log(`   removed from ${r.modifiedCount} entries`);
  }

  // 2. revoke still-usable invitations (their raw token was in the audit log)
  const activeInvites = {
    adminId: { $exists: true, $ne: null },
    tokenType: { $in: ['STAFF_INVITATION', null] },
    usedAt: null, revokedAt: null, used: { $ne: true },
    expiresAt: { $gt: now },
  };
  const invites = await tokens.find(activeInvites, { projection: { adminId: 1 } }).toArray();
  const affected = invites.length
    ? await admins.find({ _id: { $in: invites.map((t) => t.adminId) } }, { projection: { email: 1, isPasswordSet: 1 } }).toArray()
    : [];
  console.log(`\n2. Usable invitation links to revoke: ${invites.length}`);
  for (const a of affected) console.log(`   - ${a.email}${a.isPasswordSet ? ' (already set a password — nothing to resend)' : ' → resend the invitation'}`);
  if (APPLY && invites.length) {
    const r = await tokens.updateMany(activeInvites, { $set: { revokedAt: now } });
    console.log(`   revoked ${r.modifiedCount}`);
  }

  // 3. backfill
  const untypedAdmin = await tokens.countDocuments({ tokenType: null, adminId: { $exists: true, $ne: null } });
  const untypedUser = await tokens.countDocuments({ tokenType: null, userId: { $exists: true, $ne: null } });
  const usedNoDate = await tokens.countDocuments({ used: true, usedAt: null });
  console.log(`\n3. Backfill: ${untypedAdmin} admin + ${untypedUser} user records without tokenType; ${usedNoDate} used without usedAt`);
  if (APPLY) {
    await tokens.updateMany({ tokenType: null, adminId: { $exists: true, $ne: null } }, { $set: { tokenType: 'STAFF_INVITATION' } });
    await tokens.updateMany({ tokenType: null, userId: { $exists: true, $ne: null } }, { $set: { tokenType: 'PASSWORD_RESET' } });
    // updatedAt is the best available approximation of when it was used
    await tokens.updateMany({ used: true, usedAt: null }, [{ $set: { usedAt: { $ifNull: ['$updatedAt', now] } } }]);
  }

  // 4. TTL index
  const indexes = await tokens.indexes().catch(() => []);
  const ttl = indexes.find((i) => i.key && i.key.expiresAt === 1 && Object.keys(i.key).length === 1);
  const ttlOk = ttl && ttl.expireAfterSeconds === SEVEN_DAYS;
  console.log(`\n4. TTL index: ${ttl ? `${ttl.name} expireAfterSeconds=${ttl.expireAfterSeconds}` : 'none'}${ttlOk ? ' (ok)' : ` → expireAfterSeconds=${SEVEN_DAYS}`}`);
  if (APPLY && !ttlOk) {
    if (ttl) await db.command({ collMod: 'passwordresets', index: { name: ttl.name, expireAfterSeconds: SEVEN_DAYS } });
    else await tokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: SEVEN_DAYS });
    console.log('   updated');
  }
  if (APPLY) await tokens.createIndex({ tokenHash: 1 });

  console.log(APPLY ? '\nDone.' : '\nDry run complete. Re-run with --apply to make these changes.');
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error('Migration failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
