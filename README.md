# Ramadan Strivers

**From Muslim to Mu'min.** A free, private, offline-first Ramadan companion for individuals, families, schools,
universities and mosques. Live at [www.ramadanstrivers.com](https://www.ramadanstrivers.com).

## What it does

- **Today:** a daily checklist of deeds in seven groups (salah and dhikr, Quran, character, charity, the last ten
  nights, things to avoid, the Abu Bakr challenge), each backed by a cited hadith or ayah with its authenticity grade,
  a daily hadith, streaks, badges, sisters' mode, a reflection journal and the prayer-time / iftar countdown.
- **Quran tracker:** pages read against the 604-page Madinah mushaf, juz, pace needed for the days left, chart and log.
- **Learn:** 149 true-or-false and 62 multiple-choice questions in ten categories, 100 flashcards in seven decks
  (Ramadan words, duas, verses on fasting, Sunnahs of fasting, Ramadan in history, Quran facts, preparing for
  Ramadan) with spaced repetition, and "Today's 5", a short daily mix with its own streak. Every answer shows its
  source.
- **Ramadan Prep:** a 30-day programme with a readiness self-check, three small actions a day (first salah, then a
  daily connection with the Quran, then fasting practice and habits, then the heart, family and charity), salah and
  Quran check-ins and weekly milestones. In Sha'ban it follows the Hijri date so it ends as Ramadan begins.
- **Competitions:** a school, university, mosque, company or community creates a competition with up to ten prizes,
  enrols participants (join code, QR poster or personal invitation links), and follows live individual and team
  leaderboards. Only a display name and totals are shared. Organisers can set a daily points cap, review flagged
  entries, export CSV and print certificates at Eid.
- **Year-round:** Sunnah fasts (Mondays, Thursdays, the white days), the six days of Shawwal and the first ten days of
  Dhul Hijjah, using the Umm al-Qura Hijri calendar with a one-day moon-sighting adjustment.
- **10 languages:** English, 中文, हिन्दी, Español, Français, العربية, বাংলা, Português, Русский, اردو, with right-to-left
  layout for Arabic and Urdu. The religious content is translated too (see below).
- **Optional cloud features:** accounts with sync, web push reminders, share cards, AI explanations scoped to the
  cited texts, a WhatsApp bot. Everything degrades gracefully: without a server it is the same offline tracker.

All personal data stays on the device (localStorage) unless the person creates an account, joins a competition,
turns on reminders or shares their progress. See [PRIVACY.md](PRIVACY.md).

## How the religious content is checked

Every hadith and ayah in the app was checked against the source text, not from memory:

- Hadith numbers follow sunnah.com (Muslim by the 'Abd al-Baqi number). Texts and gradings were checked against the
  hadith-api dataset (Bukhari, Muslim, Abu Dawud, Tirmidhi, Nasa'i, Ibn Majah, Malik, Nawawi) with the graders'
  verdicts (al-Albani, Zubair Ali Zai, Shu'aib al-Arna'ut, Ahmad Shakir). Quran verses were checked with quran.com
  (Uthmani text and Saheeh International).
- Narrations graded weak, or disputed between graders, are not used. Two independent checkers reviewed every item,
  an adjudicator resolved disagreements with the source in hand, and new questions and cards were written from the
  sources and verified by two more reviewers.
- Contested points of fiqh (for example moon-sighting methods or the number of tarawih rakahs) are not presented as
  settled.
- Translations quote published translations of the Quran (Ma Jian, al-Umari, Isa Garcia, Hamidullah, Taisirul Quran,
  Helmi Nasr, Kuliev, Junagarhi) and of hadith where they exist (Bengali, French, Russian and Urdu editions); the
  Arabic version quotes the original Arabic.

Corrections are welcome: m.farhan.bava@gmail.com. When editing content, always keep the reference and the grade.

## Project layout

| Path | Purpose |
|---|---|
| `index.html` | App shell (no build step at deploy time) |
| `css/app.css` | Pine design system: tokens for light and dark, shared components ([DESIGN.md](DESIGN.md)) |
| `css/<module>.css`, `js/<module>.js` | Feature modules: `tracker` (Today, Quran, Me), `learn`, `prep`, `cloud` (accounts, sync, competitions, prayer times, push, share, AI) |
| `js/core.js`, `js/main.js`, `js/icons.js` | Runtime (`RS` namespace: store, i18n, router, UI components), boot sequence, Lucide icon sprite (ISC) |
| `content/*.json` | English content source: sections, deeds, daily hadith, badges, quiz categories, true/false, multiple choice, decks, cards, Ramadan Prep, guide |
| `scripts/build-content.js` | Validates `content/` and writes `js/content.js` (structure), `i18n-src/en/content.json` (text) and `api/_lib/content.js` (daily hadith for the server) |
| `i18n-src/<lang>/*.json` | Strings per language; `scripts/build-i18n.js` writes `js/lang/<lang>.js` |
| `scripts/check-i18n.js` | Checks every language: missing keys, placeholders, plural forms, emoji, strings whose English changed since translation |
| `api/` | Vercel serverless API (one function, `api/router.js`, routes in `api/_routes/`), Postgres |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA (offline app shell, push) |
| `vercel.json` | Rewrites, headers, daily cron |

Generated files (`js/content.js`, `js/lang/*.js`, `i18n-src/en/content.json`, `api/_lib/content.js`) are committed.

## Development

```bash
npm install
# optional Postgres for accounts, sync and competitions:
DATABASE_URL=postgresql://user@localhost:5432/ramadan AUTH_SECRET=dev npm run dev     # http://localhost:3000
BASE=http://localhost:3000 npm run test:api      # end-to-end API tests
npm run build:content                            # after editing content/*.json
npm run build:i18n                               # after editing i18n-src/
npm run check:i18n                               # translation health for all languages
```

The service worker is skipped on localhost (add `?sw=1` to test it). When releasing, bump `?v=` in `index.html`
together with `ASSET_V` and `VERSION` in `sw.js`.

### Adding or updating a translation

1. Strings live in `i18n-src/en/*.json`; each language has the same keys in `i18n-src/<code>/`. Plural forms use the
   CLDR categories (`key.one`, `key.few`, …) that `Intl.PluralRules` needs for the language.
2. Run `npm run build:i18n` and `npm run check:i18n`. Keys whose English changed after translation are reported as
   STALE so they can be re-translated.
3. To add a language, add it to `RS.LANGS` in `js/core.js` and create its folder.

## Deployment

- **Vercel:** branch `product` is production; `main` is the development branch (preview deployments). Cloud features
  switch on per environment variable; see [SETUP.md](SETUP.md). Check `/api/health` for what is enabled.
- **GitHub Pages** serves the static app for the custom domain (`CNAME`) from `product`.
- App store packaging: [mobile/README.md](mobile/README.md).

## Feedback

Corrections, suggestions and feedback: m.farhan.bava@gmail.com
