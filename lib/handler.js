/**
 * EcoAudit API. One request handler used by both the Vercel function (api/index.js)
 * and the local dev server (server.js).
 *
 * Abuse protection:
 *  - /api/claude needs a signed-in session, only allows the configured model, caps
 *    max_tokens and request size, and counts against the limits in lib/limits.js.
 *  - Passwords are hashed (scrypt); sign-in sets an HttpOnly signed session cookie.
 *  - Sign-up and sign-in are rate limited per IP.
 */
const https = require('https');
const crypto = require('crypto');
const store = require('./store');
const limits = require('./limits');
const { sign, verify, sessionCookie, clearSessionCookie, sessionEmail, hashPassword, checkPassword } = require('./session');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
/** Every AI call uses this model, whatever the browser asks for. */
const AI_MODEL = process.env.AI_MODEL || 'claude-sonnet-4-6';
const AI_MAX_TOKENS = 4096;
const MAX_BODY_BYTES = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB; images are base64.

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'].join(' ');

function siteOrigin(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host || 'localhost'}`;
}

function gmailRedirectUri(req) {
  return process.env.GMAIL_OAUTH_REDIRECT_URI || `${siteOrigin(req)}/auth/google/callback`;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function json(res, status, obj, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders });
  res.end(JSON.stringify(obj));
}

function htmlPage(res, body) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Gmail</title></head><body>${body}</body></html>`);
}

/** Read the request body as a string (Vercel may have parsed it already). */
function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') return Promise.resolve(req.body);
    if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString('utf8'));
    return Promise.resolve(JSON.stringify(req.body));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function proxyToAnthropic(body) {
  if (!ANTHROPIC_API_KEY) {
    return Promise.resolve({ status: 503, body: JSON.stringify({ error: { message: 'AI is not configured on this server.' } }) });
  }
  return new Promise((resolve, reject) => {
    const data = Buffer.from(body);
    const apiReq = https.request({
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': data.length,
      },
    }, apiRes => {
      const chunks = [];
      apiRes.on('data', c => chunks.push(c));
      apiRes.on('end', () => resolve({ status: apiRes.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    apiReq.on('error', reject);
    apiReq.write(data);
    apiReq.end();
  });
}

/**
 * Rebuild the browser's request with only the fields the app uses, so the proxy can't be
 * used for other models, huge outputs, tools, or long conversations.
 */
function sanitizeClaudeRequest(raw) {
  const p = JSON.parse(raw || '{}');
  if (!Array.isArray(p.messages) || p.messages.length === 0 || p.messages.length > 12) {
    throw Object.assign(new Error('messages must be a non-empty array (max 12)'), { status: 400 });
  }
  const out = {
    model: AI_MODEL,
    max_tokens: Math.max(1, Math.min(Number(p.max_tokens) || 1024, AI_MAX_TOKENS)),
    messages: p.messages,
  };
  if (typeof p.system === 'string') out.system = p.system.slice(0, 20000);
  if (typeof p.temperature === 'number') out.temperature = Math.max(0, Math.min(1, p.temperature));
  return JSON.stringify(out);
}

const DEFAULT_GMAIL_QUERY =
  'subject:("order confirmation" OR "your order" OR "order receipt" OR "shipping confirmation" OR "your purchase" OR "thank you for your order" OR "your receipt" OR "invoice for your" OR "has shipped") newer_than:90d';

function httpsRequestRaw(method, hostname, pathAndQuery, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyBuf = body ? Buffer.from(body, 'utf8') : null;
    const opts = {
      hostname,
      path: pathAndQuery,
      method,
      headers: {
        ...headers,
        ...(bodyBuf ? { 'Content-Length': bodyBuf.length } : {}),
      },
    };
    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, body: buf.toString('utf8') });
      });
    });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

async function postFormUrlEncoded(hostname, path, params) {
  const body = new URLSearchParams(params).toString();
  return httpsRequestRaw('POST', hostname, path, {
    'Content-Type': 'application/x-www-form-urlencoded',
  }, body);
}

async function exchangeCodeForTokens(code, redirectUri) {
  const { status, body } = await postFormUrlEncoded('oauth2.googleapis.com', '/token', {
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }
  return { status, json, raw: body };
}

async function refreshAccessToken(refreshToken) {
  const { status, body } = await postFormUrlEncoded('oauth2.googleapis.com', '/token', {
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }
  return { status, json };
}

async function gmailApiGet(accessToken, pathAndQuery) {
  return httpsRequestRaw('GET', 'gmail.googleapis.com', pathAndQuery, {
    Authorization: `Bearer ${accessToken}`,
  });
}

function headerMap(payload) {
  const h = {};
  if (payload && Array.isArray(payload.headers)) {
    for (const { name, value } of payload.headers) {
      if (name && value) h[name.toLowerCase()] = value;
    }
  }
  return h;
}

function extractPlainFromPayload(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    try {
      return Buffer.from(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    } catch {
      return '';
    }
  }
  if (payload.parts) {
    for (const p of payload.parts) {
      const t = extractPlainFromPayload(p);
      if (t && t.trim()) return t;
    }
  }
  return '';
}

const { brandData: BRAND_DB, getBrandKey } = require('../shared/brand-data.js');

/* ── Grade from score ── */
function calcGrade(score) {
  if (score >= 90) return { grade: 'A',  cls: 'grade-a', label: 'Excellent' };
  if (score >= 80) return { grade: 'A-', cls: 'grade-a', label: 'Very Good' };
  if (score >= 73) return { grade: 'B+', cls: 'grade-b', label: 'Good' };
  if (score >= 65) return { grade: 'B',  cls: 'grade-b', label: 'Above Average' };
  if (score >= 58) return { grade: 'B-', cls: 'grade-b', label: 'Above Average' };
  if (score >= 50) return { grade: 'C+', cls: 'grade-c', label: 'Moderate Risk' };
  if (score >= 42) return { grade: 'C',  cls: 'grade-c', label: 'Moderate Risk' };
  if (score >= 35) return { grade: 'C-', cls: 'grade-c', label: 'Below Average' };
  if (score >= 28) return { grade: 'D+', cls: 'grade-d', label: 'High Risk' };
  if (score >= 20) return { grade: 'D',  cls: 'grade-d', label: 'High Risk' };
  if (score >= 10) return { grade: 'D-', cls: 'grade-d', label: 'Very High Risk' };
  return                   { grade: 'F',  cls: 'grade-d', label: 'Very High Risk' };
}

/* ── Generic alternatives by category ── */
const CATEGORY_ALTERNATIVES = {
  'Fashion': [
    { emoji: '🛍', name: 'Buffalo Exchange / thrift shop', save: 'Save 50-70%', whyBetter: 'Second-hand = zero new production' },
    { emoji: '🌐', name: 'ThredUP / Depop', save: 'Save 40-60%', whyBetter: 'Online thrift marketplace' },
    { emoji: '🌿', name: 'Pact Organic — A rated', save: 'Similar price', whyBetter: 'Fair Trade + GOTS certified' },
  ],
  'Fast Fashion': [
    { emoji: '🛍', name: 'Buffalo Exchange — local thrift', save: 'Save 50-70%', whyBetter: 'Second-hand = zero new production' },
    { emoji: '🌐', name: 'ThredUP / Vinted / Depop', save: 'Save 40-60%', whyBetter: 'Online resale marketplace' },
    { emoji: '🌿', name: 'Eileen Fisher — A- rated, B Corp', save: '+$20-40', whyBetter: 'SBTi exceeded, full transparency' },
  ],
  'Footwear / Apparel': [
    { emoji: '🛍', name: 'Local consignment store', save: 'Save 50%', whyBetter: 'Second-hand = zero production impact' },
    { emoji: '🌐', name: 'StockX / Poshmark — verified used', save: 'Save 30-50%', whyBetter: 'Authenticated pre-owned' },
    { emoji: '🌿', name: 'Allbirds — A- rated, B Corp', save: 'Similar price', whyBetter: 'Carbon-labelled, certified materials' },
  ],
  'Consumer Electronics': [
    { emoji: '♻️', name: 'Refurbished from manufacturer', save: 'Save 20-40%', whyBetter: 'Same warranty, no new production' },
    { emoji: '🌐', name: 'Back Market — certified refurbished', save: 'Save 30-50%', whyBetter: 'Quality-graded, 1-year warranty' },
    { emoji: '🌿', name: 'Fairphone — A rated, EcoVadis Platinum', save: 'Similar price', whyBetter: 'Repairability 10/10, living wages' },
  ],
  'default': [
    { emoji: '🏪', name: 'Local stores near you', save: 'No shipping emissions', whyBetter: 'Support local economy' },
    { emoji: '🌐', name: 'eBay / marketplace — used or refurbished', save: 'Save 30-50%', whyBetter: 'Extends product lifecycle' },
    { emoji: '🌿', name: 'B Corp alternatives — search bcorporation.net', save: 'Varies', whyBetter: 'Verified social & environmental impact' },
  ],
};

/** postMessage the OAuth result to the page that opened the popup (same origin only), then close. */
function oauthPopup(res, origin, message) {
  const safe = JSON.stringify({ type: 'ecoaudit-gmail-oauth', ...message }).replace(/</g, '\\u003c');
  htmlPage(res, `<script id="ecoaudit-oauth" type="application/json">${safe}</script>
<script>
(function(){
  var p = JSON.parse(document.getElementById('ecoaudit-oauth').textContent);
  if (window.opener) window.opener.postMessage(p, ${JSON.stringify(origin)});
  window.close();
})();
</script><p style="font-family:sans-serif">You can close this window.</p>`);
}

async function handle(req, res) {
  const u = new URL(req.url || '/', 'http://localhost');
  // vercel.json rewrites everything to /api/index?route=<original path>.
  if (u.pathname === '/api/index' || u.pathname === '/api/index.js') {
    u.pathname = u.searchParams.get('route') || '/';
    u.searchParams.delete('route');
  }

  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
      res.end();
      return;
    }

    /* ── Gmail OAuth callback (popup) ── */
    if (req.method === 'GET' && u.pathname === '/auth/google/callback') {
      const origin = siteOrigin(req);
      const code = u.searchParams.get('code');
      const err = u.searchParams.get('error');
      const st = verify(u.searchParams.get('state') || '');
      if (err || !code || !st || st.kind !== 'gmail-oauth') {
        oauthPopup(res, origin, { error: err || 'invalid_state' });
        return;
      }
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        oauthPopup(res, origin, { error: 'server_missing_google_oauth_env' });
        return;
      }
      const { status, json: tok } = await exchangeCodeForTokens(code, gmailRedirectUri(req));
      if (status !== 200 || !tok || !tok.access_token) {
        oauthPopup(res, origin, { error: 'token_exchange_failed', detail: (tok && tok.error) || '' });
        return;
      }
      oauthPopup(res, origin, {
        access_token: tok.access_token,
        refresh_token: tok.refresh_token || null,
        expires_in: tok.expires_in || null,
        token_type: tok.token_type || 'Bearer',
      });
      return;
    }

    /* ── Start Gmail OAuth (returns URL to open in popup) ── */
    if (req.method === 'POST' && u.pathname === '/api/gmail/oauth-url') {
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        json(res, 503, {
          error: 'not_configured',
          hint: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (Gmail needs OAuth, not an API key alone).',
        });
        return;
      }
      const state = sign({ kind: 'gmail-oauth', n: crypto.randomBytes(12).toString('hex') }, 15 * 60);
      const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      auth.searchParams.set('client_id', GOOGLE_CLIENT_ID);
      auth.searchParams.set('redirect_uri', gmailRedirectUri(req));
      auth.searchParams.set('response_type', 'code');
      auth.searchParams.set('scope', GMAIL_SCOPES);
      auth.searchParams.set('access_type', 'offline');
      auth.searchParams.set('prompt', 'consent');
      auth.searchParams.set('state', state);
      json(res, 200, { url: auth.toString() });
      return;
    }

    /* ── List likely receipt messages ── */
    if (req.method === 'POST' && u.pathname === '/api/gmail/list') {
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        json(res, 503, { error: 'not_configured' });
        return;
      }
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        json(res, 400, { error: 'invalid_json' });
        return;
      }
      const refreshToken = body.refreshToken;
      if (!refreshToken) {
        json(res, 400, { error: 'missing_refreshToken' });
        return;
      }

      const { status, json: tok } = await refreshAccessToken(refreshToken);
      if (status !== 200 || !tok || !tok.access_token) {
        json(res, 401, { error: 'refresh_failed', detail: tok });
        return;
      }

      const accessToken = tok.access_token;
      const q = typeof body.query === 'string' && body.query.trim() ? body.query.trim() : DEFAULT_GMAIL_QUERY;
      const maxResults = Math.min(50, Math.max(1, Number(body.maxResults) || 20));
      const pageToken = typeof body.pageToken === 'string' ? body.pageToken : '';

      const listPath =
        `/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(q)}` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');

      const listRes = await gmailApiGet(accessToken, listPath);
      let listJson;
      try {
        listJson = JSON.parse(listRes.body);
      } catch {
        listJson = null;
      }
      if (listRes.status !== 200 || !listJson) {
        json(res, listRes.status || 502, { error: 'gmail_list_failed', detail: listJson || listRes.body });
        return;
      }

      const ids = (listJson.messages || []).map(m => m.id).filter(Boolean);
      const summaries = [];
      for (const id of ids) {
        const metaPath = `/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`;
        const mr = await gmailApiGet(accessToken, metaPath);
        let mj;
        try {
          mj = JSON.parse(mr.body);
        } catch {
          mj = null;
        }
        if (mr.status !== 200 || !mj) continue;
        const hm = headerMap(mj.payload);
        summaries.push({
          id: mj.id,
          threadId: mj.threadId,
          snippet: mj.snippet || '',
          subject: hm.subject || '(no subject)',
          from: hm.from || '—',
          date: hm.date || '—',
        });
      }

      json(res, 200, {
        messages: summaries,
        nextPageToken: listJson.nextPageToken || null,
        resultSizeEstimate: listJson.resultSizeEstimate,
      });
      return;
    }

    /* ── Fetch one message body (plain text) for AI import ── */
    if (req.method === 'POST' && u.pathname === '/api/gmail/message') {
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        json(res, 503, { error: 'not_configured' });
        return;
      }
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        json(res, 400, { error: 'invalid_json' });
        return;
      }
      const refreshToken = body.refreshToken;
      const messageId = body.messageId;
      if (!refreshToken || !messageId) {
        json(res, 400, { error: 'missing_refreshToken_or_messageId' });
        return;
      }

      const { status, json: tok } = await refreshAccessToken(refreshToken);
      if (status !== 200 || !tok || !tok.access_token) {
        json(res, 401, { error: 'refresh_failed' });
        return;
      }

      const accessToken = tok.access_token;
      const msgPath = `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`;
      const mr = await gmailApiGet(accessToken, msgPath);
      let mj;
      try {
        mj = JSON.parse(mr.body);
      } catch {
        mj = null;
      }
      if (mr.status !== 200 || !mj) {
        json(res, mr.status || 502, { error: 'gmail_get_failed', detail: mj || mr.body });
        return;
      }

      const hm = headerMap(mj.payload);
      let plain = extractPlainFromPayload(mj.payload);
      if (!plain || plain.trim().length < 20) {
        plain = mj.snippet || plain || '';
      }

      json(res, 200, {
        id: mj.id,
        subject: hm.subject || '',
        from: hm.from || '',
        date: hm.date || '',
        bodyText: plain.slice(0, 120000),
      });
      return;
    }

    /* ═══ Extension Audit API ═══ */
    if (req.method === 'POST' && u.pathname === '/api/extension/audit') {
      try {
        const bodyStr = await readBody(req);
        const body = JSON.parse(bodyStr || '{}');
        const product  = body.product || '';
        const productBrand = body.productBrand || body.brand || '';
        const retailer = (body.retailer || '').replace('www.', '');
        const brandConfidence = body.brandConfidence || 'low';
        const url      = body.url || '';
        const materials = body.materials || '';
        const claims   = body.claims || '';
        const category = body.category || '';

        /* 1. Try product brand match */
        let brandKey = getBrandKey(productBrand);

        /* 2. Try retailer match if we don't have a high-confidence product brand */
        let usedFallback = false;
        if (!brandKey && brandConfidence !== 'high') {
          brandKey = getBrandKey(retailer);
          usedFallback = true;
        }

        /* 3. Try product name match */
        if (!brandKey) brandKey = getBrandKey(product);

        /* 4. If known brand — return curated data */
        if (brandKey && BRAND_DB[brandKey]) {
          const b = BRAND_DB[brandKey];
          
          // Compute avg score dynamically since shared module uses metrics vs absolute top-level
          const avgScore = Math.round(b.metrics.reduce((acc, m) => acc + (m.score || 0), 0) / (b.metrics.length || 1));

          json(res, 200, {
            productName: product || b.name + ' Product',
            brand:       b.name,
            retailer,
            score:       avgScore,
            letterGrade: b.grade,
            gradeClass:  b.gradeClass,
            gradeLabel:  b.type,
            risk:        b.type,
            category:    b.type || category,
            metrics:     b.metrics,
            claims:      b.claims,
            summary:     `${b.name} — ${b.type}`,
            positives:   b.claims.filter(c => c.status === 'verified').map(c => c.text).join('; '),
            concerns:    b.claims.filter(c => c.status === 'negative').map(c => c.text).join('; '),
            materials:   materials || '',
            confidence:  usedFallback ? 'low' : 'high',
            source:      'EcoAudit brand database',
            createdAt:   new Date().toISOString(),
          });
          return;
        }

        /* 4. Try Claude AI audit for unknown brands (counts against the usage limits) */
        const aiGate = ANTHROPIC_API_KEY ? await limits.takeAiCall(req, sessionEmail(req)) : { ok: false };
        try {
          if (!aiGate.ok) throw new Error(aiGate.reason || "AI not configured");
          const prompt = `You are an ESG sustainability analyst. Audit the product/brand and return JSON. Product: "${product}", Brand: "${productBrand}", Retailer: "${retailer}", Materials: "${materials}", Claims on page: "${claims}". Return this exact JSON structure:
{
  "productName": "Product name",
  "brand": "Brand name",
  "score": 0-100,
  "letterGrade": "A/A-/B+/B/B-/C+/C/C-/D+/D/D-/F",
  "gradeLabel": "short risk label",
  "category": "product category",
  "risk": "1-sentence risk summary",
  "summary": "2-sentence sustainability summary",
  "positives": "verified good practices",
  "concerns": "key concerns",
  "metrics": [{"name":"Carbon & Climate","score":0-100,"color":"hex"},{"name":"Supply Chain","score":0-100,"color":"hex"},{"name":"Labour Rights","score":0-100,"color":"hex"},{"name":"Materials","score":0-100,"color":"hex"},{"name":"Packaging","score":0-100,"color":"hex"}],
  "claims": [{"status":"verified/partial/negative","text":"claim text"}]
}
Use green (#52B788, #74C69D, #A5D6A7) for scores >70, yellow (#FFF176, #FFCC80) for 40-70, red (#EF9A9A) for <40. Use real ESG data. Return ONLY valid JSON.`;

          const aiResult = await proxyToAnthropic(JSON.stringify({
            model: AI_MODEL,
            max_tokens: 1500,
            messages: [{ role: 'user', content: prompt }],
          }));

          if (aiResult.status === 200) {
            const aiJson = JSON.parse(aiResult.body);
            const text = aiJson.content?.[0]?.text || '';
            const match = text.match(/\{[\s\S]*\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              parsed.retailer = retailer;
              parsed.confidence = 'ai';
              parsed.source = 'Claude AI analysis';
              parsed.createdAt = new Date().toISOString();
              parsed.gradeClass = calcGrade(parsed.score || 50).cls;
              json(res, 200, parsed);
              return;
            }
          }
        } catch (aiErr) {
          console.log('[EcoAudit] AI audit failed, using heuristic:', aiErr.message);
        }

        /* 5. Heuristic fallback for completely unknown products */
        let hScore = 50;
        const lowerClaims = (claims + ' ' + materials).toLowerCase();
        if (lowerClaims.includes('organic') || lowerClaims.includes('fair trade') || lowerClaims.includes('b corp')) hScore += 15;
        if (lowerClaims.includes('recycled')) hScore += 10;
        if (lowerClaims.includes('sustainable') || lowerClaims.includes('eco')) hScore += 5;
        if (lowerClaims.includes('carbon neutral')) hScore += 8;
        // Penalize known fast-fashion pattern
        if (['hm.com','zara.com','shein.com','boohoo.com','asos.com','primark.com','fashionnova.com'].includes(retailer)) hScore -= 20;
        hScore = Math.max(5, Math.min(95, hScore));
        const hg = calcGrade(hScore);

        json(res, 200, {
          productName: product || 'Product',
          brand: productBrand || retailer,
          retailer,
          score: hScore,
          letterGrade: hg.grade,
          gradeClass: hg.cls,
          gradeLabel: hg.label,
          risk: hg.label,
          category: category || 'Unknown',
          metrics: [
            { name: 'Carbon & Climate', score: hScore, color: hScore >= 65 ? '#A5D6A7' : hScore >= 40 ? '#FFF176' : '#EF9A9A' },
            { name: 'Supply Chain', score: Math.max(5, hScore - 5), color: hScore >= 65 ? '#A5D6A7' : hScore >= 40 ? '#FFF176' : '#EF9A9A' },
            { name: 'Labour Rights', score: Math.max(5, hScore - 8), color: hScore >= 65 ? '#A5D6A7' : hScore >= 40 ? '#FFF176' : '#EF9A9A' },
            { name: 'Materials', score: Math.max(5, hScore + 2), color: hScore >= 65 ? '#A5D6A7' : hScore >= 40 ? '#FFF176' : '#EF9A9A' },
          ],
          claims: [{ status: 'partial', text: `Limited data available for "${productBrand || retailer}". Score based on page signals.` }],
          summary: `Heuristic score based on on-page signals for ${productBrand || retailer}.`,
          positives: '',
          concerns: '',
          materials: materials || '',
          confidence: 'low',
          source: 'EcoAudit heuristic analysis',
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        json(res, 500, { error: err.message });
      }
      return;
    }

    /* ═══ Extension Alternatives API ═══ */
    if (req.method === 'POST' && u.pathname === '/api/extension/alternatives') {
      try {
        const bodyStr = await readBody(req);
        const body = JSON.parse(bodyStr || '{}');
        const category = body.category || '';
        const brand    = body.brand || '';
        const score    = body.score || 50;

        /* Only suggest alternatives for scores below B (65) */
        if (score >= 65) {
          json(res, 200, { alternatives: [] });
          return;
        }

        /* Look for category-matched alternatives */
        let alts = CATEGORY_ALTERNATIVES[category] || null;
        if (!alts) {
          // Try partial category match
          for (const [key, val] of Object.entries(CATEGORY_ALTERNATIVES)) {
            if (key !== 'default' && category.toLowerCase().includes(key.toLowerCase())) {
              alts = val;
              break;
            }
          }
        }
        if (!alts) alts = CATEGORY_ALTERNATIVES['default'];

        json(res, 200, { alternatives: alts });
      } catch (err) {
        json(res, 500, { error: err.message });
      }
      return;
    }

    /* ═══ Auth API ═══ */
    if (process.env.VERCEL && !store.hasRedis && (u.pathname === "/api/signup" || u.pathname === "/api/login")) {
      json(res, 503, { error: "Accounts are not set up yet: connect Upstash Redis in the Vercel project (Storage tab)." });
      return;
    }

    if (req.method === 'POST' && u.pathname === '/api/signup') {
      if (!(await limits.takeOne(req, 'signup'))) {
        json(res, 429, { error: 'Too many new accounts from this network today. Try again tomorrow.' });
        return;
      }
      let body;
      try { body = JSON.parse(await readBody(req) || '{}'); } catch { json(res, 400, { error: 'Invalid request' }); return; }
      const name = String(body.name || '').trim().slice(0, 80);
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200 || password.length < 6 || password.length > 200) {
        json(res, 400, { error: 'Missing required fields or password too short' });
        return;
      }
      const user = { name, email, passwordHash: hashPassword(password), joined: new Date().toISOString(), provider: 'email' };
      if (!(await store.setJSONIfAbsent(`ea:user:${email}`, user))) {
        json(res, 409, { error: 'Account already exists' });
        return;
      }
      json(res, 201, { user: { name, email, joined: user.joined, provider: 'email' } },
        { 'Set-Cookie': sessionCookie(req, email) });
      return;
    }

    if (req.method === 'POST' && u.pathname === '/api/login') {
      if (!(await limits.takeOne(req, 'login'))) {
        json(res, 429, { error: 'Too many sign-in attempts. Wait 15 minutes and try again.' });
        return;
      }
      let body;
      try { body = JSON.parse(await readBody(req) || '{}'); } catch { json(res, 400, { error: 'Invalid request' }); return; }
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      if (!email || !password) {
        json(res, 400, { error: 'Missing email or password' });
        return;
      }
      const user = await store.getJSON(`ea:user:${email}`);
      if (!user || !checkPassword(password, user.passwordHash)) {
        json(res, 401, { error: 'Invalid credentials' });
        return;
      }
      json(res, 200, { user: { name: user.name, email: user.email, joined: user.joined, provider: user.provider } },
        { 'Set-Cookie': sessionCookie(req, email) });
      return;
    }

    if (req.method === 'POST' && u.pathname === '/api/logout') {
      json(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie(req) });
      return;
    }

    if (req.method === 'GET' && u.pathname === '/api/me') {
      const email = sessionEmail(req);
      json(res, 200, { signedIn: Boolean(email), email, limits: { perDay: limits.LIMITS.userDay } });
      return;
    }

    /* ── Claude API proxy (signed-in users only, rate limited) ── */
    if (req.method === 'POST' && u.pathname === '/api/claude') {
      const email = sessionEmail(req);
      if (!email) {
        json(res, 401, { error: { type: 'auth', message: 'Please sign in again to use AI features.' } });
        return;
      }
      const raw = await readBody(req);
      if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
        json(res, 413, { error: { message: 'Request too large' } });
        return;
      }
      const body = sanitizeClaudeRequest(raw);
      const gate = await limits.takeAiCall(req, email);
      if (!gate.ok) {
        json(res, 429, { error: { type: 'rate_limit', message: gate.reason } });
        return;
      }
      const result = await proxyToAnthropic(body);
      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(result.body);
      return;
    }

    json(res, 404, { error: 'Not found' });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    if (status === 500) console.error('[EcoAudit]', err);
    if (!res.headersSent) json(res, status, { error: { message: status === 500 ? 'Server error' : err.message } });
  }
}

module.exports = { handle };
