#!/usr/bin/env node
/* test-demo.js — checks the live demo (the app opened with ?demo=1; see js/demo-guard.js, js/demo.js and CLAUDE.md).

   The demo makes promises to visitors, and this script holds it to them:
     - nothing a visitor has saved in the real app is read or changed (two ways of keeping storage apart are tried;
       if neither is possible, or the guard file does not load, the app does not start),
     - no call reaches the server except the city search, and that one carries nothing but its address, even when
       js/demo.js itself is missing,
     - a link cannot lead out of the demo inside the demo's own window, and the product page takes the frame away if
       it ever stops answering as the demo,
     - statistics stay off and no service worker is registered,
     - every screen opens without an error, and what the visitor ticks moves the sample leaderboard,
     - outside demo mode none of this is active.

   Run it after changing demo mode, or after adding a server call to a screen a participant sees:

     node scripts/dev-server.js 3600                               (in one terminal; no database is needed)
     BASE=http://localhost:3600 node scripts/test-demo.js           (in another)

   Needs Playwright (preinstalled in the cloud environment; elsewhere: npm i -D playwright). */
'use strict';
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3600';
const ROUTES = ['today', 'today/preview', 'quran', 'learn', 'learn/quiz?cat=fasting', 'learn/mcq?cat=all', 'learn/flash?deck=duas', 'learn/daily', 'learn/start', 'learn/start/guide', 'learn/start/pray', 'learn/start/words',
  'prep', 'prep/day?n=3', 'compete', 'compete/org', 'compete/board', 'league', 'league?s=schools-ramadan-league', 'me', 'me/settings', 'me/guide', 'me/badges', 'me/day?n=7', 'me/family', 'me/buddies', 'display'];
const UNTICKED = '[data-act="tr.tick"][aria-checked="false"], [data-act="tr.tick"][aria-pressed="false"]';
let failed = 0;
function check(name, pass, note) { if (!pass) failed++; console.log((pass ? '  ok   ' : '  FAIL ') + name + (note && !pass ? '  [' + String(note).slice(0, 320) + ']' : '')); }

(async () => {
  const browser = await chromium.launch();
  const open = async o => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'en-GB', timezoneId: 'Europe/London' }, o || {}));
    await ctx.route(/googletagmanager|google-analytics/, x => x.fulfill({ status: 200, body: '' }));
    return ctx;
  };
  const watch = page => { const o = { errors: [], calls: [] }; page.on('pageerror', e => o.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') o.errors.push(m.text()); });
    page.on('request', r => { const u = new URL(r.url()); if (u.origin === new URL(BASE).origin && /^\/(api|poster|o|l|s)\//.test(u.pathname)) { const h = r.headers(); o.calls.push(r.method() + ' ' + u.pathname + (h.authorization || h.cookie || r.postData() ? ' with more than its address' : '')); } }); return o; };
  // what is really in the browser's storage for this site, read through a fresh frame (its own, untouched Storage)
  const realKeys = page => page.evaluate(() => { const f = document.createElement('iframe'); document.body.appendChild(f); const w = f.contentWindow, out = { session: Object.keys(w.sessionStorage).sort().join(), local: Object.keys(w.localStorage).sort().join() }; f.remove(); return out; });

  /* ---- a visitor who already uses the app */
  {
    const ctx = await open(); const real = await ctx.newPage();
    await real.goto(BASE + '/privacy.html');
    await real.evaluate(() => {
      localStorage.clear(); localStorage.setItem('rs-setup', '1'); localStorage.setItem('rs-auth', 'real-token');
      localStorage.setItem('rs-settings', JSON.stringify({ lang: 'fr', theme: 'dark', day: 3, mode: 'ramadan' }));
      localStorage.setItem('rs-day-1', JSON.stringify({ day: 1, ck: { fajr: true }, ts: 1, done: 1, tot: 61, pct: 2, pts: 15 }));
      localStorage.setItem('rs-comp', JSON.stringify({ role: 'participant', code: 'REAL01', token: 'real', name: 'Me' }));
    });
    const dump = () => real.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
    const before = await dump();
    const page = await ctx.newPage(); const w = watch(page);
    await page.goto(BASE + '/?demo=1', { waitUntil: 'networkidle' }); await page.waitForTimeout(900);
    const seen = await page.evaluate(() => ({ lang: RS.lang(), theme: RS.settings.theme, day: RS.settings.day, comp: (JSON.parse(localStorage.getItem('rs-comp') || '{}')).code, auth: localStorage.getItem('rs-auth'), hijri: RS.hijri() }));
    check('the demo does not see the visitor\'s settings, account or competition', seen.lang === 'en' && seen.theme === 'light' && seen.comp === 'DEMO01' && seen.auth === null, JSON.stringify(seen));
    check('it is the 12th of Ramadan in the demo', seen.hijri.month === 9 && seen.hijri.day === 12 && seen.day === 12, JSON.stringify(seen.hijri));
    // every screen
    const bad = [];
    for (const r of ROUTES) {
      w.errors.length = 0;
      await page.evaluate(x => { RS.router.go(x); window.scrollTo(0, 0); }, r);
      await page.waitForTimeout(/^(compete|league|me\/buddies)/.test(r) ? 1400 : 500);
      const m = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, len: document.getElementById('view').textContent.trim().length, boom: !!document.querySelector('#view .empty .ic-triangle-alert'), text: document.getElementById('view').textContent }));
      if (w.errors.length || m.over > 1 || m.len < 20 || m.boom) bad.push(r + (w.errors.length ? ': ' + w.errors.join(' ; ') : '') + (m.over > 1 ? ' (wider than the screen)' : '') + (m.len < 20 ? ' (empty)' : ''));
      if (/^league\?s=/.test(r) && !/Madina High School/.test(m.text)) bad.push(r + ' (the league table did not appear)');
    }
    check('all ' + ROUTES.length + ' screens open without an error, the league table among them', bad.length === 0, bad.join(' | '));
    // the sample competition answers to what the visitor does
    const rank = () => page.evaluate(() => RS.cloud.api('/api/comp/DEMO01/board?token=demo', { auth: false }).then(b => b.me));
    await page.evaluate(() => RS.router.go('today')); await page.waitForTimeout(600);
    const was = await rank();
    for (let i = 0; i < 5; i++) { await page.locator(UNTICKED).first().click(); await page.waitForTimeout(120); }
    await page.waitForTimeout(3000);
    const now = await rank();
    check('ticking deeds raises the visitor on the sample leaderboard', was && now && now.totalPts > was.totalPts && now.rank < was.rank, JSON.stringify([was, now]));
    // the organiser's message, once read, stays read
    const msg = () => page.locator('#or-msg').count();
    const had = await msg(); if (had) { await page.locator('#or-msg button').click(); await page.waitForTimeout(300); }
    await page.evaluate(() => RS.router.go('compete')); await page.waitForTimeout(1500); await page.evaluate(() => RS.router.go('today')); await page.waitForTimeout(700);
    check('the organiser\'s message stays away once read', had === 1 && await msg() === 0, had + ' then ' + await msg());
    const off = await page.evaluate(() => RS.cloud.api('/api/auth/login', { method: 'POST', body: { email: 'a@b.c', password: 'x' }, auth: false }).then(() => 'worked', e => e.code + ': ' + RS.cloud.errText(e)));
    check('what the demo leaves out says so (signing in)', /^demo: This is switched off in the demo/.test(off), off);
    const popup = await page.evaluate(() => { const x = window.open('/poster/DEMO01', '_blank'); return !!x && x.closed === true; });
    check('pages made by the server are not opened', popup);
    // other shapes of the same call are kept on the page too
    const shapes = await page.evaluate(async () => { const a = await fetch(new URL('/api/health', location.href)).then(r => r.json()); const b = await fetch(new Request('/api/comp/DEMO01/signups', { method: 'PATCH', body: JSON.stringify({ id: 1, token: 'demo' }) })).then(r => r.status); const c = await fetch('/api/admin').then(r => r.status); return [a.features.competitions, b, c]; });
    check('a call made with an address object or a request object stays on the page as well', shapes[0] === true && shapes[1] === 200 && shapes[2] === 403, JSON.stringify(shapes));
    check('statistics: nothing was handed to the tag', await page.evaluate(() => Array.isArray(window.dataLayer) && window.dataLayer.length === 0 && typeof window.gtag === 'function'));
    check('nothing reached the server', w.calls.length === 0, w.calls.join(' | '));
    await page.evaluate(() => fetch('/api/geo?q=Leeds', { headers: { Authorization: 'Bearer x' } }).then(r => r.status, () => 0)); await page.waitForTimeout(600);
    check('the city search does, as a bare address', w.calls.length === 1 && w.calls[0] === 'GET /api/geo', w.calls.join(' | '));
    // a link that leaves the demo opens in another tab; this one stays the demo
    await page.evaluate(() => RS.router.go('me')); await page.waitForTimeout(600);
    const [tab] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null), page.locator('a[href="privacy.html"]').click()]);
    await page.waitForTimeout(500);
    check('the privacy page opens in a new tab, and this window stays the demo', !!tab && /privacy\.html/.test(tab.url()) && /\?demo=1/.test(page.url()) && await page.evaluate(() => typeof window.RS_DEMO) === 'object', (tab ? tab.url() : 'no tab') + ' ' + page.url());
    if (tab) await tab.close();
    const where = await realKeys(page);
    check('the demo keeps its state in one session key of its own', where.session === 'rs-demo', JSON.stringify(where));
    check('the visitor\'s own storage is exactly as it was', before === await dump());
    // a reload keeps what was done; ?fresh=1 starts again; the address can ask for a mode and keeps what else it carried
    const done = await page.evaluate(() => RS.tracker.getDay(12).done);
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(700);
    check('a reload keeps what the visitor did', await page.evaluate(() => RS.tracker.getDay(12).done) === done);
    await page.goto(BASE + '/?demo=1&kids=1&tab=quran', { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
    const k1 = await page.evaluate(() => ({ level: RS.settings.level, route: RS.router.current().route, search: location.search }));
    await page.goto(BASE + '/?demo=1&kids=0&open=prayer', { waitUntil: 'networkidle' }); await page.waitForTimeout(1600);
    const k0 = await page.evaluate(() => ({ level: RS.settings.level, search: location.search, sheet: /Fajr/.test(document.getElementById('sheet-root').textContent) }));
    check('the address can ask for kids mode, grown-up mode and the prayer times, and keeps what else it carried', k1.level === 'kids' && k1.route === 'quran' && k1.search === '?demo=1' && k0.level !== 'kids' && k0.sheet && k0.search === '?demo=1', JSON.stringify([k1, k0]));
    await page.goto(BASE + '/?demo=1&fresh=1', { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
    check('?fresh=1 starts the sample again and tidies the address', await page.evaluate(() => RS.tracker.getDay(12).done) < done && await page.evaluate(() => location.search) === '?demo=1');
    await ctx.close();
  }

  /* ---- a browser that will not let the storage objects be replaced: their methods are redirected instead */
  const lock = () => { if (location.search.indexOf('demo=1') < 0) return; const l = window.localStorage, s = window.sessionStorage; Object.defineProperty(window, 'localStorage', { configurable: false, get: () => l }); Object.defineProperty(window, 'sessionStorage', { configurable: false, get: () => s }); };
  {
    const ctx = await open(); const seed = await ctx.newPage();
    await seed.goto(BASE + '/privacy.html'); await seed.evaluate(() => { localStorage.clear(); localStorage.setItem('rs-settings', JSON.stringify({ lang: 'fr', theme: 'dark' })); }); await seed.close();
    const page = await ctx.newPage(); const w = watch(page);
    await page.addInitScript(lock);
    await page.goto(BASE + '/?demo=1', { waitUntil: 'networkidle' }); await page.waitForTimeout(900);
    const seen = await page.evaluate(() => ({ demo: typeof window.RS_DEMO, lang: RS.lang(), same: Object.prototype.toString.call(window.localStorage), day: RS.settings.day }));
    check('with the storage objects locked, the demo still starts, on its own data', seen.demo === 'object' && seen.lang === 'en' && seen.same === '[object Storage]' && seen.day === 12 && w.errors.length === 0, JSON.stringify(seen) + ' ' + w.errors.join(' ; '));
    await page.locator(UNTICKED).first().click(); await page.waitForTimeout(400);
    const done = await page.evaluate(() => RS.tracker.getDay(12).done);
    const keys = await realKeys(page);
    check('and still writes nothing but its one session key', keys.session === 'rs-demo' && keys.local === 'rs-settings', JSON.stringify(keys));
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(700);
    check('and a reload still keeps what the visitor did', await page.evaluate(() => RS.tracker.getDay(12).done) === done && done === 9);
    await ctx.close();
  }

  /* ---- the app must not start: storage cannot be kept apart at all, or the guard file did not arrive */
  for (const [name, prepare] of [
    ['if storage cannot be kept apart at all', async page => { await page.addInitScript(lock); await page.addInitScript(() => { if (location.search.indexOf('demo=1') >= 0) Object.freeze(Storage.prototype); }); }],
    ['if the guard file does not load', async page => { await page.route(/\/js\/demo-guard\.js/, x => x.abort()); }]]) {
    const ctx = await open(); const page = await ctx.newPage(); const w = watch(page);
    await prepare(page);
    await page.goto(BASE + '/?demo=1', { waitUntil: 'domcontentloaded' }).catch(() => {}); await page.waitForTimeout(2200);
    const state = await page.evaluate(() => typeof window.RS + '/' + typeof window.RS_DEMO).catch(() => 'gone');
    const left = await page.evaluate(() => Object.keys(localStorage).concat(Object.keys(sessionStorage)).join()).catch(() => '?');
    check(name + ', the app does not start and nothing is left behind', /\/product/.test(page.url()) && !/^object/.test(state) && left === '' && w.calls.length === 0, page.url() + ' ' + state + ' [' + left + '] ' + w.calls.join(' '));
    await ctx.close();
  }

  /* ---- js/demo.js missing: no sample month, but still nothing real */
  {
    const ctx = await open(); const page = await ctx.newPage(); const w = watch(page);
    await page.route(/\/js\/demo\.js/, x => x.abort());
    await page.goto(BASE + '/?demo=1#/compete', { waitUntil: 'networkidle' }).catch(() => {}); await page.waitForTimeout(2500);
    const keys = await realKeys(page).catch(() => ({}));
    check('without js/demo.js the app still reaches no server and no real storage', w.calls.length === 0 && keys.local === '' && (keys.session === 'rs-demo' || keys.session === ''), w.calls.join(' | ') + ' ' + JSON.stringify(keys));
    await ctx.close();
  }

  /* ---- prayer times where the browser names the zone the old way (India), and where no city shares the zone */
  for (const [zone, want] of [['Asia/Calcutta', 'IN'], ['Asia/Karachi', 'PK'], ['Pacific/Chatham', '']]) {
    const ctx = await open({ timezoneId: zone }); const page = await ctx.newPage();
    await page.goto(BASE + '/?demo=1', { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
    const p = await page.evaluate(() => RS.settings.prayer && RS.settings.prayer.city);
    check('a visitor in ' + zone + ' gets prayer times for ' + (want ? 'a city of their own country' : 'some city, never none'), !!p && (!want || p.c === want), JSON.stringify(p));
    await ctx.close();
  }

  /* ---- no service worker: checked where one could really be registered */
  {
    const ctx = await open({ serviceWorkers: 'allow' }); const page = await ctx.newPage(); const other = await ctx.newPage();
    await other.goto(BASE + '/privacy.html');
    const count = () => other.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
    await page.goto(BASE + '/?demo=1&sw=1', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);      // ?sw=1 is the local opt-in that registers one on localhost
    const inDemo = await count();
    await page.goto(BASE + '/?sw=1', { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
    const normal = await count();
    check('the demo registers no service worker (the normal app, asked the same way, does)', inDemo === 0 && normal === 1, inDemo + ' / ' + normal);
    await page.goto(BASE + '/?demo=1', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    const reach = await page.evaluate(async () => [typeof (await navigator.serviceWorker.getRegistration()), (await navigator.serviceWorker.getRegistrations()).length]);
    check('and with one installed, the demo cannot reach it (so it cannot cancel real reminders)', reach[0] === 'undefined' && reach[1] === 0 && await count() === 1, JSON.stringify(reach));
    await other.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.clear(); });
    await ctx.close();
  }

  /* ---- the product page: the frame is shown only while it answers as the demo */
  {
    const ctx = await open({ viewport: { width: 1360, height: 850 } }); const page = await ctx.newPage(); const w = watch(page);
    await page.goto(BASE + '/product/index.html#demo', { waitUntil: 'networkidle' });
    await page.click('#demo-start'); await page.waitForSelector('#demo-screen.live', { timeout: 20000 }); await page.waitForTimeout(1500);
    const place = async () => (await page.textContent('#demo-rank')).trim() + ' ' + (await page.textContent('#demo-pts')).trim();
    const first = await place(); const frame = page.frameLocator('#demo-screen iframe');
    for (let i = 0; i < 6; i++) { const el = frame.locator(UNTICKED).first(); await el.scrollIntoViewIfNeeded(); await el.click(); await page.waitForTimeout(150); }
    await page.waitForTimeout(3200);
    const second = await place();
    check('on the product page, ticking in the frame moves the visitor up the board beside it', first === '#4 3,743' && /^#3 /.test(second) && await page.isVisible('#demo-up'), first + ' -> ' + second);
    await page.click('.demo-chip[data-demo*="me/settings"]'); await page.waitForTimeout(900); await page.click('.demo-try li:nth-child(5) button'); await page.waitForTimeout(1500);
    check('the page steers the frame (kids mode)', await page.getAttribute('#demo-kids', 'aria-pressed') === 'true');
    await page.click('#demo-kids'); await page.waitForTimeout(700);
    // a link inside the frame that leaves the demo: a new tab, and the frame is still the demo
    await page.evaluate(() => document.querySelector('#demo-screen iframe').contentWindow.RS.router.go('me')); await page.waitForTimeout(900);
    const [tab] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null), frame.locator('a[href="privacy.html"]').click()]);
    await page.waitForTimeout(600);
    check('a link out of the demo opens a new tab; the frame stays the demo', !!tab && /privacy\.html/.test(tab.url()) && /\?demo=1/.test(await page.evaluate(() => document.querySelector('#demo-screen iframe').contentWindow.location.search)), tab ? tab.url() : 'no tab');
    if (tab) await tab.close();
    // if the frame is ever taken somewhere else, the page stops showing it as the demo
    await page.evaluate(() => { document.querySelector('#demo-screen iframe').contentWindow.location.href = '/privacy.html'; });
    await page.waitForFunction(() => !document.querySelector('#demo-screen iframe'), null, { timeout: 12000 }).catch(() => {});
    check('a frame that stops answering as the demo is taken away, with a word about it', await page.locator('#demo-screen iframe').count() === 0 && !(await page.getAttribute('#demo-screen', 'class')).includes('live') && /not running/.test(await page.textContent('#demo-hint')), await page.textContent('#demo-hint'));
    await page.click('#demo-start'); await page.waitForSelector('#demo-screen.live', { timeout: 20000 });
    check('and it starts again from there', true);
    check('the product page: nothing reached the server, no errors', w.calls.length === 0 && w.errors.length === 0, w.calls.join(' | ') + ' ' + w.errors.join(' ; '));
    await ctx.close();
  }

  /* ---- the product page, in a browser where the demo cannot keep storage apart */
  {
    const ctx = await open({ viewport: { width: 1360, height: 850 } }); const page = await ctx.newPage(); const w = watch(page);
    await ctx.addInitScript(lock); await ctx.addInitScript(() => { if (location.search.indexOf('demo=1') >= 0) Object.freeze(Storage.prototype); });
    await page.goto(BASE + '/product/index.html#demo', { waitUntil: 'networkidle' });
    await page.click('#demo-start'); await page.waitForFunction(() => /cannot run/.test(document.querySelector('#demo-hint').textContent), null, { timeout: 15000 }).catch(() => {});
    const s = await page.evaluate(() => ({ hint: document.querySelector('#demo-hint').textContent, frames: document.querySelectorAll('#demo-screen iframe').length, button: document.querySelector('#demo-start').textContent.trim(), href: document.querySelector('#demo-start').getAttribute('href') }));
    check('where the demo cannot run, the page says so and offers the app instead', /cannot run/.test(s.hint) && s.frames === 0 && s.button === 'Open the app' && !/demo=1/.test(s.href) && w.calls.length === 0, JSON.stringify(s));
    await ctx.close();
  }

  /* ---- the normal app is untouched */
  {
    const ctx = await open(); const page = await ctx.newPage(); const w = watch(page);
    await page.addInitScript(() => { try { localStorage.setItem('rs-setup', '1'); localStorage.setItem('rs-consent', 'yes'); } catch (e) { /* ignore */ } });
    await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
    const n = await page.evaluate(() => { const native = f => /\[native code\]/.test(Function.prototype.toString.call(f)); return { demo: typeof window.RS_DEMO, native: native(window.fetch) && native(Date) && native(window.open) && native(Storage.prototype.setItem), storage: Object.prototype.toString.call(window.localStorage), pill: !!document.getElementById('demo-pill'), ga: window['ga-disable-G-Y3WDNYW5P2'], sent: window.dataLayer.length, guard: !!document.querySelector('script[src*="demo-guard"]') }; });
    check('outside demo mode nothing is replaced, the guard is not even loaded, and statistics work as before', n.demo === 'undefined' && n.native && n.storage === '[object Storage]' && !n.pill && n.ga === undefined && n.sent > 3 && !n.guard && w.errors.length === 0, JSON.stringify(n) + ' ' + w.errors.join(' ; '));
    await page.goto(BASE + '/?demo=0', { waitUntil: 'networkidle' });
    check('only ?demo=1 switches it on', await page.evaluate(() => typeof window.RS_DEMO) === 'undefined');
    await ctx.close();
  }

  await browser.close();
  console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nALL DEMO CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
