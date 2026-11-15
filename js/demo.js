/* =====================================================================================================
   Ramadan Strivers v8 — demo.js: the live demo on the product page (the app opened with ?demo=1).

   Safety  The first script in index.html has already replaced the browser's storage with a copy kept in memory
           (and stopped the page if it could not), so the visitor's own data is never read or written, and
           statistics are off. This file answers every /api/ call itself from sample data: no account, no sync,
           no real competition is touched. The one call that reaches the server is the city search (read only).
   Sample  The 12th day of a Ramadan: eleven days already logged and today just begun, Quran pages, badges,
           prayer times for the largest city in the visitor's time zone, two buddies, and a place in a school
           competition whose leaderboard, weekly awards and league table answer to what the visitor ticks.
           The clock is moved to that day (same time of day), so dates, prayer times and the week all agree.
   Steer   The product page drives the app with window.postMessage({ type: 'rs-demo', go | theme | lang | level })
           from an allowed origin, and is told when the app is ready, which screen is open and where the visitor
           stands on the leaderboard. ?fresh=1 starts the sample month again; ?kids=1 starts in kids mode.
   Nothing in this file runs outside demo mode.
   ===================================================================================================== */
(function () {
  'use strict';
  var D = window.RS_DEMO;
  if (!D) return;
  var RS = window.RS, C = RS.content, LS = window.localStorage;
  var DAY = 12, CODE = 'DEMO01', ME = 1, SLUG = 'schools-ramadan-league', SCHOOL = 'Al-Noor Academy';
  function put(k, v) { LS.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }
  function read(k) { try { return JSON.parse(LS.getItem(k) || 'null'); } catch (e) { return null; } }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }

  /* ------------------------------------------------------------------ the clock: today is the 12th of Ramadan */
  // The next date (today included) that the app's own calendar calls the 12th of Ramadan, at this time of day.
  var RealDate = Date, shift = 0;
  (function () {
    var now = new RealDate();
    for (var k = 0; k < 400; k++) {
      var d = new RealDate(now.getFullYear(), now.getMonth(), now.getDate() + k, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      var h = RS.hijri(d, 0);
      if (h.month === 9 && h.day === DAY) { shift = d.getTime() - now.getTime(); break; }
    }
  })();
  function Clock(y, mo, d, h, mi, s, ms) {
    var n = arguments.length;
    if (!(this instanceof Clock)) return new RealDate(RealDate.now() + shift).toString();
    if (n === 0) return new RealDate(RealDate.now() + shift);
    if (n === 1) return new RealDate(y);
    return new RealDate(y, mo, n > 2 ? d : 1, n > 3 ? h : 0, n > 4 ? mi : 0, n > 5 ? s : 0, n > 6 ? ms : 0);
  }
  Clock.prototype = RealDate.prototype;
  Clock.now = function () { return RealDate.now() + shift; };
  Clock.parse = RealDate.parse;
  Clock.UTC = RealDate.UTC;
  window.Date = Clock;
  function iso(daysAgo) { return new Date(Date.now() - daysAgo * 864e5).toISOString(); }
  function ymd(daysAgo) { var d = new Date(Date.now() - daysAgo * 864e5), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

  /* ------------------------------------------------------------------ the sample month (written once) */
  var PAGES = { 1: 20, 2: 18, 3: 22, 4: 20, 5: 16, 6: 20, 7: 24, 8: 20, 9: 14, 10: 20, 11: 22, 12: 6 };
  var TODAY = ['fajr-sunnah', 'fajr', 'morning-adhkar', 'istighfar', 'intention', 'quran-recitation', 'no-lying', 'dhuhr'];
  function seed() {
    var now = Date.now(), deeds = Object.keys(C.deeds).filter(function (k) { return C.deeds[k].sec !== 'lastTen'; });   // those appear from day 21
    for (var d = 1; d <= DAY; d++) {
      var ck = {}, done = 0, pts = 0;
      deeds.forEach(function (id, i) {
        // Days 1 to 11: about two thirds done, Fajr and Quran every day, charity on ten days, one day with all four
        // of the Abu Bakr deeds (so the badges below are really earned). Today: a few done, the rest are the visitor's.
        var on = d < DAY ? ((d * 3 + i) % 4 !== 0 && (d + i) % 9 !== 0) || id === 'fajr' || id === 'quran-recitation' || (id === 'charity-given' && d <= 10) || (d === 7 && C.deeds[id].sec === 'abuBakr')
          : TODAY.indexOf(id) >= 0;
        ck[id] = !!on;
        if (on) { done++; pts += C.deeds[id].pts; }
      });
      put('rs-day-' + d, { ck: ck, ts: now - (DAY - d) * 864e5, hayd: false, done: done, tot: deeds.length, pct: Math.round(done / deeds.length * 100), pts: pts, day: d });
    }
    put('rs-quran-pages', PAGES);
    put('rs-quiz-stats', { ans: 64, cor: 51 });
    put('rs-quiz-best', { fasting: 90, quran: 80, salah: 70 });
    put('rs-badges', { firstStep: { u: 1, d: iso(11) }, weekOne: { u: 1, d: iso(5) }, fajrWarrior: { u: 1, d: iso(5) }, abuBakr: { u: 1, d: iso(5) }, generous: { u: 1, d: iso(2) } });
    put('rs-comp', { role: 'participant', code: CODE, token: 'demo', name: 'Guest', grp: '7A', cname: SCHOOL });
    put('rs-buddy', { follow: [{ code: 'AISHA123', name: 'Aisha' }, { code: 'HAMZA456', name: 'Hamza' }] });
  }
  if (D.fresh) seed();
  if (D.kids && RS.settings.level !== 'kids') { RS.settings.level = 'kids'; RS.saveSettings(); }

  // Prayer times for where the visitor is: the largest city in their time zone (the list is sorted by population).
  function place() {
    if (isObj(RS.settings.prayer) || !RS.CITIES || !RS.cloud || !RS.cloud.prayer) return;
    var tz = '', list = RS.CITIES, city = null, i;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { tz = ''; }
    for (i = 0; i < list.length && !city; i++) if (list[i][5] === tz) city = list[i];
    for (i = 0; i < list.length && !city; i++) if (list[i][0] === 'Mecca' || list[i][0] === 'Makkah') city = list[i];
    if (!city) return;
    var use = RS.cloud.prayer.suggest(city[2]);
    var p = { lat: city[3], lng: city[4], method: use.method, tz: city[5], city: { n: city[0], r: city[1], c: city[2] } };
    if (use.madhab === 'hanafi') p.madhab = 'hanafi';
    RS.settings.prayer = p;
    RS.saveSettings();
  }
  RS.on('boot', function () {
    if (!D.fresh) return;
    if (RS.CITIES) place();
    else RS.lazy('data/cities.js').then(function () { place(); RS.emit('data', { source: 'cloud' }); }, function () { /* no prayer times in the demo, then */ });
  });

  /* ------------------------------------------------------------------ the sample competition, added up as the server does */
  var WEEKS = [[1, 7], [8, 14], [15, 21], [22, 30]], BONUS = [12, 27], HARD_MAX = 800, MIN_ACTIVE = 5;
  function int(v, lo, hi) { v = parseInt(v, 10) || 0; return Math.max(lo, hi == null ? v : Math.min(hi, v)); }
  function logged(x) { return !!x && ((x.t || 0) > 0 || (x.p || 0) > 0 || (x.q || 0) > 0); }
  // api/_lib/comp.js applyScore: the organiser's bonus days count double, and the doubled value is what is kept.
  function applyScore(days) {
    var clean = {}, total = 0, n = 0, pct = 0, pages = 0;
    Object.keys(isObj(days) ? days : {}).forEach(function (k) {
      var dn = parseInt(k, 10);
      if (!(dn >= 1 && dn <= 30)) return;
      var x = days[k] || {}, p = int(x.p, 0, 100), t = int(x.t, 0), q = int(x.q, 0, 700), tt = Math.min(t, HARD_MAX) * (BONUS.indexOf(dn) >= 0 ? 2 : 1);
      clean[dn] = { p: p, t: tt, q: q };
      if (p > 0 || t > 0 || q > 0) { n++; pct += p; total += tt; pages += q; }
    });
    return { days: clean, totalPts: total, daysLogged: n, avgPct: n ? Math.round(pct / n) : 0, quranPages: pages };
  }
  // Eleven classmates: steady ones, strong ones, and a few who miss a day. Half have logged something today.
  var NAMES = [['Hana T.', '7B', 418], ['Zaid M.', '7A', 396], ['Fatima Z.', '7A', 371], ['Yusuf A.', '7B', 352], ['Ibrahim N.', '7A', 330], ['Noor P.', '7B', 318],
    ['Idris L.', '7A', 301], ['Safiya D.', '7B', 286], ['Bilal R.', '7B', 262], ['Maryam H.', '7A', 244], ['Omar S.', '7B', 215]];
  function classmate(x, k) {
    var days = {}, base = x[2];
    for (var n = 1; n <= DAY; n++) {
      if (k > 2 && (n + k * 2) % 11 === 0) continue;                         // a missed day
      if (n === DAY && k % 2) continue;                                      // not logged yet today
      var t = n === DAY ? Math.round(base * 0.4) : base + ((n * 37 + k * 53) % 61) - 30;
      days[n] = { p: Math.min(100, Math.round(t / 471 * 100)), t: t, q: n === DAY ? 4 + (k % 5) : 8 + ((n + k * 5) % 14) };
    }
    return { id: k + 2, name: x[0], grp: x[1], s: applyScore(days) };
  }
  var mem = read('rs-comp'), me = { id: ME, name: (isObj(mem) && mem.name) || 'Guest', grp: (isObj(mem) && mem.grp) || '7A', s: applyScore({}) };
  var others = NAMES.map(classmate);
  function everyone() { return [me].concat(others); }
  function publicComp() {
    return { code: CODE, name: SCHOOL, type: 'School', prizes: ['A day out for the class', 'Book voucher', 'Book voucher'], open: true, created_at: iso(20),
      settings: { dailyCap: null, teams: true, donateUrl: '', sponsor: 'Al-Noor Trust', message: 'Jumuah mubarak. Double points today.', messageAt: iso(0.2), endDay: 30,
        goal: { k: 'q', n: 3000 }, custom: [{ id: 'c1', label: 'Help set up iftar', pts: 12 }, { id: 'c2', label: 'Tidy the prayer hall', pts: 8 }], bonus: BONUS,
        charity: { target: 2000, raised: 1340, currency: 'GBP', cause: 'Water wells' }, country: 'GB', verified: true, under13: false } };
  }
  function rowPublic(p, i) { return { rank: i + 1, id: p.id, name: p.name, grp: p.grp, totalPts: p.s.totalPts, daysLogged: p.s.daysLogged, avgPct: p.s.avgPct, quranPages: p.s.quranPages, flagged: false }; }
  function board(withMe) {
    var rows = everyone().sort(function (a, b) { return b.s.totalPts - a.s.totalPts || b.s.quranPages - a.s.quranPages || (a.name < b.name ? -1 : 1); });
    var ind = rows.map(rowPublic), g = {};
    ind.forEach(function (r) { if (!r.grp) return; var o = g[r.grp] = g[r.grp] || { grp: r.grp, members: 0, totalPts: 0, quranPages: 0, pct: 0 }; o.members++; o.totalPts += r.totalPts; o.quranPages += r.quranPages; o.pct += r.avgPct; });
    var groups = Object.keys(g).map(function (k) { var o = g[k]; return { grp: o.grp, members: o.members, totalPts: o.totalPts, avgPts: Math.round(o.totalPts / o.members), quranPages: o.quranPages, avgPct: Math.round(o.pct / o.members) }; })
      .sort(function (a, b) { return b.avgPts - a.avgPts; }).map(function (o, i) { return Object.assign({ rank: i + 1 }, o); });
    return { competition: publicComp(), individuals: ind, groups: groups, me: withMe ? ind.filter(function (r) { return r.id === ME; })[0] || null : null, participants: ind.length };
  }
  function place_() { var s = read('rs-comp'); if (!isObj(s) || s.role !== 'participant' || String(s.code).toUpperCase() !== CODE) return null; var b = board(true); return b.me ? { rank: b.me.rank, of: b.participants, pts: b.me.totalPts } : null; }
  function weekSum(days, w) {
    var r = WEEKS[w - 1], t = 0, n = 0, pct = 0, pages = 0;
    for (var d = r[0]; d <= r[1]; d++) { var x = days[d]; if (logged(x)) { t += x.t || 0; n++; pct += x.p || 0; pages += x.q || 0; } }
    return { t: t, n: n, pct: n ? Math.round(pct / n) : 0, pages: pages };
  }
  function awards(week) {
    var w = week >= 1 && week <= WEEKS.length ? week : (DAY <= 7 ? 1 : DAY <= 14 ? 2 : DAY <= 21 ? 3 : 4);
    var list = everyone().map(function (p) { var cur = weekSum(p.s.days, w), prev = w > 1 ? weekSum(p.s.days, w - 1) : null; return { name: p.name, grp: p.grp, pts: cur.t, days: cur.n, pct: cur.pct, pages: cur.pages, gain: prev ? cur.t - prev.t : 0 }; })
      .filter(function (x) { return x.days > 0; });
    var first = function (a) { return a[0] || null; }, g = {};
    list.forEach(function (x) { if (!x.grp) return; var o = g[x.grp] = g[x.grp] || { grp: x.grp, members: 0, pts: 0 }; o.members++; o.pts += x.pts; });
    return { competition: { code: CODE, name: SCHOOL }, week: w, weeks: WEEKS.length, days: WEEKS[w - 1], today: DAY, active: list.length,
      top: list.slice().sort(function (a, b) { return b.pts - a.pts; }).slice(0, 3),
      improved: w > 1 ? first(list.filter(function (x) { return x.gain > 0; }).sort(function (a, b) { return b.gain - a.gain; })) : null,
      consistent: first(list.slice().sort(function (a, b) { return b.days - a.days || b.pct - a.pct; })),
      quran: first(list.filter(function (x) { return x.pages > 0; }).sort(function (a, b) { return b.pages - a.pages; })),
      team: first(Object.keys(g).map(function (k) { return { grp: k, members: g[k].members, avgPts: Math.round(g[k].pts / g[k].members) }; }).sort(function (a, b) { return b.avgPts - a.avgPts; })) };
  }
  // One organisation's line in a table: the average points of those who have started (api/_lib/comp.js standing).
  function standing(from, to) {
    var all = everyone(), active = 0, pts = 0, pages = 0;
    all.forEach(function (p) {
      if (from) { var t = 0, n = 0, pg = 0; for (var d = from; d <= to; d++) { var x = p.s.days[d]; if (x && ((x.t || 0) > 0 || (x.q || 0) > 0)) { t += x.t || 0; pg += x.q || 0; n++; } } if (n) { active++; pts += t; pages += pg; } }
      else if (p.s.daysLogged > 0) { active++; pts += p.s.totalPts; pages += p.s.quranPages; }
    });
    return { participants: all.length, active: active, totalPts: pts, avgPts: active ? Math.round(pts / active) : 0, quranPages: pages, avgPages: active ? Math.round(pages / active * 10) / 10 : 0 };
  }
  var LEAGUE = { slug: SLUG, name: 'Schools Ramadan League', country: 'United Kingdom', about: 'Schools and mosques side by side.', open: true };
  function leagueTable() {
    var us = standing(), ch = publicComp().settings.charity;
    var out = [Object.assign({ code: CODE, name: SCHOOL, type: 'School', division: 'Secondary school', verified: true }, us, { charity: { raised: ch.raised, target: ch.target, currency: ch.currency, pct: Math.round(ch.raised / ch.target * 100) } }),
      { code: 'MADINA', name: 'Madina High School', type: 'School', division: 'Secondary school', verified: false, participants: 9, active: 8, totalPts: 27960, avgPts: 3495, quranPages: 1712, avgPages: 214, charity: { raised: 600, target: 1500, currency: 'GBP', pct: 40 } },
      { code: 'SALAM1', name: 'Masjid As-Salam Youth', type: 'Mosque', division: 'Mosque', verified: false, participants: 6, active: 6, totalPts: 22110, avgPts: 3685, quranPages: 1398, avgPages: 233, charity: null }];
    var div = {};
    out.forEach(function (o) { (div[o.division] = div[o.division] || []).push(o); });
    Object.keys(div).forEach(function (k) {
      var ranked = div[k].filter(function (o) { return o.active >= MIN_ACTIVE; }).sort(function (a, b) { return b.avgPts - a.avgPts || b.avgPages - a.avgPages; });
      div[k] = ranked.map(function (o, i) { return Object.assign({ rank: i + 1 }, o); });
    });
    return { league: LEAGUE, minActive: MIN_ACTIVE, organisations: out.length, participants: out.reduce(function (a, o) { return a + o.participants; }, 0),
      divisions: ['Secondary school', 'Mosque'].map(function (k) { return { name: k, rows: div[k] }; }),
      charity: out.filter(function (o) { return o.charity; }).sort(function (a, b) { return b.charity.pct - a.charity.pct; }).map(function (o, i) { return { rank: i + 1, code: o.code, name: o.name, raised: o.charity.raised, target: o.charity.target, currency: o.charity.currency, pct: o.charity.pct }; }) };
  }
  var signups = [{ id: 1, title: 'Dates for Friday iftar', day: 'Friday', slots: 3, taken: [{ name: 'Fatima Z.', pid: 4 }] },
    { id: 2, title: 'Help serve at the community iftar', day: 'Saturday', slots: 6, taken: [{ name: 'Maryam H.', pid: 11 }, { name: 'Hana T.', pid: 2 }] }];
  // Two buddies who shared their link, and the visitor's own link once they make one.
  var buddies = { AISHA123: { name: 'Aisha', summary: { d: DAY, p: 74, s: 9, dl: 12, q: 236, m: 'ramadan', last: ymd(0) } }, HAMZA456: { name: 'Hamza', summary: { d: DAY, p: 52, s: 3, dl: 10, q: 141, m: 'ramadan', last: ymd(1) } } };
  var bs = read('rs-buddy'), mine = isObj(bs) && isObj(bs.mine) ? bs.mine : null;
  if (mine && mine.code) buddies[String(mine.code).toUpperCase()] = { name: mine.name || 'Guest', summary: {}, nudges: [], own: true };

  /* ------------------------------------------------------------------ the server, played by this file */
  function off() { return [403, { error: 'demo', message: RS.t('demo.off') }]; }
  var NOT_FOUND = [404, { error: 'not_found', message: 'Not found' }];
  function answer(path, method, qs, body) {
    body = isObj(body) ? body : {};
    if (path === 'health') return [200, { ok: true, flags: {}, db: true, dbOk: true, dbErr: null, features: { accounts: true, competitions: true, buddies: true, sync: true, email: false, ai: false, push: false, whatsapp: false } }];
    var m = /^comp\/([A-Za-z0-9]{1,12})(?:\/([a-z]+))?$/.exec(path), b;
    if (m) {
      if (m[1].toUpperCase() !== CODE) return [404, { error: 'not_found', message: 'Competition not found. Check the code.' }];
      var what = m[2] || '';
      if (!what) return method === 'GET' ? [200, { competition: Object.assign(publicComp(), { participants: others.length + 1 }) }] : off();
      if (what === 'board' && method === 'GET') return [200, board(!!qs.get('token'))];
      if (what === 'score' && (method === 'PUT' || method === 'POST')) { me.s = applyScore(body.days); setTimeout(tell, 0); return [200, { ok: true, totals: { totalPts: me.s.totalPts, daysLogged: me.s.daysLogged, avgPct: me.s.avgPct, quranPages: me.s.quranPages }, flagged: false }]; }
      if (what === 'join' && method === 'POST') {
        if (!body.token && !String(body.name || '').trim()) return [400, { error: 'name_required', message: 'Display name required' }];
        if (String(body.name || '').trim()) me.name = String(body.name).trim().slice(0, 40);
        if (typeof body.grp === 'string') me.grp = body.grp.trim().slice(0, 40);
        setTimeout(tell, 300);
        return [200, { token: 'demo', participant: { id: ME, name: me.name, grp: me.grp }, competition: publicComp() }];
      }
      if (what === 'awards' && method === 'GET') return [200, awards(parseInt(qs.get('week'), 10) || 0)];
      if (what === 'challenge' && method === 'GET') { var a = standing(8, 14); return [200, { challenges: [{ id: 1, status: 'active', startDay: 8, endDay: 14, a: { code: CODE, name: SCHOOL, avgPts: a.avgPts, active: a.active }, b: { code: 'MADINA', name: 'Madina High School', avgPts: 1385, active: 8 } }] }]; }
      if (what === 'signups' && method === 'GET') return [200, { signups: signups }];
      if (what === 'signups' && method === 'PATCH') {
        var it = signups.filter(function (x) { return x.id === (parseInt(body.id, 10) || 0); })[0];
        if (!it) return NOT_FOUND;
        it.taken = it.taken.filter(function (x) { return x.pid !== ME; });
        if (body.action !== 'leave') { if (it.taken.length >= it.slots) return [409, { error: 'full', message: 'All places are taken' }]; it.taken.push({ pid: ME, name: me.name }); }
        return [200, { signup: it }];
      }
      return off();                                  // the organiser's tools
    }
    if (path === 'league' && method === 'GET') {
      var ours = String(qs.get('code') || '').toUpperCase() === CODE;
      return [200, { divisions: ['Primary school', 'Secondary school', 'University', 'Mosque', 'Community', 'Family'],
        leagues: [{ slug: LEAGUE.slug, name: LEAGUE.name, country: LEAGUE.country, about: LEAGUE.about, organisations: 3, status: ours ? 'approved' : null, division: ours ? 'Secondary school' : null }] }];
    }
    if (path === 'league/' + SLUG && method === 'GET') return [200, leagueTable()];
    if (path.indexOf('league/') === 0 && method === 'GET') return [404, { error: 'not_found', message: 'League not found' }];
    if (path === 'buddy' && method === 'POST') {
      var name = String(body.name || '').trim().slice(0, 24);
      if (!name) return [400, { error: 'name_required', message: 'Enter a display name' }];
      buddies.GUEST123 = { name: name, summary: isObj(body.summary) ? body.summary : {}, nudges: [], own: true };
      return [201, { code: 'GUEST123', token: 'demo', name: name }];
    }
    m = /^buddy\/([A-Za-z0-9]{1,12})(\/nudge)?$/.exec(path);
    if (m) {
      var code = m[1].toUpperCase();
      b = buddies[code];
      if (!b) return [404, { error: 'not_found', message: 'This buddy link is no longer active.' }];
      if (m[2]) return method === 'POST' ? [201, { ok: true }] : off();
      if (method === 'GET') { var pub = { code: code, name: b.name, summary: b.summary || {}, updatedAt: iso(0) }; if (b.own && qs.get('t')) pub.nudges = b.nudges; return [200, pub]; }
      if (!b.own) return [403, { error: 'forbidden', message: 'Only the owner can do this' }];
      if (method === 'DELETE') { delete buddies[code]; return [200, { deleted: true }]; }
      if (method === 'PUT') {
        if (body.name !== undefined) b.name = String(body.name).trim().slice(0, 24) || b.name;
        if (body.summary !== undefined) b.summary = isObj(body.summary) ? body.summary : {};
        // a buddy answers once the link exists, so the visitor sees what an encouragement looks like
        if (body.ack) { b.nudges = []; b.acked = true; } else if (!b.acked && !b.nudges.length) b.nudges = [{ k: 'dua', from: 'Aisha', at: Date.now() }];
        return [200, { code: code, name: b.name, summary: b.summary, updatedAt: iso(0), nudges: b.nudges }];
      }
    }
    return off();                                    // accounts, sync, share links, alerts, AI help, the admin area
  }
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var u = null;
    try { u = new URL(typeof input === 'string' ? input : (input && input.url) || '', location.href); } catch (e) { u = null; }
    if (!u || u.origin !== location.origin || u.pathname.indexOf('/api/') !== 0) return realFetch ? realFetch(input, init) : Promise.reject(new TypeError('network'));
    var path = u.pathname.replace(/^\/api\//, '').replace(/\/+$/, '');
    if (path === 'geo') return realFetch ? realFetch(input, init) : Promise.reject(new TypeError('network'));   // the city search only reads
    var method = String((init && init.method) || 'GET').toUpperCase(), body = null;
    try { body = init && typeof init.body === 'string' && init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
    return new Promise(function (resolve) {
      setTimeout(function () {
        var r;
        try { r = answer(path, method, u.searchParams, body); } catch (e) { r = [500, { error: 'server', message: 'Demo error' }]; }
        resolve(new Response(JSON.stringify(r[1]), { status: r[0], headers: { 'Content-Type': 'application/json' } }));
      }, 120);
    });
  };
  // Pages the real server makes (the QR poster, an organisation's public page, a league's page, a share link) do not
  // exist for the sample school: say so instead of opening a page that is not there.
  var realOpen = window.open;
  window.open = function (url) {
    var path = '';
    try { path = url ? new URL(String(url), location.href).pathname : ''; } catch (e) { path = ''; }
    if (/^\/(poster|o|l|s|api)\//.test(path)) {
      RS.toast(RS.t('demo.off'));
      return { closed: true, opener: null, close: function () {}, focus: function () {}, location: {}, document: { open: function () {}, write: function () {}, close: function () {}, title: '', body: null } };
    }
    return realOpen.apply(window, arguments);
  };

  /* ------------------------------------------------------------------ on its own page: a label and a way out */
  var framed = window.top !== window.self;
  function label() {
    var old = document.getElementById('demo-pill');
    if (old) old.parentNode.removeChild(old);
    if (framed || !document.body) return;            // inside the product page, the page itself says it is a demo
    if (!document.getElementById('demo-css')) {
      var css = document.createElement('style');
      css.id = 'demo-css';
      css.textContent = '#demo-pill{position:fixed;z-index:40;inset-inline:0;bottom:calc(84px + env(safe-area-inset-bottom));display:flex;justify-content:center;pointer-events:none}' +
        '#demo-pill>div{pointer-events:auto;display:flex;align-items:center;gap:10px;padding:5px 5px 5px 14px;border-radius:999px;background:#0B2219;color:#A7F3D0;box-shadow:0 8px 24px rgba(4,24,17,.32);font:700 12px/1.2 Manrope,system-ui,sans-serif}' +
        '[dir=rtl] #demo-pill>div{padding:5px 14px 5px 5px}#demo-pill span{letter-spacing:.08em;text-transform:uppercase}' +
        '#demo-pill a{padding:7px 12px;border-radius:999px;background:#A7F3D0;color:#0B2219;text-decoration:none;font-size:13px}#demo-pill a:focus-visible{outline:2px solid #fff;outline-offset:2px}';
      document.head.appendChild(css);
    }
    var pill = document.createElement('div');
    pill.id = 'demo-pill';
    pill.innerHTML = '<div role="note"><span>' + RS.esc(RS.t('demo.label')) + '</span><a href="/">' + RS.esc(RS.t('demo.open')) + '</a></div>';
    document.body.appendChild(pill);
  }

  /* ------------------------------------------------------------------ steering from the product page */
  var ALLOWED = /^https:\/\/([a-z0-9-]+\.)?ramadanstrivers\.com$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  function trusted(origin) { return origin === location.origin || ALLOWED.test(origin); }
  function state() {
    var c = RS.router.current();
    return { type: 'rs-demo', route: (c && c.route) || '', lang: RS.lang(), theme: document.documentElement.getAttribute('data-theme') || RS.settings.theme, level: RS.settings.level === 'kids' ? 'kids' : 'adult', place: place_(), code: CODE };
  }
  function tell(extra) {
    if (!framed) return;
    try { window.parent.postMessage(Object.assign(state(), extra || {}), '*'); } catch (e) { /* alone */ }   // nothing private: the screen, the language, the theme, the sample score
  }
  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!isObj(m) || m.type !== 'rs-demo' || e.source !== window.parent || !trusted(e.origin)) return;
    if (m.level === 'kids' || m.level === 'adult') RS.runAct('tr.level', m.level);
    if (m.theme === 'dark' || m.theme === 'light') RS.runAct('tr.theme', m.theme);
    if (typeof m.lang === 'string' && RS.LANGS.some(function (l) { return l.code === m.lang; })) RS.setLang(m.lang);
    if (typeof m.go === 'string' && /^[a-z]{2,12}(\/[a-z]{2,12}){0,2}$/.test(m.go)) { RS.router.go(m.go); window.scrollTo(0, 0); }
    if (m.ask) tell();
  });
  RS.on('boot', function () { label(); });
  RS.on('route', function () { setTimeout(tell, 0); });
  RS.on('lang', function () { label(); setTimeout(tell, 0); });
  RS.on('theme', function () { setTimeout(tell, 0); });
  RS.on('act', function (a) { if (a && a.name === 'tr.level') setTimeout(tell, 0); });
  RS.on('boot', function () {
    setTimeout(function () {
      try { if (RS.cloud && RS.cloud.agg) me.s = applyScore(RS.cloud.agg().days); } catch (e) { /* the first score sync fills it in */ }
      tell({ ready: true });
    }, 0);
  });
})();
