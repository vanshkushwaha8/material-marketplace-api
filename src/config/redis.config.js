const configenv = require('./env.config');

// Lazily-connected, OPTIONAL Redis client for the read cache.
//
//  - REDIS_URL unset  → getRedis() returns null; callers read MongoDB.
//  - Redis down       → commands fail fast (no offline queue) and the cache
//                       helper falls back to MongoDB; the client keeps
//                       reconnecting in the background.
// The cache is an optimisation only — the API must never fail because of it.
let client = null;
let connecting = null;
let warned = false;

function getRedis() {
  if (!configenv.REDIS_URL || configenv.NODE_ENV === 'test') return null;
  if (client?.isReady) return client;
  if (!connecting) {
    const { createClient } = require('redis');
    const c = createClient({
      url: configenv.REDIS_URL,
      disableOfflineQueue: true,
      socket: {
        connectTimeout: 2000,
        reconnectStrategy: (retries) => Math.min(retries * 200, 5000),
      },
    });
    c.on('error', (err) => {
      if (!warned) { console.warn('[cache] Redis unavailable — serving from MongoDB:', err.message); warned = true; }
    });
    c.on('ready', () => { warned = false; console.log('[cache] Redis connected'); });
    client = c;
    connecting = c.connect().catch(() => { /* reconnectStrategy keeps trying */ });
  }
  return client?.isReady ? client : null;
}

async function closeRedis() {
  if (client) await client.quit().catch(() => {});
  client = null;
  connecting = null;
}

module.exports = { getRedis, closeRedis };
