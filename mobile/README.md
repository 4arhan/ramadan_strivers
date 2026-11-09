# Shipping to the app stores

The web app is store-ready as a PWA: `manifest.webmanifest`, `sw.js` (offline + push), icons in `/icons`
(192/512/1024 PNG, maskable, Apple touch icon). Two wrapping paths, both keep the single codebase:

## Android — Trusted Web Activity (recommended, ~1 hour)
1. `npm i -g @bubblewrap/cli` then `bubblewrap init --manifest https://www.ramadanstrivers.com/manifest.webmanifest`
   (package id `com.ramadanstrivers.app`, name "Ramadan Strivers", theme `#070b14`).
2. `bubblewrap build` → upload the `.aab` to Google Play Console.
3. Copy the **SHA-256 signing fingerprint** from Play Console → App integrity into `/.well-known/assetlinks.json`
   (replace `REPLACE_WITH_YOUR_PLAY_SIGNING_SHA256_FINGERPRINT`) and deploy. This removes the browser bar.
4. Push notifications and offline work out of the box (they are the web app's).

## iOS (and Android alternative) — Capacitor
1. `npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android` and `npx cap init` (config already in `capacitor.config.json`:
   it loads the live site, so every web deploy updates the app without a store release).
2. `npx cap add ios` / `npx cap add android`, then `npx cap open ios` → set icons from `/icons/icon-1024.png`, bundle id `com.ramadanstrivers.app`.
3. For iOS web push, add `@capacitor/push-notifications` and register the token with `/api/push/subscribe` — or rely on the PWA installed via Safari "Add to Home Screen" (iOS 16.4+ supports web push there).
4. Home-screen widgets ("Iftar in 2h 10m") are native: a small WidgetKit / Glance extension reading `/api`-free local data via the Capacitor Preferences plugin. Not included yet.

## Domain / API base
The front-end calls the API on the same origin. For a native build that bundles the files locally, set
`window.RS_API_BASE = 'https://www.ramadanstrivers.com'` before `cloud.js` loads (CORS is enabled for `capacitor://localhost` and `http://localhost`).

## Store listing assets
Icon: `/icons/icon-1024.png`. Screenshots: run the app at 390×844 and 1290×2796 (iPhone 15 Pro Max) — the UI is responsive.
Category: Lifestyle / Education. Content rating: Everyone. Privacy policy URL: `/PRIVACY.md` (publish it as a page before submission).
