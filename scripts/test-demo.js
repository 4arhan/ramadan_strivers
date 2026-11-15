#!/usr/bin/env node
/* test-demo.js — checks the live demo (the app opened with ?demo=1; see js/demo.js and CLAUDE.md).

   The demo makes promises to visitors, and this script holds it to them:
     - nothing a visitor has saved in the real app is read or changed,
     - no call reaches the server except the city search, and that one carries no credentials,
     - statistics and the service worker stay off,
     - where the browser will not let the storage objects be replaced, their methods are redirected instead and the
       same holds; if neither is possible, the app does not start,
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
  'prep', 'prep/day?n=3', 'compete', 'compete/org', 'compete/board', 'league', 'league?slug=schools-ramadan-league', 'me', 'me/settings', 'me/guide', 'me/badges', 'me/day?n=7', 'me/family', 'me/buddies', 'display'];
let failed = 0;
function check(name, pass, note) { if (!pass) failed++; console.log((pass ? '  ok   ' : '  FAIL ') + name + (note && !pass ? '  [' + String(note).slice(0, 300) + ']' : '')); }

(async () => {
  const browser = await chromium.launch();
  const open = async o => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'en-GB', timezoneId: 'Europe/London' }, o || {}));
    await ctx.route(/googletagmanager|google-analytics/, x => x.fulfill({ status: 200, body: '' }));
    return ctx;
  };

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
    const page = await ctx.newPage(); const errors = [], calls = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) calls.push(r.method() + ' ' + u.pathname + (r.headers().authorization ? ' with credentials' : '')); });
    await page.goto(BASE + '/?demo=1', { waitUntil: 'networkidle' }); await page.waitForTimeout(900);
    const seen = await page.evaluate(() => ({ lang: RS.lang(), theme: RS.settings.theme, day: RS.settings.day, comp: (JSON.parse(localStorage.getItem('rs-comp') || '{}')).code, auth: localStorage.getItem('rs-auth'), hijri: RS.hijri() }));
    check('the demo does not see the visitor\'s settings, account or competition', seen.lang === 'en' && seen.theme === 'light' && seen.comp === 'DEMO01' && seen.auth === null, JSON.stringify(seen));
    check('it is the 12th of Ramadan in the demo', seen.hijri.month === 9 && seen.hijri.day === 12 && seen.day === 12, JSON.stringify(seen.hijri));
    check('statistics are off', await page.evaluate(() => window['ga-disable-G-Y3WDNYW5P2'] === true));
    // every screen
    const bad = [];
    for (const r of ROUTES) {
      errors.length = 0;
      await page.evaluate(x => { RS.router.go(x); window.scrollTo(0, 0); }, r);
      await page.waitForTimeout(/^(compete|league|me\/buddies)/.test(r) ? 1400 : 500);
      const m = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, len: document.getElementById('view').textContent.trim().length, boom: !!document.querySelector('#view .empty .ic-triangle-alert') }));
      if (errors.length || m.over > 1 || m.len < 20 || m.boom) bad.push(r + (errors.length ? ': ' + errors.join(' ; ') : '') + (m.over > 1 ? ' (wider than the screen)' : '') + (m.len < 20 ? ' (empty)' : ''));
    }
    check('all ' + ROUTES.length + ' screens open without an error', bad.length === 0, bad.join(' | '));
    // the sample competition answers to what the visitor does
    const rank = () => page.evaluate(() => RS.cloud.api('/api/comp/DEMO01/board?token=demo', { auth: false }).then(b => b.me));
    await page.evaluate(() => RS.router.go('today')); await page.waitForTimeout(600);
    const was = await rank();
    const boxes = page.locator('[data-act="tr.tick"][aria-checked="false"], [data-act="tr.tick"][aria-pressed="false"]');
    for (let i = 0; i < 5; i++) { await boxes.first().click(); await page.waitForTimeout(120); }
    await page.waitForTimeout(3000);
    const now = await rank();
    check('ticking deeds raises the visitor\'s points on the sample leaderboard', was && now && now.totalPts > was.totalPts, JSON.stringify([was, now]));
    const off = await page.evaluate(() => RS.cloud.api('/api/auth/login', { method: 'POST', body: { email: 'a@b.c', password: 'x' }, auth: false }).then(() => 'worked', e => e.code));
    check('what the demo leaves out says so (signing in)', off === 'demo', off);
    const popup = await page.evaluate(() => { const w = window.open('/poster/DEMO01', '_blank'); return !!w && w.closed === true; });
    check('pages made by the server are not opened', popup);
    check('no service worker was registered', await page.evaluate(async () => !('serviceWorker' in navigator) || (await navigator.serviceWorker.getRegistrations()).length === 0));
    check('nothing reached the server', calls.length === 0, calls.join(' | '));
    await page.evaluate(() => fetch('/api/geo?q=Leeds').then(r => r.status, () => 0)); await page.waitForTimeout(600);
    check('the city search does, without credentials', calls.length === 1 && calls[0] === 'GET /api/geo', calls.join(' | '));
    // where the demo keeps its state: one session key, read through a fresh frame of the same origin
    const where = await page.evaluate(() => { const f = document.createElement('iframe'); document.body.appendChild(f); const w = f.contentWindow, out = { session: Object.keys(w.sessionStorage).join(), local: Object.keys(w.localStorage).filter(k => k !== 'rs-setup' && k !== 'rs-auth' && k !== 'rs-settings' && k !== 'rs-day-1' && k !== 'rs-comp').join() }; f.remove(); return out; });
    check('the demo keeps its state in one session key of its own', where.session === 'rs-demo' && where.local === '', JSON.stringify(where));
    check('the visitor\'s own storage is exactly as it was', before === await dump());
    // a reload keeps what was done; ?fresh=1 starts again
    const done = await page.evaluate(() => RS.tracker.getDay(12).done);
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(700);
    check('a reload keeps what the visitor did', await page.evaluate(() => RS.tracker.getDay(12).done) === done);
    await page.goto(BASE + '/?demo=1&fresh=1', { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
    check('?fresh=1 starts the sample again and tidies the address', await page.evaluate(() => RS.tracker.getDay(12).done) < done && await page.evaluate(() => location.search) === '?demo=1');
    await ctx.close();
  }

  /* ---- a browser that will not let the storage objects be replaced: their methods are redirected instead */
  const realKeys = page => page.evaluate(() => { const f = document.createElement('iframe'); document.body.appendChild(f); const w = f.contentWindow, out = { session: Object.keys(w.sessionStorage).sort().join(), local: Object.keys(w.localStorage).sort().join() }; f.remove(); return out; });
  const lock = () => { if (location.search.indexOf('demo=1') < 0) return; const l = window.localStorage, s = window.sessionStorage; Object.defineProperty(window, 'localStorage', { configurable: false, get: () => l }); Object.defineProperty(window, 'sessionStorage', { configurable: false, get: () => s }); };
  {
    const ctx = await open(); const seed = await ctx.newPage();
    await seed.goto(BASE + '/privacy.html'); await seed.evaluate(() => { localStorage.clear(); localStorage.setItem('rs-settings', JSON.stringify({ lang: 'fr', theme: 'dark' })); }); await seed.close();
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(lock);
    await page.goto(BASE + '/?demo=1', { waitUntil: 'networkidle' }); await page.waitForTimeout(900);
    const seen = await page.evaluate(() => ({ demo: typeof window.RS_DEMO, lang: RS.lang(), same: Object.prototype.toString.call(window.localStorage), day: RS.settings.day }));
    check('with the storage objects locked, the demo still starts, on its own data', seen.demo === 'object' && seen.lang === 'en' && seen.same === '[object Storage]' && seen.day === 12 && errors.length === 0, JSON.stringify(seen) + ' ' + errors.join(' ; '));
    await page.locator('[data-act="tr.tick"][aria-checked="false"], [data-act="tr.tick"][aria-pressed="false"]').first().click(); await page.waitForTimeout(400);
    const done = await page.evaluate(() => RS.tracker.getDay(12).done);
    const keys = await realKeys(page);
    check('and still writes nothing but its one session key', keys.session === 'rs-demo' && keys.local === 'rs-settings', JSON.stringify(keys));
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(700);
    check('and a reload still keeps what the visitor did', await page.evaluate(() => RS.tracker.getDay(12).done) === done && done === 9);
    await ctx.close();
  }

  /* ---- neither way works: the app must not start */
  {
    const ctx = await open(); const page = await ctx.newPage();
    await page.addInitScript(lock);
    await page.addInitScript(() => { if (location.search.indexOf('demo=1') >= 0) Object.freeze(Storage.prototype); });
    await page.goto(BASE + '/?demo=1', { waitUntil: 'domcontentloaded' }).catch(() => {}); await page.waitForTimeout(2000);
    const state = await page.evaluate(() => typeof window.RS + '/' + typeof window.RS_DEMO).catch(() => 'gone');
    check('if storage cannot be kept apart at all, the app does not start and the visitor is sent away', /\/product/.test(page.url()) && state !== 'object/object', page.url() + ' ' + state);
    const left = await page.evaluate(() => Object.keys(localStorage).concat(Object.keys(sessionStorage)).join()).catch(() => '?');
    check('and nothing was left behind in their storage', left === '', left);
    await ctx.close();
  }

  /* ---- the normal app is untouched */
  {
    const ctx = await open(); const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { try { localStorage.setItem('rs-setup', '1'); localStorage.setItem('rs-consent', 'no'); } catch (e) { /* ignore */ } });
    await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
    const n = await page.evaluate(() => { const native = f => /\[native code\]/.test(Function.prototype.toString.call(f)); return { demo: typeof window.RS_DEMO, native: native(window.fetch) && native(Date) && native(window.open), storage: Object.prototype.toString.call(window.localStorage), pill: !!document.getElementById('demo-pill'), ga: window['ga-disable-G-Y3WDNYW5P2'] }; });
    check('outside demo mode nothing is replaced', n.demo === 'undefined' && n.native && n.storage === '[object Storage]' && !n.pill && n.ga === undefined && errors.length === 0, JSON.stringify(n) + ' ' + errors.join(' ; '));
    await page.goto(BASE + '/?demo=0', { waitUntil: 'networkidle' });
    check('only ?demo=1 switches it on', await page.evaluate(() => typeof window.RS_DEMO) === 'undefined');
    await ctx.close();
  }

  await browser.close();
  console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nALL DEMO CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
