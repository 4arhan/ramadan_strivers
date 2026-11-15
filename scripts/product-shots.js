#!/usr/bin/env node
/* product-shots.js — takes the screenshots shown on the product page (product/index.html) from the real app, so the
   page always shows what the app looks like today. Run it before every deploy that changes how the app looks:

     1. start the dev server with a database:  DATABASE_URL=... SUPER_ADMIN_EMAILS=shots@demo.local node scripts/dev-server.js 3600
     2. BASE=http://localhost:3600 node scripts/product-shots.js
     3. commit product/img/*.jpg and product/shots.json

   It creates a demo school, pupils, a second school and a league through the API (demo data, local database only),
   then captures each screen at phone size. product/shots.json records when the shots were taken and the app version;
   the page prints that date. Needs Playwright (preinstalled in the cloud environment; elsewhere: npm i -D playwright). */
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3600';
const OUT = path.join(__dirname, '..', 'product', 'img');
const NOW = '2027-02-19T15:30:00Z';                  // day 12 of Ramadan 1448: a busy-looking, realistic day
async function call(method, p, body, token) {
  const r = await fetch(BASE + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || ''; return { status: r.status, data: ct.includes('json') ? await r.json() : await r.text() };
}
async function account(email, name) {
  let r = await call('POST', '/api/auth/register', { email, password: 'demo-shots-1', name });
  if (r.status !== 201) r = await call('POST', '/api/auth/login', { email, password: 'demo-shots-1' });
  if (!r.data || !r.data.token) throw new Error('could not sign in ' + email + ': ' + JSON.stringify(r.data));
  return r.data;
}
// the app's real deed ids, so the seeded days look like days someone actually logged
global.window = {}; eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'content.js'), 'utf8'));
const DEEDS = Object.keys(window.RS.content.deeds);
const PUPILS = [['Aisha K.', '7A'], ['Bilal R.', '7B'], ['Fatima Z.', '7A'], ['Omar S.', '7B'], ['Maryam H.', '7A'], ['Yusuf A.', '7B'], ['Zaid M.', '7A'], ['Hana T.', '7B'], ['Ibrahim N.', '7A'], ['Safiya D.', '7B']];
function days(seed, upTo) { const o = {}; for (let d = 1; d <= upTo; d++) { if ((d + seed) % 7 === 0) continue; o[d] = { p: 45 + ((d * 7 + seed * 13) % 50), t: 90 + ((d * 17 + seed * 29) % 150), q: 4 + ((d + seed * 3) % 12) }; } return o; }

// What the phone has on it: 11 days of deeds, Quran pages, a few badges.
function seedScript(o) {
  return `(() => { try {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('rs-setup', '1'); localStorage.setItem('rs-consent', 'no');
    localStorage.setItem('rs-settings', JSON.stringify(Object.assign({ lang: 'en', theme: 'light', detail: true, themeChosen: true }, ${JSON.stringify(o.settings || {})})));
    const ids = ${JSON.stringify(DEEDS)};
    for (let d = 1; d <= 12; d++) {
      const ck = {}; ids.forEach((id, i) => { ck[id] = d < 12 ? (d * 3 + i) % 4 !== 0 : (i * 7) % 10 < 6; });
      const done = Object.values(ck).filter(Boolean).length;
      localStorage.setItem('rs-day-' + d, JSON.stringify({ day: d, ck, ts: Date.parse('${NOW}') - (12 - d) * 864e5, done, tot: 60, pct: d < 12 ? 62 + (d * 7) % 30 : 38, pts: d < 12 ? 150 + (d * 23) % 90 : 84 }));
    }
    localStorage.setItem('rs-quran-pages', JSON.stringify({ 1: 20, 2: 18, 3: 22, 4: 20, 5: 16, 6: 20, 7: 24, 8: 20, 9: 14, 10: 20, 11: 22, 12: 8 }));
    localStorage.setItem('rs-quiz-stats', JSON.stringify({ ans: 64, cor: 51 }));
    localStorage.setItem('rs-quiz-best', JSON.stringify({ fasting: 90, quran: 80 }));
    localStorage.setItem('rs-badges', JSON.stringify({ firstStep: { u: 1, d: '2027-02-08T10:00:00Z' } }));
    ${Object.keys(o.store || {}).map(k => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(typeof o.store[k] === 'string' ? o.store[k] : JSON.stringify(o.store[k]))});`).join('\n    ')}
  } catch (e) {} })()`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const health = await call('GET', '/api/health'); if (!health.data || !health.data.dbOk) throw new Error('The dev server at ' + BASE + ' needs a database for the competition screens.');
  // demo organisation, pupils, a second school and a league
  const head = await account('head@demo.local', 'Head Teacher');
  let r = await call('POST', '/api/comp', { name: 'Al-Noor Academy', type: 'School', prizes: ['A day out for the class', 'Book voucher', 'Book voucher'],
    settings: { message: 'Jumuah mubarak. Double points this Friday.', goal: { k: 'q', n: 3000 }, custom: [{ label: 'Help set up iftar', pts: 12 }, { label: 'Tidy the prayer hall', pts: 8 }], bonus: [12, 27],
      charity: { target: 2000, raised: 1340, currency: 'GBP', cause: 'Water wells' }, country: 'GB' } }, head.token);
  const code = r.data.competition.code; const tokens = [];
  for (let i = 0; i < PUPILS.length; i++) { const j = await call('POST', '/api/comp/' + code + '/join', { name: PUPILS[i][0], grp: PUPILS[i][1] }); tokens.push(j.data.token); await call('PUT', '/api/comp/' + code + '/score', { token: j.data.token, days: days(i + 1, 12) }); }
  await call('POST', '/api/comp/' + code + '/signups', { title: 'Dates for Friday iftar', day: 'Friday', slots: 3 }, head.token);
  await call('POST', '/api/comp/' + code + '/signups', { title: 'Help serve at the community iftar', day: 'Saturday', slots: 6 }, head.token);
  await call('PATCH', '/api/comp/' + code + '/signups', { id: (await call('GET', '/api/comp/' + code + '/signups')).data.signups[0].id, token: tokens[2] });
  r = await call('POST', '/api/comp', { name: 'Madina High School', type: 'School', settings: { country: 'GB', charity: { target: 1500, raised: 600, currency: 'GBP', cause: 'Food parcels' } } }, head.token); const codeB = r.data.competition.code;
  for (let i = 0; i < 8; i++) { const j = await call('POST', '/api/comp/' + codeB + '/join', { name: 'Student ' + (i + 1), grp: i % 2 ? '9A' : '9B' }); await call('PUT', '/api/comp/' + codeB + '/score', { token: j.data.token, days: days(i + 20, 12) }); }
  r = await call('POST', '/api/comp', { name: 'Masjid As-Salam Youth', type: 'Mosque', settings: { country: 'GB' } }, head.token); const codeC = r.data.competition.code;
  for (let i = 0; i < 6; i++) { const j = await call('POST', '/api/comp/' + codeC + '/join', { name: 'Member ' + (i + 1) }); await call('PUT', '/api/comp/' + codeC + '/score', { token: j.data.token, days: days(i + 40, 12) }); }
  let slug = '';
  const sup = await account('shots@demo.local', 'Shots'); const me = await call('GET', '/api/auth/me', null, sup.token);
  if (me.data.super) {
    slug = 'schools-ramadan-league-' + Date.now().toString(36);
    await call('POST', '/api/admin/leagues', { name: 'Schools Ramadan League', slug, country: 'United Kingdom', about: 'Schools and mosques side by side.' }, sup.token);
    for (const [c, division] of [[code, 'Secondary school'], [codeB, 'Secondary school'], [codeC, 'Mosque']]) { await call('POST', '/api/league', { slug, code: c, division }, head.token); await call('PATCH', '/api/admin/leagues', { slug, code: c, status: 'approved' }, sup.token); }
    await call('PATCH', '/api/admin', { code, verified: true }, sup.token);
  } else console.log('  (no super admin on this server: the league screenshot is skipped. Start it with SUPER_ADMIN_EMAILS=shots@demo.local)');

  const participant = { 'rs-comp': { role: 'participant', code, token: tokens[0], name: PUPILS[0][0], grp: PUPILS[0][1], cname: 'Al-Noor Academy' } };
  const organiser = { 'rs-auth': JSON.stringify(head.token), 'rs-user': head.user, 'rs-comp': { role: 'organiser', code } };
  // name, route, options: settings, store, scheme, before(page) to click into a state, top (scroll to this selector)
  const SHOTS = [
    ['today', 'today', {}],
    ['today-dark', 'today', { settings: { theme: 'dark' }, scheme: 'dark' }],
    ['checklist', 'today', { top: '.tr-check, #tr-checklist, [id^="tr-sec"]' }],
    ['quran', 'quran', {}],
    ['prep', 'prep', {}],
    ['learn', 'learn', {}],
    ['start', 'learn/start', {}],
    ['pray', 'learn/start/pray', { top: '.st-step, .st-pose' }],
    ['kids', 'today', { settings: { level: 'kids' } }],
    ['compete', 'compete', { store: participant }],
    ['board', 'compete/board', { store: participant }],
    ['goal', 'compete', { store: participant, top: '#or-goal' }],
    ['manage', 'compete', { store: organiser, before: async p => { await p.click('#cmp-tab-manage'); }, top: '#or-awards' }],
    ['insights', 'compete', { store: organiser, before: async p => { await p.click('#cmp-tab-insights'); }, top: '.cl-tabs' }],
    ['arabic', 'today', { settings: { lang: 'ar' } }],
    ['me', 'me', {}]
  ].concat(slug ? [['league', 'league?s=' + slug, { store: participant }]] : []);

  const browser = await chromium.launch();
  const made = [];
  for (const [name, route, o] of SHOTS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', colorScheme: o.scheme || 'light', locale: 'en-GB', timezoneId: 'Europe/London' });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date(NOW));
    await page.route(/googletagmanager|google-analytics/, x => x.fulfill({ status: 200, body: '' }));
    await page.addInitScript(seedScript(o));
    await page.goto(BASE + '/#/' + route, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1500);
    if (o.before) { await o.before(page).catch(e => console.log('  ' + name + ': ' + e.message.split('\n')[0])); await page.waitForTimeout(2500); }
    await page.evaluate(() => document.fonts && document.fonts.ready);
    if (o.top) await page.evaluate(sel => { const el = document.querySelector(sel); if (el) window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - 84)); }, o.top);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 88 });
    made.push(name); console.log('  shot ' + name);
    await ctx.close();
  }
  await browser.close();
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'); const version = (sw.match(/VERSION = '([^']+)'/) || [])[1] || '';
  const langs = fs.readdirSync(path.join(__dirname, '..', 'i18n-src')).filter(l => /^[a-z]{2}$/.test(l)).length;
  fs.writeFileSync(path.join(__dirname, '..', 'product', 'shots.json'), JSON.stringify({ taken: new Date().toISOString().slice(0, 10), version, languages: langs, shots: made }, null, 2) + '\n');
  console.log('done: ' + made.length + ' screenshots in product/img (app ' + version + ')');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
