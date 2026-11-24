# EcoAudit

Sustainability audits for brands and products. 1st place, Environmental Track, RamHack.
Live at **https://ecoaudit.miles-ehrlich.com**.

## Run locally

```bash
cp .env.example .env   # add ANTHROPIC_API_KEY
node server.js         # http://localhost:8888
```

Without Redis env vars, accounts and usage counters are kept in memory and reset on restart.

## Deploy (Vercel)

1. Import this repo in Vercel (framework preset: **Other**, no build command).
2. **Storage → Upstash Redis → connect to this project.** Accounts and usage limits are stored there.
3. **Settings → Environment Variables:** `ANTHROPIC_API_KEY` (required), and optionally
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for "Continue with Google" and Gmail import. Redeploy.
   In Google Cloud, the OAuth client needs both redirect URIs: `/auth/google/login` (sign-in) and
   `/auth/google/callback` (Gmail).
4. **Settings → Domains:** add `ecoaudit.miles-ehrlich.com`.

`vercel.json` sends `/api/*` and `/auth/*` to one function (`api/index.js` → `lib/handler.js`);
everything else is served as static files.

## Usage limits

AI requests require a signed-in account and are capped per account, per IP, and site-wide
per day (see `lib/limits.js`; override with the `AI_LIMIT_*` env vars). The server always uses
`AI_MODEL` (default `claude-sonnet-4-6`) and caps `max_tokens`, whatever the browser sends.
Also set a monthly spend limit in the Anthropic Console as a final backstop.
