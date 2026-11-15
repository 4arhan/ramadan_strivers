# Ramadan Strivers: notes for Claude

## Product page (about.ramadanstrivers.com)

`product/index.html` is the public product and demo page. It is served at `about.ramadanstrivers.com` (host rewrite in
`vercel.json`) and at `/product` on the main domain. Everything on it comes from the app through
`scripts/product-shots.js`:

- **Screenshots** in `product/img/` (phone screens, the long scrolling captures the tour plays, the pages organisers
  print, other languages, the home display, and `og.jpg` for social sharing) are taken from the running app.
- **Numbers** (deeds, questions, flashcards, languages, features ...) are counted from the app's content and written into
  every element with a `data-n="<name>"` attribute. Never type such a number by hand: add a `data-n`.
- The **"try it" checklist** rows, each image's width and height, and the questions' search-engine data are rebuilt too.
- The **feature count** is the number of `<li class="fi">` items in the "All features" list.
- The **language menu** of the live demo, the **QR code** that opens the app, and the **"Just added" list** are written by
  the script too. "Just added" shows the newest six entries of `product/whats-new.json`; `{n:name}` in a text becomes a
  counted number.

**Whenever a change alters how the app looks or what it offers, before deploying:**

1. Start the dev server with a database, `SUPER_ADMIN_EMAILS=shots@demo.local` and
   `APP_URL=https://www.ramadanstrivers.com` (so printed pages show the real address), then run
   `BASE=http://localhost:<port> node scripts/product-shots.js` (about five minutes). For a text-only change,
   `NUMBERS=1 node scripts/product-shots.js` refreshes the numbers without retaking pictures;
   `ONLY=today,quran ...` retakes named screens.
2. If a feature was added, removed or renamed: add, remove or reword its `<li class="fi">` in the right part of the
   list, update the matching section and the questions, and add a screenshot to the script when it deserves one.
   For something new, also add an entry at the top of `product/whats-new.json` (date, title, one or two sentences).
   Only describe what the live app really does (features that need a key that is not set, such as reminders, email
   and AI help, are left out).
3. Commit `product/` with the rest of the change.

The page follows the app's design rules: green only (no purple, no gold), no emoji, no em dashes.

## Live demo (the app opened with `?demo=1`)

The product page shows the app itself in a frame, on a sample twelfth day of Ramadan. On a phone the same demo opens
on its own page. Two pieces make it work, and neither does anything outside demo mode:

- The **first script in `index.html`** replaces the browser's storage with a copy kept in memory before anything else
  runs (carried through a reload in one session-storage key, `rs-demo`), switches statistics off, and stops the page if
  the browser will not allow the replacement. A visitor's real data must never be read or written in demo mode.
  `?fresh=1` starts the sample again; `?kids=1` opens it in kids mode.
- **`js/demo.js`** moves the clock to the 12th of Ramadan, writes the sample month (real deed ids, so badges and
  streaks are really earned), and answers every `/api/` call from memory in `answer()`: health, the sample competition
  `DEMO01` (board, score, join, awards, sign-ups, head to head), a league and buddies. The scoring there mirrors
  `api/_lib/comp.js`. Only the city search reaches the real server. Anything not answered says it is switched off in
  the demo (`demo.off`), as do pages the server would make (`/poster/`, `/o/`, `/l/`, `/s/`).

When a change adds or alters a server call that a participant's screens make, add or update its answer in `answer()`,
otherwise that part of the demo shows the switched-off message. When the scoring rules on the server change, change
them in `js/demo.js` as well. Then run `BASE=http://localhost:<port> node scripts/test-demo.js`: it checks that the
demo reads and changes nothing of a visitor's, calls nothing on the server but the city search, opens every screen
without an error, and that the normal app is untouched.

The page talks to the frame with `postMessage` (`type: 'rs-demo'`): `go`, `theme`, `lang`, `level` and `open` go
in; the screen, language, theme and the visitor's place on the sample board come out.
