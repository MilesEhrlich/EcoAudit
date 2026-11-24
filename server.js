/**
 * Local development server: serves the static files and sends /api/* and /auth/* to the
 * same handler Vercel uses. On Vercel this file is not used (see vercel.json).
 *
 *   node server.js        → http://localhost:8888
 *
 * Reads .env if present. Without Redis env vars, accounts and usage counters live in memory.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

(function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq <= 0) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (process.env[key] === undefined || process.env[key] === '') process.env[key] = val;
    }
  } catch { /* ignore */ }
})();

const { handle } = require('./lib/handler');
const { hasRedis } = require('./lib/store');

const PORT = parseInt(process.env.PORT, 10) || 8888;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  const u = new URL(req.url || '/', 'http://localhost');
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/auth/') || req.method !== 'GET') {
    handle(req, res);
    return;
  }
  let rel = u.pathname === '/' ? 'landing.html' : u.pathname.replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, decodeURIComponent(rel));
  if (!filePath.startsWith(path.resolve(ROOT) + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`EcoAudit dev server at http://localhost:${PORT}`);
  console.log(`Storage: ${hasRedis ? 'Upstash Redis' : 'in-memory (resets on restart)'}`);
  if (!process.env.ANTHROPIC_API_KEY) console.log('ANTHROPIC_API_KEY not set: AI features will return an error.');
});
