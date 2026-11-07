# 🌙 Ramadan Strivers

**From Muslim to Mu'min** — a free, private, offline-first Ramadan planner & tracker.
Live at **[www.ramadanstrivers.com](https://www.ramadanstrivers.com)**.

- 60+ daily deeds in 7 categories, each backed by a hadith or ayah
- Quran completion tracker, streaks, heatmap, badges, PDF report
- 🧠 Flash Quiz — 63 true/false cards on the hadith & ayat behind every deed
- 🏆 Competition Mode — schools, universities, mosques & communities run a Top-10 prize competition
- 🌍 10 languages: English, 中文, हिन्दी, Español, Français, العربية, বাংলা, Português, Русский, اردو

All personal data stays on the device (localStorage). Only Competition Mode sends anything to a server — and only a display name and aggregate scores.

## Project layout

| File | Purpose |
|---|---|
| `index.html` | The whole app (markup, styles, logic) |
| `i18n.js` | UI translations for the 10 languages |
| `firestore.rules` | Security rules for Competition Mode |
| `CNAME` | Custom domain for GitHub Pages |

Deploy = push to `main`; GitHub Pages serves it.

## Enabling Competition Mode (one-time, ~5 minutes)

Competition Mode needs a shared database. It uses **Firebase** (free Spark plan is plenty).

1. Go to <https://console.firebase.google.com> → **Add project** (any name, Analytics optional).
2. **Build → Authentication → Get started → Sign-in method**: enable **Anonymous** and **Email/Password**.
   Then under **Settings → Authorized domains** add `www.ramadanstrivers.com` (and `ramadanstrivers.com`).
3. **Build → Firestore Database → Create database** → *Start in production mode* → pick a region.
4. In Firestore open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and **Publish**.
5. **Project settings (gear) → Your apps → Web (`</>`)** → register the app (no hosting needed). Copy the `firebaseConfig` object.
6. In `index.html` find `var FB_CONFIG={apiKey:"",...}` and paste your values. Commit & push.

That's it — the Compete tab goes live. (A Firebase web API key is not a secret: it only identifies the project. The rules file is what protects the data.)

### How it works

- **Organisers** (school, university, mosque, company, family, community) create a competition with an email + password, describe prizes for ranks 1–10, and receive a 6-letter **join code**. They get a dashboard with a live leaderboard, participant count, prize editor, CSV export, "remove participant", and "close competition".
- **Participants** enter the join code + a display name (+ optional class/team). No account needed — the app signs them in anonymously. Every time they tick a deed or log Quran pages, their totals sync: **points** (sum of deed points, ×1.5 in the last 10 nights), days logged, average %, Quran pages.
- Sharing: `https://www.ramadanstrivers.com/?join=CODE` opens the app with the code pre-filled.
- Leaderboard ranks by total points; ranks 1–10 show their prize.

### Data model

```
competitions/{CODE}                 name, type, ownerUid, ownerEmail, prizes[10], open, createdAt
competitions/{CODE}/participants/{uid}   name, group, totalPts, daysLogged, avgPct, quranPages, lastDay, updatedAt
```

## Languages

`i18n.js` holds the UI strings, section titles and all 64 deed labels per language. Hadith notes, explanations, the user guide bodies and quiz questions remain in English (religious texts are left untranslated on purpose — contributions from native speakers with Islamic-studies background are welcome). The app auto-detects the browser language on first launch; users can change it under **More → Settings → Language**. Arabic and Urdu render right-to-left.

To add a language: copy `I18N.en`, translate, add an entry to `LANGS`.

## Feedback

Corrections, suggestions and feedback: m.farhan.bava@gmail.com
