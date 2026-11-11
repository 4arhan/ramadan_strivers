# Setup — Ramadan Strivers v8 on Vercel

The app is a static front-end (`index.html`, `css/`, `js/` modules, generated `js/content.js` and `js/lang/*.js`) plus one serverless function, `api/router.js`, that serves every route in `api/_routes/`.
It works with **no configuration at all** (tracker, quiz, prayer times, languages, modes). Each cloud
feature switches itself on when its environment variable exists. Set these in **Vercel → Project → Settings → Environment Variables**, then redeploy.

| Feature | What to set | Where to get it |
|---|---|---|
| Accounts, cloud sync, competitions, buddies, organiser insights, share links | `DATABASE_URL` | Vercel → **Storage → Create Database → Postgres (Neon)** → Connect to project (it adds `DATABASE_URL`/`POSTGRES_URL` automatically). Tables are created on first request. |
| Session signing | `AUTH_SECRET` | Any long random string (`openssl rand -hex 32`). Falls back to a hash of the DB URL if unset. |
| Magic-link sign-in, Friday organiser digests | `RESEND_API_KEY`, optional `EMAIL_FROM` | resend.com (free tier). Verify your sending domain, e.g. `Ramadan Strivers <hello@ramadanstrivers.com>`. |
| Web push reminders | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `npx web-push generate-vapid-keys`. Subject is `mailto:you@example.com`. |
| Daily cron (push + digests) | `CRON_SECRET` (recommended) | Any random string; Vercel sends it automatically to `/api/cron/daily` (schedule in `vercel.json`, 15:00 UTC daily; Hobby plan allows one run per day). |
| AI explain / reflection prompts / quiz levels | `ANTHROPIC_API_KEY`, optional `AI_MODEL` (default `claude-opus-5-5`; set `claude-sonnet-5-5` to lower cost) | console.anthropic.com. Explanations are cached per deed/language/level, so cost is minimal. |
| WhatsApp bot | Twilio WhatsApp sender → webhook `https://<your-domain>/api/whatsapp` (POST) | twilio.com. Commands: `JOIN CODE Name`, `PAGES n`, `STATUS`, `HADITH`. |
| Canonical URL in emails/share links | `APP_URL` (e.g. `https://www.ramadanstrivers.com`) | Optional; defaults to the request host. |
| Hijri offset for the server cron | `HIJRI_OFFSET` (`-1`, `0`, `1`) | Optional. |

Check status any time at `/api/health` — it reports which features are on.

## Deploy
- Production branch on Vercel: **`product`** (Settings → Git → Production Branch). `main` is the development branch: every push to it builds a preview deployment.
- `product` is published in two places: Vercel production (the full app with the API) and GitHub Pages at `www.ramadanstrivers.com` (static files only, see the `CNAME` file). On GitHub Pages there is no `/api`, so accounts, competitions, buddies, insights and push stay switched off there until the domain is pointed at Vercel (see "Re-pointing the domain later").
- Every push to `product` redeploys production. `vercel.json` carries rewrites (`/s/:id` share pages, `/poster/:code`, `/join/:code`), cache headers and the cron.
- The repo has no build step at deploy time (generated files are committed); the Node 22 function is bundled by Vercel. `content/`, `i18n-src/`, `scripts/` and Markdown files are not uploaded (`.vercelignore`).
- After editing `content/*.json` run `npm run build:content`; after editing translations run `npm run build:i18n` and `npm run check:i18n`, then commit the generated files.

## Re-pointing the domain later
Nothing in the code depends on the host name — share links, invitation links, posters and the WhatsApp reply all use the request's origin (`APP_URL` if set). To move `www.ramadanstrivers.com`:
1. Vercel → Project → Settings → **Domains** → add `www.ramadanstrivers.com` and `ramadanstrivers.com`.
2. At your DNS provider: `www` CNAME → `cname.vercel-dns.com`; apex A record → `76.76.21.21` (Vercel shows the exact values).
3. Set `APP_URL=https://www.ramadanstrivers.com` and, if you use push/email, re-check `VAPID_SUBJECT` / `EMAIL_FROM`.
4. Remove the `CNAME` file only when GitHub Pages is retired.

## Local development
```bash
npm install
# any Postgres; e.g. a local one:
DATABASE_URL=postgresql://user@localhost:5432/ramadan AUTH_SECRET=dev node scripts/dev-server.js 3000
BASE=http://localhost:3000 node scripts/test-api.js      # end-to-end API tests
```

## Data model (Postgres)
`users`, `magic_links`, `sync_data` (one JSON snapshot per user, merged server-side), `competitions`, `participants`
(per-day points with cap + flags), `push_subs`, `shares`, `ai_cache`. See `api/_lib/db.js`.

## Privacy & children
See `PRIVACY.md`. Participants never need an email; organisers can enable **Participants under 13** which hides social sharing and keeps display names only.
