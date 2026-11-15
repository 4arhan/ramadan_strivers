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

**Whenever a change alters how the app looks or what it offers, before deploying:**

1. Start the dev server with a database, `SUPER_ADMIN_EMAILS=shots@demo.local` and
   `APP_URL=https://www.ramadanstrivers.com` (so printed pages show the real address), then run
   `BASE=http://localhost:<port> node scripts/product-shots.js` (about five minutes). For a text-only change,
   `NUMBERS=1 node scripts/product-shots.js` refreshes the numbers without retaking pictures;
   `ONLY=today,quran ...` retakes named screens.
2. If a feature was added, removed or renamed: add, remove or reword its `<li class="fi">` in the right part of the
   list, update the matching section and the questions, and add a screenshot to the script when it deserves one.
   Only describe what the live app really does (features that need a key that is not set, such as reminders, email
   and AI help, are left out).
3. Commit `product/` with the rest of the change.

The page follows the app's design rules: green only (no purple, no gold), no emoji, no em dashes.
