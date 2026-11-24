/**
 * Signed, stateless tokens: session cookies and OAuth `state` values.
 * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 */
const crypto = require('crypto');

function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  // Fallback so a deploy works with only ANTHROPIC_API_KEY set: derive a key from it.
  // Rotating the Anthropic key then signs everyone out, which is fine for this app.
  if (process.env.ANTHROPIC_API_KEY) {
    return crypto.createHash('sha256').update('ecoaudit-session:' + process.env.ANTHROPIC_API_KEY).digest('hex');
  }
  // Local development without any env: a per-process random key.
  if (!global.__ecoauditDevSecret) global.__ecoauditDevSecret = crypto.randomBytes(32).toString('hex');
  return global.__ecoauditDevSecret;
}

const b64 = buf => Buffer.from(buf).toString('base64url');

function sign(payload, ttlSeconds) {
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const mac = b64(crypto.createHmac('sha256', secret()).update(body).digest());
  return `${body}.${mac}`;
}

function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = b64(crypto.createHmac('sha256', secret()).update(body).digest());
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ── Session cookie ── */
const COOKIE = 'ea_session';
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isSecure(req) {
  return (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function sessionCookie(req, email) {
  const token = sign({ email }, SESSION_TTL);
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL}${isSecure(req) ? '; Secure' : ''}`;
}

function clearSessionCookie(req) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecure(req) ? '; Secure' : ''}`;
}

/** The signed-in user's email, or null. */
function sessionEmail(req) {
  const p = verify(parseCookies(req)[COOKIE]);
  return p && typeof p.email === 'string' ? p.email : null;
}

/* ── Passwords (scrypt) ── */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function checkPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
  const [, saltB64, hashB64] = stored.split('$');
  const expected = Buffer.from(hashB64, 'base64');
  const got = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(got, expected);
}

module.exports = { sign, verify, sessionCookie, clearSessionCookie, sessionEmail, hashPassword, checkPassword };
