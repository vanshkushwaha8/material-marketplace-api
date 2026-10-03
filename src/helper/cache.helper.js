const { getRedis } = require('../config/redis.config');
const configenv = require('../config/env.config');

// Cache-aside for SHARED, read-heavy, rarely-changing data only.
//
// Keys: <prefix><namespace>:v<version>:<id>
//   Each namespace has a version counter. Invalidating a whole namespace
//   (e.g. every categories list variant) is a single INCR — old keys are
//   simply never read again and expire by TTL. No SCAN/KEYS, no races
//   with a concurrent cache fill writing an old value back under a new
//   version.
//
// What is cached is decided per call site (see NAMESPACES). Never cache
// per-user or security-relevant data here: offers, transactions, payments,
// notifications, sessions/auth and listing stock stay on MongoDB.
//
// Every Redis failure degrades to the loader (MongoDB) — the cache can
// make a request faster, never make it fail.

const NAMESPACES = Object.freeze({
  CATEGORIES: 'categories',       // public material categories (admin-managed)
  CATEGORY_STATS: 'category-stats', // per-category live listing counts / lowest price (short TTL, not invalidated)
  BUSINESS_TYPES: 'business-types', // public business types (admin-managed)
  STORE: 'store',                 // public store profile, per seller
  SELLER_RATING: 'seller-rating', // seller rating summary, per seller
  SITEMAP: 'sitemap',
  COMMISSION: 'commission',       // current commission rate per seller type (admin-managed)
});

const prefix = () => configenv.REDIS_KEY_PREFIX || 'bm:';
const versionKey = (ns) => `${prefix()}ns:${ns}`;

async function nsVersion(redis, ns) {
  return (await redis.get(versionKey(ns))) || '0';
}

const dataKey = (ns, version, id) => `${prefix()}${ns}:v${version}:${id}`;

/**
 * Return the cached value for (namespace, id) or load it, store it for
 * `ttlSeconds`, and return it. `undefined`/`null` results are not cached
 * (a missing store must not be pinned as "missing" for the whole TTL).
 */
async function getOrSet(ns, id, ttlSeconds, loader) {
  const redis = getRedis();
  if (!redis) return loader();
  let key;
  try {
    key = dataKey(ns, await nsVersion(redis, ns), id);
    const hit = await redis.get(key);
    if (hit != null) return JSON.parse(hit);
  } catch {
    return loader();
  }
  const value = await loader();
  if (value != null) {
    redis.set(key, JSON.stringify(value), { EX: ttlSeconds }).catch(() => {});
  }
  return value;
}

/**
 * Batch variant for per-entity values (e.g. rating summaries for every
 * seller on a search page): one MGET, then `loadMissing(ids)` → Map(id → value)
 * for the misses only.
 */
async function getManyOrSet(ns, ids, ttlSeconds, loadMissing) {
  const redis = getRedis();
  if (!redis || !ids.length) return loadMissing(ids);
  let keys;
  const out = new Map();
  let missing = ids;
  try {
    const version = await nsVersion(redis, ns);
    keys = ids.map((id) => dataKey(ns, version, id));
    const hits = await redis.mGet(keys);
    missing = [];
    hits.forEach((h, i) => {
      if (h == null) missing.push(ids[i]);
      else out.set(ids[i], JSON.parse(h));
    });
  } catch {
    return loadMissing(ids);
  }
  if (missing.length) {
    const loaded = await loadMissing(missing);
    const multi = redis.multi();
    missing.forEach((id) => {
      const v = loaded.get(id);
      // Cache "no ratings yet" too (as null-object), so sellers without
      // reviews don't trigger an aggregate on every page view.
      multi.set(keys[ids.indexOf(id)], JSON.stringify(v ?? { none: true }), { EX: ttlSeconds });
      if (v != null) out.set(id, v);
    });
    multi.exec().catch(() => {});
  }
  // Strip the null-object marker back out.
  for (const [id, v] of out) if (v && v.none) out.delete(id);
  return out;
}

/** Drop one entity's cached value (current namespace version). */
async function del(ns, id) {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(dataKey(ns, await nsVersion(redis, ns), id));
  } catch { /* TTL will expire it */ }
}

/** Invalidate every key in a namespace (version bump). */
async function invalidateNamespace(ns) {
  const redis = getRedis();
  if (!redis) return;
  try { await redis.incr(versionKey(ns)); } catch { /* TTL will expire it */ }
}

module.exports = { NAMESPACES, getOrSet, getManyOrSet, del, invalidateNamespace };
