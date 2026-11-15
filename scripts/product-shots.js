#!/usr/bin/env node
/* product-shots.js — keeps the product page (product/index.html) in step with the app. It:

     1. takes every screenshot on the page from the real, running app (phone screens, long scrolling captures for
        the tour, the pages organisers print, the home display, other languages),
     2. counts what the app really contains (deeds, questions, flashcards, lessons, languages, ...) and writes those
        numbers into every element of the page that carries a data-n="<name>" attribute,
     3. rebuilds the "try it" checklist from the app's own deeds, sets each image's width and height, counts the
        features in the catalogue and renders the social-share image,
     4. fills in the language menu of the live demo from the app's list of languages, draws the QR code that opens
        the app, and writes the "Just added" list from product/whats-new.json (newest six; {n:name} in a text
        becomes a counted number). Add an entry to that file when something new ships.

   Run it before every deploy that changes how the app looks or what it offers:

     DATABASE_URL=... SUPER_ADMIN_EMAILS=shots@demo.local node scripts/dev-server.js 3600      (in one terminal)
     BASE=http://localhost:3600 node scripts/product-shots.js                                    (in another)
     then commit product/

   Only some screens:  ONLY=today,quran node scripts/product-shots.js      Numbers only:  NUMBERS=1 node scripts/product-shots.js
   It creates demo organisations, pupils and a league through the API (demo data, local database only).
   Needs Playwright (preinstalled in the cloud environment; elsewhere: npm i -D playwright). Images are written as
   WebP, converted in the browser itself, so no image library is needed. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'product', 'img');
const PAGE = path.join(ROOT, 'product', 'index.html');
const BASE = process.env.BASE || 'http://localhost:3600';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const RAMADAN = '2027-02-19T15:30:00Z';              // day 12 of Ramadan 1448, mid-afternoon: iftar is coming
const SHABAN = '2027-01-25T10:00:00Z';               // the month before: Ramadan Prep and the countdown
const LONDON = { lat: 51.5074, lng: -0.1278, method: 'MoonsightingCommittee', madhab: 'shafi', tz: 'Europe/London', city: { n: 'London', r: 'England', c: 'GB' } };

/* ------------------------------------------------------------------ what the app contains (the page's numbers) */
global.window = {}; eval(fs.readFileSync(path.join(ROOT, 'js', 'content.js'), 'utf8'));
global.RS = window.RS; eval(fs.readFileSync(path.join(ROOT, 'js', 'start-data.js'), 'utf8')); eval(fs.readFileSync(path.join(ROOT, 'data', 'cities.js'), 'utf8'));
const C = window.RS.content, SD = window.RS.startData;
const EN = {}; fs.readdirSync(path.join(ROOT, 'i18n-src', 'en')).forEach(f => Object.assign(EN, JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n-src', 'en', f), 'utf8'))));
const DEEDS = Object.keys(C.deeds);
function numbers() {
  const tracker = fs.readFileSync(path.join(ROOT, 'js', 'tracker.js'), 'utf8');
  const kids = (tracker.match(/KIDS_LIST = \[([^\]]*)\]/) || ['', ''])[1].split(',').filter(x => x.trim()).length;
  const methods = Object.keys(EN).filter(k => /^prayer\.m\.[A-Za-z0-9]+$/.test(k) && !/Custom$/.test(k)).length;
  const strings = Object.keys(EN).length;
  const n = {
    deeds: DEEDS.length, groups: C.sections.length, sourced: DEEDS.filter(k => C.deeds[k].ref).length, deedsEarly: DEEDS.filter(k => C.deeds[k].sec !== 'lastTen').length,
    lastTen: DEEDS.filter(k => C.deeds[k].sec === 'lastTen').length, hadith: C.hadith.length, badges: C.badges.length, streaks: 4,
    tf: C.tf.length, mcq: C.mcq.length, questions: C.tf.length + C.mcq.length, cards: Array.isArray(C.cards) ? C.cards.length : Object.keys(C.cards).length, decks: C.decks.length, topics: C.quizCats.filter(x => x.id !== 'all').length,
    prepDays: C.prep.days.length, prepActions: C.prep.days.reduce((a, d) => a + d.prompts.length, 0), prepAreas: C.prep.tracks.length, prepCheck: C.prep.assessment.length,
    chapters: SD.guide.length, wudu: SD.pray.wudu.length, praySteps: SD.pray.steps.length, terms: SD.terms.length, stories: SD.stories.length, kidDeeds: kids, kidQuiz: SD.easyTf.length,
    languages: fs.readdirSync(path.join(ROOT, 'i18n-src')).filter(l => /^[a-z]{2}$/.test(l)).length, methods, cities: window.RS.CITIES.length,
    strings: Math.floor(strings / 100) * 100, guideTopics: C.guide.length, dailyMax: DEEDS.filter(k => C.deeds[k].sec !== 'lastTen').reduce((a, k) => a + C.deeds[k].pts, 0)
  };
  n.learnItems = n.questions + n.cards;
  return n;
}

/* ------------------------------------------------------------------ the page: numbers, try-it rows, image sizes */
const fmt = v => typeof v === 'number' ? v.toLocaleString('en-GB') : String(v);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function tryRows() {
  // six real deeds for the page's "try it" checklist: label, points, source and grading straight from the app
  return ['fajr', 'quran-recitation', 'morning-adhkar', 'charity-given', 'tongue', 'tarawih'].filter(id => C.deeds[id]).map(id => {
    const d = C.deeds[id], label = EN['deed.' + id + '.label'] || id;
    return '        <li><button type="button" class="tr-row" role="checkbox" aria-checked="false" data-pts="' + d.pts + '"><span class="tr-box" aria-hidden="true"><svg><use href="#i-check"/></svg></span>' +
      '<span class="tr-txt"><b>' + esc(label) + '</b><small>' + esc(d.ref) + (d.grade ? ' · ' + esc(d.grade.replace(/\s*\(.*\)$/, '')) : '') + '</small></span><span class="tr-pts">+' + d.pts + '</span></button></li>';
  }).join('\n');
}
// The app's languages, in its own order and with its own names (js/core.js RS.LANGS).
function appLangs() {
  const out = [];
  fs.readFileSync(path.join(ROOT, 'js', 'core.js'), 'utf8').replace(/\{ code: '([a-z]{2})', name: '((?:[^'\\]|\\.)*)', dir: '(?:ltr|rtl)' \}/g, (m, code, name) => { out.push({ code, name: JSON.parse('"' + name + '"') }); return m; });
  return out;
}
// A QR code as one SVG path (the qrcode package the server's posters already use).
function qrSvg(text, label) {
  const q = require('qrcode').create(text, { errorCorrectionLevel: 'M' }), size = q.modules.size, data = q.modules.data, pad = 2;
  let d = '';
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (data[y * size + x]) d += 'M' + (x + pad) + ' ' + (y + pad) + 'h1v1h-1z';
  return '<svg class="code" viewBox="0 0 ' + (size + pad * 2) + ' ' + (size + pad * 2) + '" role="img" aria-label="' + esc(label) + '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path fill="#06140E" d="' + d + '"/></svg>';
}
// "Just added": the newest six entries of product/whats-new.json. {n:name} in a text is replaced by that number,
// counted from the app like every other number on the page.
function newsHtml(n) {
  const file = path.join(ROOT, 'product', 'whats-new.json');
  if (!fs.existsSync(file)) return null;
  const list = JSON.parse(fs.readFileSync(file, 'utf8')).filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && x.title).map((x, i) => Object.assign({ i }, x)).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : a.i - b.i).slice(0, 6);
  const day = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const text = s => esc(s).replace(/\{n:([a-zA-Z]+)\}/g, (m, k) => n[k] === undefined ? m : '<span data-n="' + k + '">' + fmt(n[k]) + '</span>');
  return list.map((x, i) => '      <li class="reveal' + (i % 3 ? ' d' + (i % 3) : '') + '"><time datetime="' + x.date + '">' + day(x.date) + '</time><h3>' + esc(x.title) + '</h3><p>' + text(x.text || '') +
    (x.href ? ' <a href="' + esc(x.href) + '">' + esc(x.link || 'See it') + '</a>' : '') + '</p></li>').join('\n');
}
function patchPage(sizes) {
  let html = fs.readFileSync(PAGE, 'utf8');
  const n = numbers();
  n.features = (html.match(/<li class="fi"/g) || []).length;
  n.screens = Object.keys(sizes).filter(k => !/^nav-/.test(k) && k !== 'og').length;
  let missing = [];
  html = html.replace(/(<[a-z0-9]+\b[^>]*\bdata-n="([a-zA-Z]+)"[^>]*>)([^<]*)(<)/g, (m, open, key, old, close) => { if (n[key] === undefined) { missing.push(key); return m; } return open + fmt(n[key]) + close; });
  html = html.replace(/(<!-- try:start -->)[\s\S]*?(<!-- try:end -->)/, (m, a, b) => a + '\n' + tryRows() + '\n        ' + b);
  const langs = appLangs();
  if (langs.length) html = html.replace(/(<!-- langs:start -->)[\s\S]*?(<!-- langs:end -->)/, (m, a, b) => a + '\n' + langs.map(l => '              <option value="' + l.code + '" lang="' + l.code + '">' + esc(l.name) + '</option>').join('\n') + '\n              ' + b);
  html = html.replace(/(<!-- qr:start -->)[\s\S]*?(<!-- qr:end -->)/, (m, a, b) => a + qrSvg('https://www.ramadanstrivers.com/', 'QR code that opens ramadanstrivers.com') + b);
  const news = newsHtml(n);
  if (news !== null) html = html.replace(/(<!-- new:start -->)[\s\S]*?(<!-- new:end -->)/, (m, a, b) => a + '\n' + news + '\n      ' + b);
  // every screenshot gets its real width and height (in CSS pixels), so nothing jumps while the page loads
  html = html.replace(/<img\b[^>]*\b(?:data-)?src="\/product\/img\/([a-z0-9-]+)\.(webp|jpg)"[^>]*>/g, (tag, name) => {
    const s = sizes[name]; if (!s) return tag;
    return tag.replace(/\swidth="\d+"/, '').replace(/\sheight="\d+"/, '').replace(/>$/, ' width="' + s.w + '" height="' + s.h + '">');
  });
  // the questions and answers, for search engines
  const faq = []; html.replace(/<details class="qa[^"]*"[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*<div class="qa-a">([\s\S]*?)<\/div>\s*<\/details>/g, (m, q, a) => { faq.push({ '@type': 'Question', name: q.replace(/<[^>]+>/g, '').trim(), acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() } }); return m; });
  if (faq.length) html = html.replace(/(<script type="application\/ld\+json" id="ld-faq">)[\s\S]*?(<\/script>)/, (m, a, b) => a + JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq }) + b);
  fs.writeFileSync(PAGE, html);
  if (missing.length) console.log('  page asks for numbers this script does not know: ' + Array.from(new Set(missing)).join(', '));
  return n;
}
if (process.env.NUMBERS) {
  const prev = fs.existsSync(path.join(ROOT, 'product', 'shots.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'product', 'shots.json'), 'utf8')) : {};
  const n = patchPage(prev.sizes || {}); prev.numbers = n; fs.writeFileSync(path.join(ROOT, 'product', 'shots.json'), JSON.stringify(prev, null, 1) + '\n');
  console.log('numbers written: ' + n.features + ' features, ' + n.deeds + ' deeds, ' + n.questions + ' questions, ' + n.languages + ' languages'); process.exit(0);
}

/* ------------------------------------------------------------------ demo data */
const { chromium } = require('playwright');
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
const PUPILS = [['Aisha K.', '7A'], ['Bilal R.', '7B'], ['Fatima Z.', '7A'], ['Omar S.', '7B'], ['Maryam H.', '7A'], ['Yusuf A.', '7B'], ['Zaid M.', '7A'], ['Hana T.', '7B'], ['Ibrahim N.', '7A'], ['Safiya D.', '7B'], ['Idris L.', '7A'], ['Noor P.', '7B']];
function days(seed, upTo) { const o = {}; for (let d = 1; d <= upTo; d++) { if ((d + seed) % 7 === 0) continue; o[d] = { p: 45 + ((d * 7 + seed * 13) % 50), t: 90 + ((d * 17 + seed * 29) % 150), q: 4 + ((d + seed * 3) % 12) }; } return o; }

// What the phone has on it: eleven and a half days of deeds (the app's real ones), Quran pages, badges, a city.
function seedScript(o) {
  const at = Date.parse(o.at || RAMADAN);
  return `(() => { try {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('rs-setup', '1'); localStorage.setItem('rs-consent', 'no');
    localStorage.setItem('rs-settings', JSON.stringify(Object.assign({ lang: 'en', theme: 'light', detail: true, themeChosen: true, prayer: ${JSON.stringify(LONDON)} }, ${JSON.stringify(o.settings || {})})));
    const deeds = ${JSON.stringify(DEEDS.filter(k => C.deeds[k].sec !== 'lastTen').map(k => [k, C.deeds[k].pts]))};   // the last-ten deeds only appear from day 21
    if (!${o.noDays ? 'true' : 'false'}) {
      for (let d = 1; d <= 12; d++) {
        const ck = {}; let done = 0, pts = 0;
        deeds.forEach((x, i) => { const on = d < 12 ? (d * 3 + i) % 4 !== 0 && (d + i) % 9 !== 0 : (i * 7) % 10 < 6; ck[x[0]] = on; if (on) { done++; pts += x[1]; } });
        localStorage.setItem('rs-day-' + d, JSON.stringify({ day: d, ck, ts: ${at} - (12 - d) * 864e5, done, tot: deeds.length, pct: Math.round(done / deeds.length * 100), pts }));
      }
      localStorage.setItem('rs-quran-pages', JSON.stringify({ 1: 20, 2: 18, 3: 22, 4: 20, 5: 16, 6: 20, 7: 24, 8: 20, 9: 14, 10: 20, 11: 22, 12: 8 }));
    }
    localStorage.setItem('rs-quiz-stats', JSON.stringify({ ans: 64, cor: 51 }));
    localStorage.setItem('rs-quiz-best', JSON.stringify({ fasting: 90, quran: 80, salah: 70 }));
    ${Object.keys(o.store || {}).map(k => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(typeof o.store[k] === 'string' ? o.store[k] : JSON.stringify(o.store[k]))});`).join('\n    ')}
  } catch (e) {} })()`;
}

/* ------------------------------------------------------------------ taking pictures */
let browser, conv;
const sizes = {};
// PNG → WebP in the browser (canvas), so the script needs no image library. Keeps transparency.
async function save(name, png, quality, scale) {
  const out = await conv.evaluate(async ({ b64, q }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/webp', q));
    const buf = new Uint8Array(await blob.arrayBuffer()); let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { b64: btoa(s), w: c.width, h: c.height };
  }, { b64: png.toString('base64'), q: quality });
  fs.writeFileSync(path.join(OUT, name + '.webp'), Buffer.from(out.b64, 'base64'));
  sizes[name] = { w: Math.round(out.w / scale), h: Math.round(out.h / scale) };
  return Buffer.from(out.b64, 'base64').length;
}
async function open(o) {
  const vp = o.viewport || { width: 390, height: 844 }, scale = o.scale || 2;
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: scale, serviceWorkers: 'block', colorScheme: o.scheme || 'light', locale: 'en-GB', timezoneId: 'Europe/London',
    extraHTTPHeaders: o.auth ? { Authorization: 'Bearer ' + o.auth } : undefined });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(o.at || RAMADAN));
  await page.route(/googletagmanager|google-analytics/, x => x.fulfill({ status: 200, body: '' }));
  if (!o.raw) await page.addInitScript(seedScript(o));
  return { ctx, page, scale };
}
async function settle(page, ms) { await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {}); await page.waitForTimeout(ms || 900); }
const HIDE_NAV = '#nav, .toast-root { display: none !important; }';
// One screen. kind: view (what the phone shows), tall (the whole screen as one long picture, navigation bar saved
// separately as nav-<name> so the page can keep it fixed while the picture scrolls), paper (a page to print).
async function shoot(name, route, o) {
  o = o || {};
  if (ONLY && ONLY.indexOf(name) < 0) return;
  const { ctx, page, scale } = await open(o);
  try {
    await page.goto(/^https?:/.test(route) ? route : BASE + (route.charAt(0) === '/' ? route : '/#/' + route), { waitUntil: 'networkidle' }).catch(() => {});
    await page.addStyleTag({ content: '.toast-root { display: none !important; }' }).catch(() => {});
    await settle(page, o.wait || 1100);
    let target = page;
    if (o.before) { const r = await o.before(page); if (r && r.screenshot) target = r; await settle(target, 1300); }
    if (o.top) await target.evaluate(sel => { const el = document.querySelector(sel); if (el) window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - 84)); }, o.top);
    if (o.top) await target.waitForTimeout(500);
    let kb;
    if (o.kind === 'tall') {
      // the navigation bar on its own, on a transparent background
      // (a screen without the bar, such as a lesson, has none to save)
      const box = await target.evaluate(() => { const b = document.querySelector('#nav .nav-bar'); if (!b) return null; const r = b.getBoundingClientRect(); return r.height > 0 && r.top < innerHeight - 20 && getComputedStyle(document.getElementById('nav')).visibility !== 'hidden' ? { y: Math.max(0, Math.floor(r.top - 26)) } : null; });
      if (box) {
        const tag = await target.addStyleTag({ content: 'html, body { background: transparent !important; } body > *:not(#nav) { visibility: hidden !important; }' });
        const vp = target.viewportSize();
        await save('nav-' + name, await target.screenshot({ omitBackground: true, clip: { x: 0, y: box.y, width: vp.width, height: vp.height - box.y } }), 0.9, scale);
        await tag.evaluate(el => el.remove());
      }
      await target.addStyleTag({ content: HIDE_NAV });
      await target.waitForTimeout(250);
      const h = await target.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
      const cap = Math.min(h, o.max || 2900);
      kb = await save(name, await target.screenshot({ fullPage: true, clip: { x: 0, y: 0, width: target.viewportSize().width, height: cap } }), 0.8, scale);
    } else {
      if (o.hideNav) await target.addStyleTag({ content: HIDE_NAV });
      kb = await save(name, await target.screenshot(o.full ? { fullPage: true } : {}), o.kind === 'paper' ? 0.84 : 0.82, scale);
    }
    console.log('  ' + name.padEnd(18) + String(Math.round(kb / 1024)).padStart(4) + ' KB  ' + sizes[name].w + 'x' + sizes[name].h);
  } catch (e) { console.log('  ' + name + ' FAILED: ' + String(e.message).split('\n')[0]); }
  await ctx.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (!ONLY) fs.readdirSync(OUT).forEach(f => { if (/\.(webp|jpg|png)$/.test(f)) fs.unlinkSync(path.join(OUT, f)); });
  else { try { Object.assign(sizes, JSON.parse(fs.readFileSync(path.join(ROOT, 'product', 'shots.json'), 'utf8')).sizes || {}); } catch (e) { /* first run */ } }
  const health = await call('GET', '/api/health'); if (!health.data || !health.data.dbOk) throw new Error('The dev server at ' + BASE + ' needs a database for the competition screens.');

  // a school with twelve pupils in two classes, a second school, a mosque youth group, and a league for the three
  const head = await account('head@demo.local', 'Head Teacher');
  let r = await call('POST', '/api/comp', { name: 'Al-Noor Academy', type: 'School', prizes: ['A day out for the class', 'Book voucher', 'Book voucher'],
    settings: { message: 'Jumuah mubarak. Double points this Friday.', goal: { k: 'q', n: 3000 }, custom: [{ label: 'Help set up iftar', pts: 12 }, { label: 'Tidy the prayer hall', pts: 8 }], bonus: [12, 27],
      charity: { target: 2000, raised: 1340, currency: 'GBP', cause: 'Water wells' }, country: 'GB', sponsor: 'Al-Noor Trust' } }, head.token);
  const code = r.data.competition.code; const tokens = [];
  for (let i = 0; i < PUPILS.length; i++) { const j = await call('POST', '/api/comp/' + code + '/join', { name: PUPILS[i][0], grp: PUPILS[i][1] }); tokens.push(j.data.token); await call('PUT', '/api/comp/' + code + '/score', { token: j.data.token, days: days(i + 1, 12) }); }
  await call('POST', '/api/comp/' + code + '/enrol', { text: 'Khadija W., 7A\nMusa B., 7B\nSumayya E., 7A' }, head.token);
  await call('POST', '/api/comp/' + code + '/signups', { title: 'Dates for Friday iftar', day: 'Friday', slots: 3 }, head.token);
  await call('POST', '/api/comp/' + code + '/signups', { title: 'Help serve at the community iftar', day: 'Saturday', slots: 6 }, head.token);
  const su = (await call('GET', '/api/comp/' + code + '/signups')).data.signups;
  await call('PATCH', '/api/comp/' + code + '/signups', { id: su[0].id, token: tokens[2] }); await call('PATCH', '/api/comp/' + code + '/signups', { id: su[1].id, token: tokens[4] }); await call('PATCH', '/api/comp/' + code + '/signups', { id: su[1].id, token: tokens[7] });
  await call('POST', '/api/comp/' + code + '/admins', { email: 'deputy@demo.local', role: 'admin' }, head.token);
  await call('POST', '/api/comp/' + code + '/admins', { email: 'ms.rahman@demo.local', role: 'teacher', grp: '7A' }, head.token);
  await call('POST', '/api/comp/' + code + '/admins', { email: 'governor@demo.local', role: 'viewer' }, head.token);
  r = await call('POST', '/api/comp', { name: 'Madina High School', type: 'School', settings: { country: 'GB', charity: { target: 1500, raised: 600, currency: 'GBP', cause: 'Food parcels' } } }, head.token); const codeB = r.data.competition.code;
  for (let i = 0; i < 8; i++) { const j = await call('POST', '/api/comp/' + codeB + '/join', { name: 'Student ' + (i + 1), grp: i % 2 ? '9A' : '9B' }); await call('PUT', '/api/comp/' + codeB + '/score', { token: j.data.token, days: days(i + 20, 12) }); }
  r = await call('POST', '/api/comp', { name: 'Masjid As-Salam Youth', type: 'Mosque', settings: { country: 'GB' } }, head.token); const codeC = r.data.competition.code;
  for (let i = 0; i < 6; i++) { const j = await call('POST', '/api/comp/' + codeC + '/join', { name: 'Member ' + (i + 1) }); await call('PUT', '/api/comp/' + codeC + '/score', { token: j.data.token, days: days(i + 40, 12) }); }
  await call('POST', '/api/comp/' + codeB + '/challenge', { other: code, startDay: 8 }, head.token).then(x => x.data.challenge && call('PATCH', '/api/comp/' + code + '/challenge', { id: x.data.challenge.id, accept: true }, head.token));
  let slug = '';
  const sup = await account('shots@demo.local', 'Shots'); const me = await call('GET', '/api/auth/me', null, sup.token);
  if (me.data.super) {
    slug = 'schools-ramadan-league-' + Date.now().toString(36);
    await call('POST', '/api/admin/leagues', { name: 'Schools Ramadan League', slug, country: 'United Kingdom', about: 'Schools and mosques side by side.' }, sup.token);
    for (const [c, division] of [[code, 'Secondary school'], [codeB, 'Secondary school'], [codeC, 'Mosque']]) { await call('POST', '/api/league', { slug, code: c, division }, head.token); await call('PATCH', '/api/admin/leagues', { slug, code: c, status: 'approved' }, sup.token); }
    await call('PATCH', '/api/admin', { code, verified: true }, sup.token);
  } else console.log('  (no super admin on this server: league screenshots are skipped. Start it with SUPER_ADMIN_EMAILS=shots@demo.local)');

  const participant = { 'rs-comp': { role: 'participant', code, token: tokens[0], name: PUPILS[0][0], grp: PUPILS[0][1], cname: 'Al-Noor Academy' } };
  const organiser = { 'rs-auth': JSON.stringify(head.token), 'rs-user': head.user, 'rs-comp': { role: 'organiser', code } };
  const badges = { 'rs-badges': { firstStep: { u: 1, d: '2027-02-08T10:00:00Z' }, weekOne: { u: 1, d: '2027-02-14T20:00:00Z' }, fajrWarrior: { u: 1, d: '2027-02-15T06:00:00Z' }, quranLover: { u: 1, d: '2027-02-18T21:00:00Z' }, generous: { u: 1, d: '2027-02-17T18:00:00Z' } } };
  const tab = t => async p => { await p.click('#cmp-tab-' + t); };
  const nAssess = C.prep.assessment.length;
  // Ramadan Prep in Sha'ban: take the readiness check as a person would, then tick most of the days so far
  const prep = route => async p => {
    await p.evaluate(() => RS.runAct('prep.start')); await p.waitForTimeout(500);
    for (let i = 0; i < nAssess; i++) { await p.evaluate(i => { const el = document.createElement('div'); el.setAttribute('data-arg', i); RS.runAct('prep.answer', String([2, 1, 2, 1, 2, 2, 1][i % 7]), el); RS.runAct('prep.qnav', 'next:' + i); }, i); await p.waitForTimeout(160); }
    await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('rs-prep') || '{}'), today = RS.hijri().day, now = Date.now(); s.done = s.done || {}; s.checkins = s.checkins || {};
      RS.content.prep.days.forEach(d => { d.prompts.forEach((x, i) => { if (d.n < today ? (d.n * 5 + i) % 6 !== 0 : (d.n === today && i === 0)) s.done[x.id] = now; }); });
      for (let k = 0; k < 8; k++) { const dt = new Date(now - k * 864e5), key = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'); s.checkins[key] = { salah: [k % 4 !== 3, true, true, k % 3 !== 2, true], quran: { minutes: 10 + (k * 7) % 25, ts: now - k * 864e5 } }; }
      localStorage.setItem('rs-prep', JSON.stringify(s)); });
    const day = await p.evaluate(() => RS.hijri().day);
    await p.goto(BASE + '/#/' + route.replace('TODAY', day)); await p.reload({ waitUntil: 'networkidle' }).catch(() => {});
    await p.addStyleTag({ content: '.toast-root { display: none !important; }' }).catch(() => {});
  };
  const popup = click => async p => { const [w] = await Promise.all([p.waitForEvent('popup', { timeout: 15000 }), click(p)]); await w.setViewportSize({ width: 794, height: 1123 }); await w.waitForLoadState('domcontentloaded').catch(() => {}); await w.waitForTimeout(1200); return w; };
  const paper = { kind: 'paper', viewport: { width: 794, height: 1123 }, scale: 1.25, raw: true };

  browser = await chromium.launch();
  conv = await (await browser.newContext()).newPage(); await conv.goto('about:blank');

  /* ---- the tour: long captures with the navigation bar kept apart */
  await shoot('tour-today', 'today', { kind: 'tall', max: 3300 });
  await shoot('tour-quran', 'quran', { kind: 'tall' });
  await shoot('tour-prep', 'prep', { kind: 'tall', at: SHABAN, noDays: true, before: prep('prep') });
  await shoot('tour-learn', 'learn', { kind: 'tall' });
  await shoot('tour-pray', 'learn/start/pray', { kind: 'tall', max: 3300 });
  await shoot('tour-kids', 'today', { kind: 'tall', settings: { level: 'kids' } });
  await shoot('tour-compete', 'compete', { kind: 'tall', store: participant, max: 3300 });
  await shoot('tour-manage', 'compete', { kind: 'tall', store: organiser, before: tab('manage'), max: 3300 });
  await shoot('tour-me', 'me', { kind: 'tall', store: badges });

  /* ---- single screens */
  await shoot('today', 'today', {});
  await shoot('today-dark', 'today', { settings: { theme: 'dark' }, scheme: 'dark' });
  await shoot('checklist', 'today', { top: '#tr-checklist, .tr-check, .tr-sec' });
  await shoot('prayer', 'today', { before: async p => { await p.evaluate(() => RS.cloud.prayer.open()); } });
  await shoot('qibla', 'today', { before: async p => { await p.evaluate(() => RS.runAct('tl.qibla')); } });
  await shoot('story', 'today', { before: async p => { await p.evaluate(() => RS.runAct('tl.story', 'progress')); await p.waitForTimeout(1500); } });
  await shoot('quran', 'quran', {});
  await shoot('countdown', 'today', { at: SHABAN, noDays: true });
  await shoot('prep', 'prep', { at: SHABAN, noDays: true, before: prep('prep') });
  await shoot('prep-day', 'prep', { at: SHABAN, noDays: true, before: prep('prep/day?n=TODAY') });
  await shoot('prep-result', 'prep', { at: SHABAN, noDays: true, before: prep('prep/result') });
  await shoot('prep-plan', 'prep', { at: SHABAN, noDays: true, before: prep('prep/plan') });
  await shoot('learn', 'learn', {});
  await shoot('quiz', 'learn/quiz?cat=fasting', {});
  await shoot('mcq', 'learn/mcq?cat=all', {});
  await shoot('flash', 'learn/flash?deck=duas', {});
  await shoot('daily', 'learn/daily', {});
  await shoot('start', 'learn/start', {});
  await shoot('read', 'learn/start/read?c=what', {});
  await shoot('pray', 'learn/start/pray', { top: '.st-pose, .st-steps, [class*="st-pose"]' });
  await shoot('words', 'learn/start/words', {});
  await shoot('kids', 'today', { settings: { level: 'kids' }, top: '#kd-sky' });
  await shoot('kids-story', 'today', { settings: { level: 'kids' }, top: '#kd-story, .kd-story, [id*="story"]' });
  await shoot('family', 'me/family', {});
  await shoot('buddies', 'me/buddies', {});
  await shoot('me', 'me', { store: badges });
  await shoot('badges', 'me/badges', { store: badges });
  await shoot('settings', 'me/settings', {});
  await shoot('guide', 'me/guide', {});
  await shoot('compete', 'compete', { store: participant });
  await shoot('board', 'compete/board', { store: participant });
  await shoot('goal', 'compete', { store: participant, top: '#or-goal' });
  await shoot('awards', 'compete', { store: participant, top: '#or-awards' });
  await shoot('organise', 'compete/org', {});
  await shoot('org-board', 'compete', { store: organiser });
  await shoot('insights', 'compete', { store: organiser, before: tab('insights'), top: '.cl-tabs' });
  await shoot('roster', 'compete', { store: organiser, before: tab('roster'), top: '.cl-tabs' });
  await shoot('org-settings', 'compete', { store: organiser, before: tab('settings'), top: '.cl-tabs' });
  await shoot('org-tools', 'compete', { store: organiser, before: tab('tools'), top: '.cl-tabs' });
  await shoot('manage', 'compete', { store: organiser, before: tab('manage'), top: '#or-awards' });
  await shoot('people', 'compete', { store: organiser, before: tab('manage'), top: '#or-people' });
  await shoot('signups', 'compete', { store: organiser, before: tab('manage'), top: '#or-signups' });
  if (slug) await shoot('league', 'league?s=' + slug, { store: participant });

  /* ---- other languages (smaller: they sit in a row) */
  for (const lang of ['ar', 'ur', 'bn', 'tr', 'id', 'zh', 'fr']) await shoot('lang-' + lang, 'today', { settings: { lang }, scale: 1.5 });

  /* ---- a tablet or TV on the wall */
  await shoot('display', 'display', { viewport: { width: 1180, height: 700 }, scale: 1.25 });

  /* ---- pages to print or share */
  await shoot('paper-poster', BASE + '/poster/' + code, paper);
  await shoot('paper-certs', BASE + '/api/comp/' + code + '/certs', Object.assign({ auth: head.token }, paper));
  await shoot('paper-slips', BASE + '/api/comp/' + code + '/slips', Object.assign({ auth: head.token }, paper));
  await shoot('paper-checkin', BASE + '/api/comp/' + code + '/checkin', Object.assign({ auth: head.token }, paper));
  await shoot('paper-public', BASE + '/o/' + code, paper);
  if (slug) await shoot('paper-league', BASE + '/l/' + slug, paper);
  await shoot('paper-report', 'compete', { store: organiser, kind: 'paper', scale: 1.25, before: async p => { await tab('manage')(p); await p.waitForTimeout(2200); return popup(x => x.click('#or-awards button:has-text("Print")'))(p); } });
  await shoot('paper-timetable', 'today', { kind: 'paper', scale: 1.25, before: popup(x => x.evaluate(() => RS.runAct('tl.timetable'))) });
  await shoot('paper-kids-cert', 'me', { settings: { level: 'kids' }, kind: 'paper', scale: 1.25, before: popup(x => x.evaluate(() => RS.runAct('kd.cert'))) });
  await shoot('paper-kids-chart', 'me', { settings: { level: 'kids' }, kind: 'paper', scale: 1.25, before: popup(x => x.evaluate(() => RS.runAct('kd.chart'))) });

  /* ---- numbers into the page, then the picture social networks show for it */
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'); const version = (sw.match(/VERSION = '([^']+)'/) || [])[1] || '';
  let n = patchPage(sizes);
  if (!ONLY || ONLY.indexOf('og') >= 0) {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 }); const page = await ctx.newPage();
    await page.goto(BASE + '/product/index.html?og=1', { waitUntil: 'networkidle' }).catch(() => {}); await settle(page, 1500);
    fs.writeFileSync(path.join(OUT, 'og.jpg'), await page.screenshot({ type: 'jpeg', quality: 86 })); sizes.og = { w: 1200, h: 630 }; await ctx.close();
    console.log('  og.jpg');
  }
  await browser.close();
  n = patchPage(sizes);
  fs.writeFileSync(path.join(ROOT, 'product', 'shots.json'), JSON.stringify({ taken: new Date().toISOString().slice(0, 10), version, numbers: n, sizes }, null, 1) + '\n');
  const total = fs.readdirSync(OUT).reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
  console.log('done: ' + Object.keys(sizes).length + ' images, ' + (total / 1048576).toFixed(1) + ' MB, app ' + version + ', ' + n.features + ' features counted');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
