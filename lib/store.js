/**
 * Tiny key-value store.
 *
 * On Vercel: Upstash Redis over its REST API (add it from the Vercel dashboard:
 * Storage → Upstash → Redis; Vercel then sets the env vars below automatically).
 * Locally, with no Redis env vars: an in-memory Map (resets when the server restarts).
 */

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

const hasRedis = Boolean(REDIS_URL && REDIS_TOKEN);

async function redis(commands) {
  const res = await fetch(`${REDIS_URL.replace(/\/$/, '')}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  const out = await res.json();
  return out.map(r => {
    if (r.error) throw new Error(`Redis: ${r.error}`);
    return r.result;
  });
}

/* ── In-memory fallback (local development only) ── */
const mem = new Map(); // key -> { value, expiresAt }

function memGet(key) {
  const e = mem.get(key);
  if (!e) return null;
  if (e.expiresAt && e.expiresAt < Date.now()) {
    mem.delete(key);
    return null;
  }
  return e.value;
}

/** Get a JSON value, or null. */
async function getJSON(key) {
  if (!hasRedis) {
    const v = memGet(key);
    return v == null ? null : JSON.parse(v);
  }
  const [v] = await redis([['GET', key]]);
  return v == null ? null : JSON.parse(v);
}

/** Set a JSON value only if the key does not exist yet. Returns true if it was set. */
async function setJSONIfAbsent(key, value) {
  const s = JSON.stringify(value);
  if (!hasRedis) {
    if (memGet(key) != null) return false;
    mem.set(key, { value: s, expiresAt: 0 });
    return true;
  }
  const [r] = await redis([['SET', key, s, 'NX']]);
  return r === 'OK';
}

/** Increment a counter that expires `ttlSeconds` after it is first created. Returns the new count. */
async function incr(key, ttlSeconds) {
  if (!hasRedis) {
    const cur = Number(memGet(key) || 0) + 1;
    const prev = mem.get(key);
    const expiresAt = prev && prev.expiresAt > Date.now() ? prev.expiresAt : Date.now() + ttlSeconds * 1000;
    mem.set(key, { value: String(cur), expiresAt });
    return cur;
  }
  const [count] = await redis([
    ['INCR', key],
    ['EXPIRE', key, String(ttlSeconds), 'NX'],
  ]);
  return Number(count);
}

/** Undo one increment (used when a request is rejected by a later limit). */
async function decr(key) {
  if (!hasRedis) {
    const e = mem.get(key);
    if (e) e.value = String(Math.max(0, Number(e.value) - 1));
    return;
  }
  await redis([['DECR', key]]);
}

/** Delete a key (account deletion). */
async function del(key) {
  if (!hasRedis) {
    mem.delete(key);
    return;
  }
  await redis([['DEL', key]]);
}

module.exports = { hasRedis, getJSON, setJSONIfAbsent, incr, decr, del };
