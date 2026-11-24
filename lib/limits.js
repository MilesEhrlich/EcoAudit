/**
 * Usage limits that keep the Anthropic bill bounded.
 *
 * Every AI request must pass all of these (defaults below; override with env vars on Vercel):
 *   AI_LIMIT_USER_DAY    per signed-in account, per day     (default 40)
 *   AI_LIMIT_IP_DAY      per IP address, per day            (default 80)
 *   AI_LIMIT_IP_MINUTE   per IP address, per minute (burst) (default 8)
 *   AI_LIMIT_GLOBAL_DAY  whole site, per day (hard ceiling) (default 300)
 * Plus account abuse limits:
 *   SIGNUP_LIMIT_IP_DAY  new accounts per IP, per day       (default 5)
 *   LOGIN_LIMIT_IP_15MIN sign-in attempts per IP, per 15 min (default 20)
 *
 * Days are UTC calendar days.
 */
const store = require('./store');

const num = (name, dflt) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : dflt;
};

const LIMITS = {
  userDay: num('AI_LIMIT_USER_DAY', 40),
  ipDay: num('AI_LIMIT_IP_DAY', 80),
  ipMinute: num('AI_LIMIT_IP_MINUTE', 8),
  globalDay: num('AI_LIMIT_GLOBAL_DAY', 300),
  signupIpDay: num('SIGNUP_LIMIT_IP_DAY', 5),
  loginIp15: num('LOGIN_LIMIT_IP_15MIN', 20),
};

const DAY = 60 * 60 * 24;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown';
}

/**
 * Count one AI call against every bucket. If any bucket is over its limit, the counts are
 * rolled back and `{ ok: false, reason }` is returned.
 * `email` may be null (e.g. the browser extension's anonymous audit endpoint).
 */
async function takeAiCall(req, email) {
  const ip = clientIp(req);
  const d = today();
  const minute = Math.floor(Date.now() / 60000);
  const buckets = [
    { key: `ea:ai:ip-min:${ip}:${minute}`, limit: LIMITS.ipMinute, ttl: 120, reason: 'Too many requests. Wait a minute and try again.' },
    { key: `ea:ai:ip-day:${ip}:${d}`, limit: LIMITS.ipDay, ttl: 2 * DAY, reason: 'Daily AI limit reached for your network. Try again tomorrow.' },
    ...(email ? [{ key: `ea:ai:user-day:${email}:${d}`, limit: LIMITS.userDay, ttl: 2 * DAY, reason: `You've used today's ${LIMITS.userDay} AI audits. They reset at midnight UTC.` }] : []),
    { key: `ea:ai:global-day:${d}`, limit: LIMITS.globalDay, ttl: 2 * DAY, reason: 'EcoAudit has hit its daily AI limit. Try again tomorrow.' },
  ];

  const taken = [];
  for (const b of buckets) {
    const n = await store.incr(b.key, b.ttl);
    taken.push(b.key);
    if (n > b.limit) {
      await Promise.all(taken.map(k => store.decr(k)));
      return { ok: false, reason: b.reason };
    }
  }
  return { ok: true };
}

/** Simple single-bucket limiter for sign-up / sign-in. */
async function takeOne(req, kind) {
  const ip = clientIp(req);
  if (kind === 'signup') {
    const n = await store.incr(`ea:signup:${ip}:${today()}`, 2 * DAY);
    return n <= LIMITS.signupIpDay;
  }
  if (kind === 'login') {
    const slot = Math.floor(Date.now() / (15 * 60000));
    const n = await store.incr(`ea:login:${ip}:${slot}`, 30 * 60);
    return n <= LIMITS.loginIp15;
  }
  return true;
}

module.exports = { LIMITS, takeAiCall, takeOne, clientIp };
