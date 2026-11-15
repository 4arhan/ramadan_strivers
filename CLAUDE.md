# Ramadan Strivers: notes for Claude

## Product page (about.ramadanstrivers.com)

`product/index.html` is the public product page. It is served at `about.ramadanstrivers.com` (host rewrite in
`vercel.json`) and at `/product` on the main domain. Its screenshots in `product/img/` are taken from the real app by
`scripts/product-shots.js`.

**Whenever a change alters how the app looks or what it offers, before deploying:**

1. Start the dev server with a database and `SUPER_ADMIN_EMAILS=shots@demo.local`, then run
   `BASE=http://localhost:<port> node scripts/product-shots.js` to retake every screenshot.
2. If a feature was added, removed or renamed, update the matching section of `product/index.html` (and add a
   screenshot for it to the `SHOTS` list in the script when it deserves one).
3. Commit `product/img/*.jpg`, `product/shots.json` and the page with the rest of the change.

The page follows the app's design rules: green only (no purple, no gold), no emoji, no em dashes.
