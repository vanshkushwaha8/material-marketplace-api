#!/usr/bin/env node
/*
 * RBAC migration: DB-defined modules/permissions → code-defined permission
 * catalog (src/constants/rbac.constants.js).
 *
 *   npm run migrate:rbac               dry run — prints what would change, writes nothing
 *   npm run migrate:rbac -- --apply    1) roles.permissions ← mapped legacy permissionIds
 *                                      2) admin notifications ← new requiredPermission keys
 *                                      Legacy data (roles.permissionIds, `modules`,
 *                                      `permissions` collections) is LEFT IN PLACE.
 *   npm run migrate:rbac -- --cleanup  only after --apply and checking staff access:
 *                                      unsets roles.permissionIds, drops the `modules`
 *                                      and `permissions` collections, soft-deletes empty
 *                                      roles nobody holds. Refuses if any role is unmigrated.
 *
 * Never grants more than a role had: a legacy key with no safe equivalent
 * (KYC, investor, project, module/permission/role/sub-admin management, …)
 * is dropped and reported. Staff/role management is Super Admin only now.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const configenv = require('../src/config/env.config');
const { ASSIGNABLE_ADMIN_PERMISSIONS, USER_ROLE_PERMISSIONS } = require('../src/constants/rbac.constants');
const { ADMIN_NOTIFICATION_TYPES } = require('../src/constants/adminNotification.constants');

// legacy modulePermission → new key(s). Same or narrower access only.
const LEGACY_MAP = {
  manageDashboardView: ['dashboard:read'],
  manageUsersView: ['user:read'],
  manageUsersStatusChange: ['user:manage'],
  manageMaterialCategoryView: ['category:read'],
  manageMaterialCategoryManage: ['category:manage'],
  manageBusinessTypeView: ['business_type:read'],
  manageBusinessTypeManage: ['business_type:manage'],
  manageMaterialListingView: ['listing:read'],
  manageMaterialListingModerate: ['listing:moderate'],
  manageRatingsView: ['review:read'],
  manageRatingsModerate: ['review:moderate'],
  manageTransactionHistoryView: ['transaction:read'],
  managePaymentHistoryView: ['payment:read'],
  manageCommissionHistoryView: ['commission:read'],
  manageCommissionSettingsView: ['commission:read'],
  manageCommissionSettings: ['commission:update'],
  manageSettlementHistoryView: ['settlement:read'],
  manageRefund: ['payment:refund'],
  manageDispute: ['dispute:resolve'],
  // The old single "payment actions" permission covered both release and
  // refund recovery actions — same access, now two keys.
  managePaymentActions: ['payment:release', 'payment:refund'],
  managePaymentManualResolution: ['payment:manual_resolve'],
  manageLegalDocumentsView: ['legal_document:read'],
  manageAuditLogView: ['audit_log:read'],
  manageAuditLogExport: ['audit_log:export'],
  manageAuditLogBulkExport: ['audit_log:export'],
};
// New keys that merge several legacy ones: granted only if the role held ALL
// of them (otherwise it would gain e.g. delete from add-only).
const COMBINED = {
  'legal_document:manage': ['manageLegalDocumentsAdd', 'manageLegalDocumentsEdit', 'manageLegalDocumentsDelete', 'manageLegalDocumentsStatusChange'],
};

const args = new Set(process.argv.slice(2));
const MODE = args.has('--cleanup') ? 'cleanup' : args.has('--apply') ? 'apply' : 'dry-run';

function mapLegacy(legacyKeys) {
  const keys = new Set(legacyKeys);
  const granted = new Set();
  const dropped = [];
  for (const k of keys) {
    if (LEGACY_MAP[k]) LEGACY_MAP[k].forEach((n) => granted.add(n));
    else if (!Object.values(COMBINED).some((parts) => parts.includes(k))) dropped.push(k);
  }
  for (const [target, parts] of Object.entries(COMBINED)) {
    if (parts.every((p) => keys.has(p))) granted.add(target);
    else parts.filter((p) => keys.has(p)).forEach((p) => dropped.push(`${p} (needs all of ${parts.join(', ')} → ${target})`));
  }
  return { permissions: [...granted].filter((p) => ASSIGNABLE_ADMIN_PERMISSIONS.includes(p)).sort(), dropped: dropped.sort() };
}

async function collectionExists(db, name) {
  return (await db.listCollections({ name }).toArray()).length > 0;
}

async function main() {
  await mongoose.connect(configenv.MONGODB_URL + configenv.MONGODB_NAME);
  const db = mongoose.connection.db;
  const roles = db.collection('roles');
  const admins = db.collection('admins');
  console.log(`RBAC migration — mode: ${MODE}\n`);

  // ---- 1. Staff roles ------------------------------------------------------
  const hasLegacyPerms = await collectionExists(db, 'permissions');
  const legacyById = new Map();
  if (hasLegacyPerms) {
    for (const p of await db.collection('permissions').find({ is_deleted: { $ne: '1' }, status: { $ne: 'inactive' } }).toArray()) {
      legacyById.set(String(p._id), p.modulePermission);
    }
  }
  const allRoles = await roles.find({ is_deleted: { $ne: '1' } }).toArray();
  let unmigrated = 0;
  for (const role of allRoles) {
    const members = await admins.countDocuments({ roleId: role._id, is_deleted: { $ne: '1' } });
    // `name` = rows written by the old (KYC-era) role seed, which used
    // capability strings instead of permission ids — those map to nothing.
    const name = role.roleName || role.name || `Role ${String(role._id).slice(-6)}`;
    if (role.rbacMigratedAt) {
      console.log(`✓ ${name}: already migrated → [${(role.permissions || []).join(', ')}] (${members} staff)`);
      continue;
    }
    unmigrated += 1;
    const legacyKeys = (role.permissionIds || []).map((id) => legacyById.get(String(id))).filter(Boolean);
    const { permissions, dropped } = mapLegacy(legacyKeys);
    console.log(`• ${name} (${members} staff)`);
    console.log(`    new:     [${permissions.join(', ') || '— none —'}]`);
    if (dropped.length) console.log(`    dropped: ${dropped.join(', ')}`);
    if (!permissions.length) console.log(`    ⚠ no remaining permissions — its staff will be refused at sign-in until reassigned`);
    if (MODE === 'apply') {
      await roles.updateOne({ _id: role._id }, { $set: { roleName: name, permissions, rbacMigratedAt: new Date() } });
      if (Array.isArray(role.permissions) && role.permissions.length && !role.permissionIds) {
        console.log(`    (legacy seed capabilities discarded: ${role.permissions.join(', ')})`);
      }
    }
  }
  if (!allRoles.length) console.log('No staff roles found.');

  // ---- 2. Admin notifications ------------------------------------------------
  console.log('\nAdmin notifications:');
  for (const [type, def] of Object.entries(ADMIN_NOTIFICATION_TYPES)) {
    const filter = { type, requiredPermission: { $ne: def.permission } };
    const n = await db.collection('admin_notifications').countDocuments(filter).catch(() => 0);
    if (n) {
      console.log(`  ${type}: ${n} → ${def.permission}`);
      if (MODE === 'apply') await db.collection('admin_notifications').updateMany(filter, { $set: { requiredPermission: def.permission } });
    }
  }

  // ---- 3. Checks (read-only) --------------------------------------------------
  console.log('\nChecks:');
  const supers = await admins.find({ isSuperAdmin: true, is_deleted: { $ne: '1' } }).project({ type: 1, email: 1 }).toArray();
  const badSupers = supers.filter((a) => a.type !== 'admin');
  console.log(`  Super Admin accounts: ${supers.length}${badSupers.length ? ` — ⚠ ${badSupers.length} with isSuperAdmin but type≠'admin' (no longer full access)` : ''}`);
  const badTypes = await admins.countDocuments({ type: { $nin: ['admin', 'subadmin'] }, is_deleted: { $ne: '1' } });
  if (badTypes) console.log(`  ⚠ ${badTypes} admin account(s) with an unknown type`);
  const roleless = await admins.countDocuments({ isSuperAdmin: { $ne: true }, $or: [{ roleId: null }, { roleId: { $exists: false } }], is_deleted: { $ne: '1' } });
  if (roleless) console.log(`  ⚠ ${roleless} staff account(s) without a role — refused at sign-in until one is assigned`);
  const unknownUsers = await db.collection('users').countDocuments({ userType: { $nin: Object.keys(USER_ROLE_PERMISSIONS) }, is_deleted: { $ne: '1' } });
  console.log(`  Marketplace users with a non Buyer/Seller role: ${unknownUsers}${unknownUsers ? ' — ⚠ these accounts are now refused (fail closed)' : ''}`);
  const noSellerType = await db.collection('users').countDocuments({ userType: 'Seller', sellerType: { $in: [null, undefined] }, is_deleted: { $ne: '1' } });
  if (noSellerType) console.log(`  ℹ ${noSellerType} seller(s) without sellerType — treated as INDIVIDUAL (npm script: scripts/backfillSellerType.js)`);

  // ---- 4. Cleanup (explicit, last) --------------------------------------------
  if (MODE === 'cleanup') {
    if (unmigrated) {
      console.error(`\n✗ ${unmigrated} role(s) not migrated yet — run with --apply first. Nothing removed.`);
      process.exitCode = 1;
    } else {
      await roles.updateMany({}, { $unset: { permissionIds: '', name: '', isSystemRole: '' } });
      for (const name of ['modules', 'permissions']) {
        if (await collectionExists(db, name)) { await db.collection(name).drop(); console.log(`\n  dropped collection: ${name}`); }
      }
      for (const role of await roles.find({ is_deleted: { $ne: '1' }, permissions: { $size: 0 } }).toArray()) {
        const members = await admins.countDocuments({ roleId: role._id, is_deleted: { $ne: '1' } });
        if (!members) { await roles.updateOne({ _id: role._id }, { $set: { is_deleted: '1' } }); console.log(`  removed empty role: ${role.roleName}`); }
        else console.log(`  ⚠ empty role still held by ${members} staff: ${role.roleName} — reassign them`);
      }
      console.log('  legacy roles.permissionIds removed');
    }
  }

  console.log(MODE === 'dry-run' ? '\nDry run — nothing written. Re-run with --apply.' : '\nDone.');
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('RBAC migration failed:', err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = { mapLegacy, LEGACY_MAP, COMBINED };
