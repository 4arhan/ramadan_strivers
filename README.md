# 🌙 Ramadan Strivers

**From Muslim to Mu'min** — a free, private, offline-first Ramadan planner & tracker.
Live at **[www.ramadanstrivers.com](https://www.ramadanstrivers.com)**.

- 60+ daily deeds in 7 categories, each backed by a hadith or ayah
- Quran completion tracker, streaks, heatmap, badges, PDF report
- 🧠 Flash Quiz — 63 true/false cards on the hadith & ayat behind every deed
- 🏆 Competition Mode — schools, universities, mosques & communities run a Top-10 prize competition with team leaderboards, QR posters, bulk enrolment and Eid certificates
- ☁️ Accounts & cloud sync, 🔔 push reminders, 📤 share cards, 🕌 prayer times & iftar countdown, 📅 Hijri auto-day, year-round & pre-Ramadan modes, 📓 journal, ✨ AI explanations
- 🌍 10 languages: English, 中文, हिन्दी, Español, Français, العربية, বাংলা, Português, Русский, اردو

All personal data stays on the device (localStorage). Only Competition Mode sends anything to a server — and only a display name and aggregate scores.

## Project layout

| File | Purpose |
|---|---|
| `index.html` | The whole app (markup, styles, logic) |
| `i18n.js` | UI translations for the 10 languages |
| `cloud.js` | Accounts, sync, competitions UI, prayer times, modes, AI helpers |
| `api/` | Vercel serverless functions (Postgres) |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA / app-store packaging |
| `vercel.json` | Rewrites, headers, daily cron |
| `CNAME` | Custom domain for GitHub Pages |

Deploy: the `vercel` branch is Vercel production (full app); `main` is the GitHub Pages static version.

## Cloud features (v7)

The Vercel deployment adds serverless API routes (`api/`) backed by Postgres: accounts with cloud sync, competitions with team leaderboards / bulk enrolment / QR posters / certificates / CSV, share cards with Open Graph images, web push reminders, Friday organiser email digests, AI explanations (scoped to cited texts), prayer times with iftar countdown, Hijri auto-day, year-round and pre-Ramadan modes, a WhatsApp bot, and PWA/store packaging. Everything degrades gracefully: with no database the app is the same offline tracker it always was.

**Setup:** see [SETUP.md](SETUP.md) (one env var per feature). **Privacy:** [PRIVACY.md](PRIVACY.md). **App stores:** [mobile/README.md](mobile/README.md).

## Languages

`i18n.js` holds the UI strings, section titles and all 64 deed labels per language. Hadith notes, explanations, the user guide bodies and quiz questions remain in English (religious texts are left untranslated on purpose — contributions from native speakers with Islamic-studies background are welcome). The app auto-detects the browser language on first launch; users can change it under **More → Settings → Language**. Arabic and Urdu render right-to-left.

To add a language: copy `I18N.en`, translate, add an entry to `LANGS`.

## Feedback

Corrections, suggestions and feedback: m.farhan.bava@gmail.com
