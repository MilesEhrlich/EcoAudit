<p align="center">
  <img src="assets/logo.png" alt="EcoAudit logo" width="96" />
</p>

<h1 align="center">EcoAudit</h1>

<p align="center">
  Sustainability grades for the brands and products you buy.<br />
  <strong>1st Place, Environmental Track · RamHack 2024, Fordham University</strong>
</p>

<p align="center">
  <a href="https://ecoaudit.miles-ehrlich.com"><strong>ecoaudit.miles-ehrlich.com</strong></a>
</p>

---

## Overview

EcoAudit grades brands and products from A to F across five sustainability categories and flags marketing claims that don't hold up. Users can check a product three ways:

- **Scan it.** Point a phone or laptop camera at a product. Claude Vision identifies it, the user confirms the match, and EcoAudit returns its grade with the reasoning behind it.
- **Search a brand.** See category scores, verified claims, red flags, and lower-impact alternatives.
- **Import receipts.** Upload receipts or connect Gmail (read-only) to add past purchases. The dashboard estimates the user's footprint, where products were made, and shipping emissions.

## How scores work

Each brand receives a 0–100 score in five categories: **climate**, **supply chain**, **labour**, **materials**, and **packaging**. The overall score is their average, mapped to a letter grade (A 80–100, B 58–79, C 35–57, D 10–34, F 0–9, with plus and minus grades within each band).

Every result is labelled with its source:

| Label | Meaning |
| --- | --- |
| **Hand-checked** | Brands researched by hand from B Lab, Good On You, CDP, SBTi, MSCI and company sustainability reports. Each finding cites its source. |
| **AI estimate** | Brands not yet in the database. Claude estimates a score from public information; these results are a starting point, not a verdict. |

Greenwashing detection looks for claims without evidence behind them, such as "eco-friendly", offset-based "carbon neutral", "conscious" capsule collections, and unquantified recycled-content claims.

## Tech stack

| Layer | Technology |
| --- | --- |
| Front end | HTML, CSS, vanilla JavaScript, Canvas API, Leaflet.js |
| Back end | Node.js (no framework), one Vercel serverless function |
| AI | Anthropic Claude (Messages API, vision) |
| Data | Upstash Redis (accounts, sessions, usage counters) |
| Auth | Email and password (scrypt) and Google sign-in (OpenID Connect) |
| Integrations | Gmail API (read-only, optional), OpenStreetMap Nominatim |
| Hosting | Vercel |

## Architecture

```
Browser ──► Static pages (landing.html, index.html, app.js, styles.css)
   │
   └─► /api/* and /auth/*  ──► api/index.js ──► lib/handler.js
                                                  ├── lib/session.js   signed session cookies, password hashing
                                                  ├── lib/limits.js    per-account, per-IP and site-wide AI limits
                                                  ├── lib/store.js     Upstash Redis (in-memory locally)
                                                  └── Anthropic · Google OAuth · Gmail
```

The browser never holds an API key. All AI requests go through the server, which signs users in, fixes the model, caps response length, and enforces usage limits before calling Anthropic.

## Security and usage limits

- **Accounts:** scrypt password hashes; HttpOnly, signed, `SameSite=Lax` session cookies; rate-limited sign-up and sign-in.
- **AI access:** signed-in users only. Requests are capped per account, per IP address, per minute, and site-wide per day (`lib/limits.js`, configurable through `AI_LIMIT_*` variables).
- **Request hardening:** the server sets the model and caps `max_tokens` and request size regardless of what the browser sends.
- **Output handling:** AI-generated text, including text derived from imported emails, is escaped before rendering.
- **Privacy:** see the [privacy policy](https://ecoaudit.miles-ehrlich.com/privacy.html). Gmail access is read-only, limited to receipts the user selects, and email content is never stored.

## Getting started

**Requirements:** Node.js 20 or later and an Anthropic API key.

```bash
git clone https://github.com/MilesEhrlich/EcoAudit.git
cd EcoAudit
cp .env.example .env    # add ANTHROPIC_API_KEY
node server.js          # http://localhost:8888
```

Without Redis credentials, accounts and usage counters are kept in memory and reset when the server restarts. No `npm install` is needed: the server uses only Node.js built-ins.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes | Product identification and audits |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | In production | Accounts and usage limits (set automatically by Vercel's Upstash integration) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional | Google sign-in and Gmail import |
| `SESSION_SECRET` | Optional | Signs session cookies (derived from the Anthropic key if unset) |
| `AI_MODEL`, `AI_LIMIT_*` | Optional | Model and usage-limit overrides |

See [`.env.example`](.env.example) for every option and its default.

## Deployment

EcoAudit is deployed on Vercel:

1. Import the repository (framework preset **Other**, no build command).
2. Add **Upstash for Redis** from the Storage tab and connect it to the project.
3. Set `ANTHROPIC_API_KEY`, and optionally the Google OAuth variables, then redeploy.
4. For Google sign-in, register both redirect URIs on the OAuth client: `/auth/google/login` (sign-in) and `/auth/google/callback` (Gmail import).

`vercel.json` routes `/api/*` and `/auth/*` to the serverless function and serves everything else as static files.

## Project structure

```
api/index.js        Vercel function entry point
lib/                Request handler, sessions, usage limits, storage
shared/             Hand-checked brand database (used by the app and the server)
assets/             Logo and icons
extension/          Chrome extension (in development, not yet published)
landing.html        Public landing page
index.html, app.js  The signed-in app
privacy.html        Privacy policy
server.js           Local development server
```

## Contributors

- **Miles Ehrlich**
- **Kaori Garcia**
- **Riccardo Membreno**
