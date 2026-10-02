/**
 * Cache-aside helper: miss → load → store, hit, namespace invalidation,
 * per-entity delete, batch reads, and fail-open when Redis errors.
 */
const mockStore = new Map();
let mockDown = false;
const mockGuard = (fn) => (...a) => (mockDown ? Promise.reject(new Error('ECONNREFUSED')) : Promise.resolve(fn(...a)));
const mockRedis = {
  get: mockGuard((k) => (mockStore.has(k) ? mockStore.get(k) : null)),
  set: mockGuard((k, v) => { mockStore.set(k, v); return 'OK'; }),
  mGet: mockGuard((keys) => keys.map((k) => (mockStore.has(k) ? mockStore.get(k) : null))),
  del: mockGuard((k) => mockStore.delete(k)),
  incr: mockGuard((k) => { const n = Number(mockStore.get(k) || 0) + 1; mockStore.set(k, String(n)); return n; }),
  multi() {
    const ops = [];
    const m = { set: (k, v) => { ops.push([k, v]); return m; }, exec: mockGuard(() => ops.forEach(([k, v]) => mockStore.set(k, v))) };
    return m;
  },
};
let mockEnabled = true;
jest.mock('../config/redis.config', () => ({ getRedis: () => (mockEnabled ? mockRedis : null) }));

const cache = require('../helper/cache.helper');
const NS = cache.NAMESPACES.CATEGORIES;

beforeEach(() => { mockStore.clear(); mockDown = false; mockEnabled = true; });

test('miss loads from the DB and stores; the next call is served from Redis', async () => {
  const loader = jest.fn().mockResolvedValue([{ name: 'Cement' }]);
  expect(await cache.getOrSet(NS, 'all', 60, loader)).toEqual([{ name: 'Cement' }]);
  expect(await cache.getOrSet(NS, 'all', 60, loader)).toEqual([{ name: 'Cement' }]);
  expect(loader).toHaveBeenCalledTimes(1);
});

test('invalidateNamespace makes every variant reload (admin edited a category)', async () => {
  const loader = jest.fn().mockResolvedValueOnce(['old']).mockResolvedValueOnce(['new']);
  await cache.getOrSet(NS, 'all', 60, loader);
  await cache.invalidateNamespace(NS);
  expect(await cache.getOrSet(NS, 'all', 60, loader)).toEqual(['new']);
  expect(loader).toHaveBeenCalledTimes(2);
});

test('del drops one entity only', async () => {
  const S = cache.NAMESPACES.STORE;
  const a = jest.fn().mockResolvedValue({ storeName: 'A' });
  const b = jest.fn().mockResolvedValue({ storeName: 'B' });
  await cache.getOrSet(S, 'a', 60, a);
  await cache.getOrSet(S, 'b', 60, b);
  await cache.del(S, 'a');
  await cache.getOrSet(S, 'a', 60, a);
  await cache.getOrSet(S, 'b', 60, b);
  expect(a).toHaveBeenCalledTimes(2);
  expect(b).toHaveBeenCalledTimes(1);
});

test('null results are not cached (a missing store is re-checked next time)', async () => {
  const loader = jest.fn().mockResolvedValue(null);
  await cache.getOrSet(cache.NAMESPACES.STORE, 'x', 60, loader);
  await cache.getOrSet(cache.NAMESPACES.STORE, 'x', 60, loader);
  expect(loader).toHaveBeenCalledTimes(2);
});

test('Redis down → served from the DB, request does not fail', async () => {
  mockDown = true;
  const loader = jest.fn().mockResolvedValue(['from-db']);
  await expect(cache.getOrSet(NS, 'all', 60, loader)).resolves.toEqual(['from-db']);
});

test('Redis not configured → plain DB read', async () => {
  mockEnabled = false;
  const loader = jest.fn().mockResolvedValue(['db']);
  await expect(cache.getOrSet(NS, 'all', 60, loader)).resolves.toEqual(['db']);
});

test('batch: only misses hit the DB; "no ratings" is cached too', async () => {
  const R = cache.NAMESPACES.SELLER_RATING;
  const load = jest.fn(async (ids) => new Map(ids.filter((id) => id === 's1').map((id) => [id, { average: 4.5, count: 2 }])));
  const first = await cache.getManyOrSet(R, ['s1', 's2'], 60, load);
  expect(first.get('s1')).toEqual({ average: 4.5, count: 2 });
  expect(first.has('s2')).toBe(false);
  const second = await cache.getManyOrSet(R, ['s1', 's2', 's3'], 60, load);
  expect(load).toHaveBeenCalledTimes(2);
  expect(load.mock.calls[1][0]).toEqual(['s3']); // s1 and s2 (no ratings) both cached
  expect(second.get('s1')).toEqual({ average: 4.5, count: 2 });
  expect(second.has('s2')).toBe(false);
});
