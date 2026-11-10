/* =====================================================================================================
   Ramadan Strivers v8 — tracker.js (tracker module)
   Routes   today · today/preview · quran · me · me/settings · me/guide · me/badges · me/day?n=
   Owns     the daily checklist (Ramadan days and year-round dates), points, streaks, badges, sisters' mode,
            journal, year-round cards (Sunnah fasts, Shawwal, Dhul Hijjah), the "My Ramadan plan" card
            (intentions, dua list, qada), the Quran log, progress, the Eid report (PDF), settings, backup.
   Storage  (v6/v7 compatible) rs-day-<1..30> {day, ck, ts, hayd, done, tot, pct, pts, hck?} · rs-yr-<YYYY-MM-DD> ·
            rs-quran-pages {day: pages} · rs-badges {id: {u, d}} · rs-best-streaks · rs-season ·
            rs-archive-<year> · rs-inst-x · rs-extras {journal, goals, duas, qada, fasts, shawwal, dhulhijjah,
            qlog (year-round Quran log by date, shared with the prep module's Quran check-in)}.
            hck (new in v8, ignored by v7): the prayer and fasting ticks set aside while sisters' mode is on; they are
            not counted and come back when sisters' mode is turned off.
   Import   merges by key: each day, date, Quran-page day, journal entry and setting in the file replaces the same
            one here; everything else on the device is kept (see applyImport).
   Events   every write of tracker data (day records, Quran pages, rs-extras, badges, best streaks, synced settings)
            is followed by RS.emit('data', {source: 'tracker'}). Exception: view state kept in rs-settings (which
            sections are open, the Ramadan day being viewed, the reminder date), rs-season and rs-inst-x are saved
            silently; none of them is part of the cloud snapshot, and a day change emits 'day'.
   Hooks    RS.tracker (CONTRACT §8): getDay(n) · todayIndex() · totals() · streaks() · qPages()
            + saveDay() · dayPct(n) · points() · best() · renderTodayChecklist(el)
   Rules    v7 behaviour, with the fact-check corrections: each night comes before its day, so the odd nights
            21, 23, 25, 27, 29 begin at sunset on days 20, 22, 24, 26, 28; streak names are Fajr, Isha, Quran,
            Charity; the Ramadan thirds are labelled by day ranges only.
   ===================================================================================================== */
(function () {
  'use strict';
  var RS = window.RS;
  if (!RS || !RS.router || !RS.ui) return;
  var ui = RS.ui, esc = RS.esc;
  var T = RS.tracker = RS.tracker || {};

  var DAYS = 30, Q_TOTAL = 604, PPJ = 604 / 30;
  var JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  var ABU = ['abu-bakr-fasting', 'abu-bakr-funeral', 'abu-bakr-fed', 'abu-bakr-sick'];
  var SK = ['fajr', 'night', 'quran', 'charity'];
  var SICON = { fajr: 'sunrise', night: 'moon', quran: 'book-open', charity: 'hand-heart' };
  var MILESTONES = [3, 5, 7, 10, 14, 20, 25, 30];
  var APPS = { lwa: { name: 'Life with Allah', url: 'https://lifewithallah.com/app' }, trt: { name: 'Tarteel', url: 'https://tarteel.ai/' } };
  var FEEDBACK = 'm.farhan.bava@gmail.com';
  var HAYD_TIPS = 8;

  function t(k, v) { return RS.t(k, v); }
  function tn(k, c, v) { return RS.tn(k, c, v); }
  function nf(x) { return RS.fmt.n(x); }
  function pf(x) { return RS.fmt.pct(x); }
  // '+15' for gains: RS.fmt.signed keeps the sign in front in the RTL UI (core.js), '+' + n where it is missing
  function signed(x) { return typeof RS.fmt.signed === 'function' ? RS.fmt.signed(x) : '+' + nf(x); }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function emit() { RS.emit('data', { source: 'tracker' }); }

  /* ================================================================ content */
  function content() { return RS.content || {}; }
  function sections() { return content().sections || []; }
  function deed(id) { var d = content().deeds; return d && Object.prototype.hasOwnProperty.call(d, id) ? d[id] : null; }
  function secIds(sec) {
    var out = [];
    (sec.subs || []).forEach(function (s) { (s.items || []).forEach(function (id) { if (deed(id)) out.push(id); }); });
    (sec.items || []).forEach(function (id) { if (deed(id)) out.push(id); });
    return out;
  }
  function deedLabel(id) {
    var k = 'deed.' + id + '.kids';
    if (RS.settings.level === 'kids' && RS.has(k)) return t(k);
    return t('deed.' + id + '.label');
  }
  function deedExp(id) { var k = 'deed.' + id + '.exp'; if (!RS.has(k)) return ''; var s = t(k); return s && s.trim() ? s : ''; }
  function badges() { return content().badges || []; }
  function badgeName(id) { return t('badge.' + id + '.name'); }

  /* ================================================================ day records */
  function getObj(key) { var v = RS.store.get(key, null); return isObj(v) ? v : null; }
  // v7 getDay(): accepts v6 field names (checklist, percentage, points, completedCount, totalCount)
  function norm(d) {
    if (!isObj(d)) return null;
    var ck = isObj(d.ck) ? d.ck : (isObj(d.checklist) ? d.checklist : {});
    return { ck: ck, pct: num(d.pct || d.percentage || 0), pts: num(d.pts || d.points || 0), done: num(d.done || d.completedCount || 0),
      tot: num(d.tot || d.totalCount || 0), hayd: !!d.hayd, hck: d.hayd && isObj(d.hck) ? d.hck : null, ts: num(d.ts) };
  }
  function getRec(key) { return norm(RS.store.get(key, null)); }
  T.getDay = function (n) { n = parseInt(n, 10); return n >= 1 && n <= DAYS ? getRec('rs-day-' + n) : null; };
  function allDays() { var r = {}; for (var d = 1; d <= DAYS; d++) r[d] = T.getDay(d); return r; }

  function curDay() { return RS.clamp(parseInt(RS.settings.day, 10) || 1, 1, DAYS); }
  function rCtx(day) { day = RS.clamp(parseInt(day, 10) || curDay(), 1, DAYS); return { kind: 'ramadan', day: day, key: 'rs-day-' + day, l10: day >= 21, mult: day >= 21 ? 1.5 : 1 }; }
  function yCtx(iso) { iso = iso || RS.todayISO(); return { kind: 'year', date: iso, key: 'rs-yr-' + iso, l10: false, mult: 1 }; }
  function checkCtx() { return RS.appMode() === 'year' ? yCtx() : rCtx(); }

  // Year-round dates (not in v7, which showed the whole Ramadan list): no Tarawih, the Ramadan night prayer, and the
  // deeds about the day's fast (dua at iftar, "Who among you is fasting today?", no overeating at iftar, avoiding
  // arguments while fasting) only on a date with a logged fast, so an ordinary day can reach 100%.
  var YEAR_OFF = { tarawih: 1 }, FAST_ONLY = { 'dua-iftar': 1, 'abu-bakr-fasting': 1, 'no-overeating': 1, arguments: 1 };
  function counts(ctx, id) {
    if (ctx.kind !== 'year') return true;
    if (YEAR_OFF[id]) return false;
    if (!FAST_ONLY[id]) return true;
    if (ctx.fast == null) ctx.fast = fastLogged(ctx.date);    // read once per context (yCtx makes a new one each time)
    return ctx.fast;
  }
  function applicable(ctx) {
    var out = [];
    sections().forEach(function (s) { if (s.l10 && !ctx.l10) return; secIds(s).forEach(function (id) { if (counts(ctx, id)) out.push(id); }); });
    return out;
  }
  // v7 saveDay(): every applicable deed is stored (true/false); deeds set aside in sisters' mode are left out of
  // ck, done, tot and points; points ×1.5 on days 21-30. hck keeps the set-aside ticks (see change()).
  // Kept as they are, uncounted: ids this content no longer has, and on a year-round date the ticks of fast-day deeds
  // while no fast is logged (logging the fast again brings them back).
  function build(ctx, ck, hayd, hck) {
    ck = ck || {};
    var out = {}, done = 0, tot = 0, pts = 0;
    Object.keys(ck).forEach(function (id) { if (!deed(id) || (ck[id] && !counts(ctx, id))) out[id] = !!ck[id]; });
    applicable(ctx).forEach(function (id) {
      var d = deed(id);
      if (hayd && d.haydOff) return;
      var on = !!ck[id];
      out[id] = on; tot++;
      if (on) { done++; pts += num(d.pts); }
    });
    var rec = { ck: out, ts: Date.now(), hayd: !!hayd, done: done, tot: tot, pct: tot ? Math.round(done / tot * 100) : 0, pts: Math.round(pts * ctx.mult) };
    if (ctx.kind === 'ramadan') rec.day = ctx.day; else rec.date = ctx.date;
    if (hayd && isObj(hck)) {
      var keep = {};
      Object.keys(hck).forEach(function (id) { if (hck[id] && /^[\w-]{1,60}$/.test(id)) keep[id] = true; });
      if (Object.keys(keep).length) rec.hck = keep;
    }
    return rec;
  }
  function live(ctx) { var r = getRec(ctx.key); return build(ctx, r ? r.ck : {}, r ? r.hayd : false, r ? r.hck : null); }

  /* ================================================================ streaks (v7 calcStreak) */
  var STREAK = {
    fajr: function (c) { return !!(c && c.fajr); },
    night: function (c) { return !!(c && c.isha); },
    quran: function (c) { return !!(c && (c['quran-recitation'] || c['quran-reflection'] || c['quran-listening'])); },
    charity: function (c) { return !!(c && (c['charity-given'] || c['fed-fasting'])); }
  };
  // consecutive days before `day` that satisfy fn, plus `day` itself when it does (today never breaks a streak)
  function calcStreak(fn, day, recs) {
    var s = 0;
    for (var d = day - 1; d >= 1; d--) { var x = recs[d]; if (x && fn(x.ck)) s++; else break; }
    if (recs[day] && fn(recs[day].ck)) s++;
    return s;
  }
  function streaksAt(day, recs) { recs = recs || allDays(); var o = {}; SK.forEach(function (k) { o[k] = calcStreak(STREAK[k], day, recs); }); return o; }
  T.streaks = function () { return streaksAt(curDay()); };
  function bestStored() { var b = getObj('rs-best-streaks') || {}, o = {}; SK.forEach(function (k) { o[k] = Math.max(0, Math.round(num(b[k]))); }); return o; }
  // stores any streak that beats the best so far; true when rs-best-streaks changed
  function saveBest(cur) {
    var b = bestStored(), changed = false;
    SK.forEach(function (k) { if (cur[k] > b[k]) { b[k] = cur[k]; changed = true; } });
    if (changed) RS.store.set('rs-best-streaks', b);
    return changed;
  }
  // the longest run anywhere in the stored days (a day without a record ends a run, as in calcStreak)
  function maxRun(fn, recs) {
    var best = 0, run = 0;
    for (var d = 1; d <= DAYS; d++) { if (recs[d] && fn(recs[d].ck)) { run++; if (run > best) best = run; } else run = 0; }
    return best;
  }
  // best streaks: the stored ones (they outlive an archived season) or a longer run in this season's days, so a best
  // is never shorter than a streak shown next to it (the Eid report's current streaks run to the last logged day)
  T.best = function () { var b = bestStored(), recs = allDays(); SK.forEach(function (k) { b[k] = Math.max(b[k], maxRun(STREAK[k], recs)); }); return b; };
  function streakName(k) { return t('me.streak.' + k); }

  /* ================================================================ badges (v7 chkBdg, exactly) */
  function badgeMap() { return getObj('rs-badges') || {}; }
  function badgeCount(m) { m = m || badgeMap(); return badges().filter(function (b) { return !!m[b.id]; }).length; }
  // Returns the ids unlocked by this change (the caller shows one toast for all of them).
  function checkBadges(day, td, recs) {
    recs = recs || allDays();
    var m = badgeMap(), got = [];
    function unlock(id) { if (!m[id]) { m[id] = { u: 1, d: new Date().toISOString() }; got.push(id); } }
    function count(from, to, fn) { var c = 0; for (var d = from; d <= to; d++) if (recs[d] && fn(recs[d])) c++; return c; }
    var logged = function (x) { return x.pct > 0; };
    if (day === 1 && td.pct > 0) unlock('firstStep');
    if (count(1, 7, logged) >= 7) unlock('weekOne');
    if (count(1, 15, logged) >= 15) unlock('halfway');
    if (calcStreak(STREAK.fajr, day, recs) >= 7) unlock('fajrWarrior');
    if (count(1, 30, function (x) { return !!x.ck.tahajjud; }) >= 7) unlock('nightOwl');
    if (count(1, 30, function (x) { return !!(x.ck['quran-recitation'] || x.ck['quran-reflection']); }) >= 15) unlock('quranLover');
    if (count(1, 30, function (x) { return !!(x.ck['charity-given'] || x.ck['fed-fasting']); }) >= 10) unlock('generous');
    var abc = count(1, 30, function (x) { return ABU.every(function (i) { return !!x.ck[i]; }); });
    if (abc >= 1) unlock('abuBakr');
    if (abc >= 3) unlock('abuBakrG');
    if (count(1, 30, function (x) { return x.pct === 100; }) >= 3) unlock('perfect');
    if (day >= 21) {
      var lt = 0, ld = 0;
      for (var d = 21; d <= 30; d++) if (recs[d]) { lt += recs[d].pct; ld++; }
      if (ld >= 5 && lt / ld >= 70) unlock('l10Hero');
      if (count(1, 30, function (x) { return x.pct >= 60; }) >= 20) unlock('champion');
    }
    if (got.length) RS.store.set('rs-badges', m);
    return got;
  }

  /* ================================================================ Quran */
  function qObj() { return getObj('rs-quran-pages') || {}; }
  function qOf(q, d) { var v = num(q[d]); return v > 0 ? v : 0; }
  function qTotal(q) { q = q || qObj(); var s = 0; for (var d = 1; d <= DAYS; d++) s += qOf(q, d); return s; }
  T.qPages = function () { var q = qObj(), o = {}; for (var d = 1; d <= DAYS; d++) { var v = qOf(q, d); if (v) o[d] = v; } return o; };
  function juzOf(pages) { return pages <= 0 ? 1 : Math.min(30, Math.ceil(pages / PPJ)); }

  /* ================================================================ extras (rs-extras) */
  function extras() { return getObj('rs-extras') || {}; }
  function setExtra(section, key, val, silent) {
    var x = extras();
    if (key == null) x[section] = val;
    else { if (!isObj(x[section])) x[section] = {}; x[section][key] = val; }
    RS.store.set('rs-extras', x);
    if (!silent) emit();
  }
  function qlog() { var q = extras().qlog; return isObj(q) ? q : {}; }
  function qlogOf(log, iso) { var e = log[iso]; return Math.max(0, Math.round(num(isObj(e) ? e.p : e))); }
  function jKey(ctx) { return ctx.kind === 'year' ? ctx.date : 'r' + ctx.day; }
  function jGet(key) { var j = extras().journal; j = isObj(j) ? j[key] : null; return isObj(j) ? j : {}; }
  function jSet(key, patch, silent) {
    var cur = jGet(key), v = { t: cur.t || '', p: cur.p || '', ts: Date.now() };
    Object.keys(patch).forEach(function (k) { v[k] = patch[k]; });
    setExtra('journal', key, v, silent);
    return v;
  }
  function duaLines() { var d = extras().duas; var s = isObj(d) ? String(d.t || '') : ''; return s.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }

  /* ================================================================ Hijri, nights, modes */
  // Local noon of today + n days: stepping by 24h from noon never skips or repeats a date across DST changes.
  function noonPlus(n) { var d = new Date(); d.setHours(12, 0, 0, 0); return new Date(d.getTime() + (n || 0) * 86400000); }
  function liveDay() { var h = RS.hijri(); return h.month === 9 ? RS.clamp(h.day, 1, 30) : 0; }
  // Before dawn the current night still belongs to the coming day (night N precedes day N).
  function preDawn(now) {
    now = now || new Date();
    try {
      var P = RS.cloud && RS.cloud.prayer;
      if (P && typeof P.times === 'function' && (typeof P.configured !== 'function' || P.configured())) {
        var tm = P.times(now);
        if (tm && tm.fajr instanceof Date && !isNaN(tm.fajr.getTime())) return now < tm.fajr;
      }
    } catch (e) { /* fall back to the clock */ }
    // Without prayer times: Fajr is before 06:30 almost everywhere in the coming Ramadans, so until then the night
    // is treated as still running (the texts for the current night say "until Fajr", never a clock time).
    return now.getHours() * 60 + now.getMinutes() < 390;
  }
  // The night that follows Ramadan day `day` (or the current night, before dawn on the live day).
  // live: false when Ramadan mode is on outside Ramadan (no "tonight", the texts name the evening instead).
  // Returns null while browsing a day other than today during a live Ramadan.
  function nightOf(day) {
    var ld = liveDay();
    if (ld && day !== ld) return null;
    var now = !!ld && preDawn();
    var nn = now ? day : day + 1;
    return { n: nn, now: now, live: !!ld, odd: nn >= 21 && nn <= 29 && nn % 2 === 1 };
  }
  function daysToRamadan() {
    if (RS.prep && typeof RS.prep.daysUntilRamadan === 'function') {
      try { var v = RS.prep.daysUntilRamadan(); if (v != null && isFinite(v)) return v; } catch (e) { /* fall back */ }
    }
    for (var i = 0; i <= 400; i++) { var h = RS.hijri(noonPlus(i)); if (h.month === 9) return i; }
    return null;
  }
  // Sunnah fasting: the Day of Arafah (9 Dhul Hijjah, Muslim 1162), Tasu'a and Ashura (9 and 10 Muharram, Muslim
  // 1134, 1162), the six days of Shawwal from 2 Shawwal until six are marked (Muslim 1164), the white days 13-15,
  // Mondays and Thursdays. Never on Eid (1 Shawwal, 10 Dhul Hijjah) or the days of Tashreeq (11-13 Dhul Hijjah);
  // Ramadan itself is obligatory fasting.
  var FAST_REF = {
    arafah: { ref: 'Muslim 1162', url: 'https://sunnah.com/muslim:1162', grade: 'Sahih (Muslim)' },
    ashura: { ref: 'Muslim 1162', url: 'https://sunnah.com/muslim:1162', grade: 'Sahih (Muslim)' },
    tasua: { ref: 'Muslim 1134', url: 'https://sunnah.com/muslim:1134', grade: 'Sahih (Muslim)' }
  };
  function shawwalDone(year) { return RS.clamp(num((extras().shawwal || {})[year]), 0, 6); }
  function fastInfo(date) {
    var dow = date.getDay(), h = RS.hijri(date);
    var eid = (h.month === 10 && h.day === 1) || (h.month === 12 && h.day === 10);
    var tashreeq = h.month === 12 && h.day >= 11 && h.day <= 13;
    var ok = !eid && !tashreeq && h.month !== 9;
    var f = { h: h, dow: dow, eid: eid, tashreeq: tashreeq, ramadan: h.month === 9, blocked: eid || tashreeq,
      arafah: ok && h.month === 12 && h.day === 9, tasua: ok && h.month === 1 && h.day === 9, ashura: ok && h.month === 1 && h.day === 10,
      shawwal: ok && h.month === 10 && h.day >= 2 && shawwalDone(h.year) < 6,
      white: ok && h.day >= 13 && h.day <= 15, mon: ok && dow === 1, thu: ok && dow === 4 };
    f.special = f.arafah ? 'arafah' : f.ashura ? 'ashura' : f.tasua ? 'tasua' : '';
    f.any = !!(f.special || f.shawwal || f.white || f.mon || f.thu);
    return f;
  }
  function nextFast() {
    for (var i = 1; i <= 14; i++) { var d = noonPlus(i), fi = fastInfo(d); if (fi.any) return { date: d, inDays: i, fi: fi }; }
    return null;
  }
  function fastLogged(iso) { var f = extras().fasts; return isObj(f) && isObj(f[iso]) && !!f[iso].v; }

  /* ================================================================ change pipeline */
  // mutate(ck, state) edits the checklist copy (state.hayd may be changed); then the record is rebuilt and saved,
  // and the v7 side effects run: streak milestones, best streaks, badges, the Abu Bakr nudge, the 100% moment.
  // Sisters' mode: turning it on moves the ticked prayer/fasting deeds into rec.hck (not counted); turning it off
  // puts them back, so one accidental tap never erases the day's prayer ticks.
  // Everything one change raises is shown in at most three toasts: the perfect day and streak milestones together,
  // all badges unlocked together, and the Abu Bakr nudge.
  function change(ctx, mutate, o) {
    o = o || {};
    var before = getRec(ctx.key);
    var prev = before ? build(ctx, before.ck, before.hayd, before.hck) : build(ctx, {}, false);
    var sBefore = ctx.kind === 'ramadan' ? streaksAt(ctx.day) : null;
    var ck = {}, st = { hayd: before ? before.hayd : false }, hck = {}, wasHayd = st.hayd;
    if (before) {
      Object.keys(before.ck).forEach(function (k) { ck[k] = before.ck[k]; });
      if (before.hck) Object.keys(before.hck).forEach(function (k) { if (before.hck[k]) hck[k] = true; });
    }
    mutate(ck, st);
    if (st.hayd && !wasHayd) applicable(ctx).forEach(function (id) { if (deed(id).haydOff && ck[id]) hck[id] = true; });
    else if (!st.hayd && wasHayd) { Object.keys(hck).forEach(function (id) { if (deed(id)) ck[id] = true; }); hck = {}; }
    var rec = build(ctx, ck, st.hayd, hck);
    RS.store.set(ctx.key, rec);
    var lines = [], got = [], ms = [], sAfter = null;
    var perfect = prev.pct < 100 && rec.pct === 100 && rec.tot > 0;
    if (perfect) lines.push(t('today.toast.perfect'));
    if (ctx.kind === 'ramadan') {
      var recs = allDays();
      sAfter = streaksAt(ctx.day, recs);
      SK.forEach(function (k) { if (sAfter[k] > sBefore[k] && MILESTONES.indexOf(sAfter[k]) >= 0) ms.push(k); });
      if (ms.length === 1) lines.push(tn('today.toast.streak', sAfter[ms[0]], { name: streakName(ms[0]) }));
      else if (ms.length > 1) lines.push(t('today.toast.streaks', { list: listJoin(ms.map(function (k) { return tn('today.toast.streakItem', sAfter[k], { name: streakName(k) }); })) }));
      saveBest(sAfter);
      got = checkBadges(ctx.day, rec, recs);
    }
    if (lines.length) say(lines.join(' '), perfect ? 'success' : 'default');
    if (got.length) say(got.length === 1 ? t('today.toast.badge', { name: badgeName(got[0]) }) : t('today.toast.badges', { names: listJoin(got.map(badgeName)) }), 'success');
    if (o.id && ABU.indexOf(o.id) >= 0 && rec.ck[o.id]) {
      var app = ABU.filter(function (i) { return i in rec.ck; });
      var missing = app.filter(function (i) { return !rec.ck[i]; });
      if (app.length === 4 && missing.length === 1) {
        // the deed's short name ("visiting a sick person"), not its question-and-answer label ("— I did")
        var short = 'today.abu.' + missing[0];
        say(t('today.toast.abuBakr', { deed: RS.has(short) ? t(short) : deedLabel(missing[0]) }));
        setOpen('abuBakr', true);
      }
    }
    emit();
    return { rec: rec, perfect: perfect };
  }
  // a toast that stays long enough to be read
  function say(msg, tone) { RS.toast(msg, { tone: tone || 'default', ms: Math.min(9000, 2800 + String(msg).length * 40) }); }
  function listJoin(a) {
    try { if (typeof Intl !== 'undefined' && Intl.ListFormat) return new Intl.ListFormat(RS.lang(), { style: 'long', type: 'conjunction' }).format(a); } catch (e) { /* older browsers */ }
    return a.join(', ');
  }
  function replay(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  // The 100% moment and a completed section: the ring pulses (when it is on screen) and the section's count and bar
  // glow next to the row that was just ticked, so the moment is seen where it happens. No confetti.
  function pulseRing() { replay(document.getElementById('tr-ring'), 'tr-pulse'); }
  function pulseSection(secId) {
    var s = document.getElementById('tr-sec-' + secId);
    if (!s) return;
    replay(s.querySelector('.tr-sec-n'), 'tr-pop');
    replay(s.querySelector('.tr-sec-bar'), 'tr-pop');
  }
  function secOfDeed(id) {
    var out = null;
    sections().forEach(function (s) { if (!out && secIds(s).indexOf(id) >= 0) out = s.id; });
    return out;
  }

  /* ================================================================ refresh helpers */
  var MY = { today: 1, 'today/preview': 1, quran: 1, me: 1, 'me/settings': 1, 'me/guide': 1, 'me/badges': 1, 'me/day': 1 };
  function onMyRoute() { var c = RS.router.current(); return !!(c && MY[c.route]); }
  var pend = {};
  function later(id, fn, ms) {
    if (pend[id]) clearTimeout(pend[id].tm);
    pend[id] = { fn: fn, tm: setTimeout(function () { var p = pend[id]; delete pend[id]; if (p) p.fn(); }, ms || 500) };
  }
  function flush(id) { var p = pend[id]; if (!p) return; clearTimeout(p.tm); delete pend[id]; p.fn(); }
  function flushAll() { Object.keys(pend).forEach(flush); }
  function refresh() { flushAll(); RS.refresh(); }
  // One polite status region outside #view (which every refresh replaces), created at boot so that later changes are
  // read out: e.g. the day switcher's result, while focus stays on its arrow (WCAG 4.1.3). Emptied first, so the
  // same message twice is read twice.
  function liveEl() {
    var el = document.getElementById('tr-live');
    if (!el && document.body) {
      el = document.createElement('div');
      el.id = 'tr-live';
      el.className = 'sr-only';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
      document.body.appendChild(el);
    }
    return el;
  }
  var liveT = null;
  function announce(msg) {
    var el = liveEl();
    if (!el) return;
    el.textContent = '';
    clearTimeout(liveT);
    liveT = setTimeout(function () { el.textContent = msg; }, 100);
  }
  // "Day 18 of 30: 45%, 12 of 61 deeds done" for the Ramadan day Today shows
  function announceDay() {
    var ctx = rCtx(), st = live(ctx);
    announce(t('today.step.live', { n: nf(ctx.day), pct: pf(st.pct), done: nf(st.done), tot: nf(st.tot) }));
  }
  var softT = null;
  function softRefresh() {
    clearTimeout(softT);
    softT = setTimeout(function () {
      if (!onMyRoute()) return;
      var a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && document.getElementById('view').contains(a)) return;   // never under the cursor
      refresh();
    }, 80);
  }

  /* ================================================================ prayer + AI (cloud hooks, guarded) */
  function cloudTry(fn, fallback) { try { return fn(); } catch (e) { console.error('[tracker] cloud hook failed', e); return fallback; } }
  function aiOn() { return !!(RS.cloud && typeof RS.cloud.aiAvailable === 'function' && cloudTry(function () { return RS.cloud.aiAvailable(); }, false)); }
  function prayerOn() {
    var P = RS.cloud && RS.cloud.prayer;
    return !!(P && typeof P.configured === 'function' && cloudTry(function () { return P.configured(); }, false));
  }
  function prayerCard() {
    if (!prayerOn() || typeof RS.cloud.prayer.cardHtml !== 'function') return '';
    return cloudTry(function () { return RS.cloud.prayer.cardHtml(); }, '') || '';
  }
  function heroCta() {
    var P = RS.cloud && RS.cloud.prayer;
    if (P && typeof P.configured === 'function') {
      if (prayerOn()) {
        var c = typeof P.cta === 'function' ? cloudTry(function () { return P.cta(); }, null) : null;
        return { eyebrow: (c && c.eyebrow) || t('today.cta.prayerEyebrow'), text: (c && c.text) || t('today.cta.seePrayer'), act: (c && c.act) || 'prayer.open', id: 'tr-cta' };
      }
      return { eyebrow: t('today.cta.prayerEyebrow'), text: t('today.cta.setPrayer'), act: 'prayer.setup', id: 'tr-cta' };
    }
    return { eyebrow: t('today.cta.quranEyebrow'), text: t('today.cta.logQuran'), act: 'tr.qlog', id: 'tr-cta' };
  }
  var ctaTimer = null;
  function updateCta() {
    var el = document.getElementById('tr-cta');
    if (!el) return;
    var c = heroCta(), eb = el.querySelector('.cta-eyebrow'), tx = el.querySelector('.cta-text');
    if (eb && eb.textContent !== c.eyebrow) eb.textContent = c.eyebrow;
    if (tx && tx.textContent !== c.text) tx.textContent = c.text;
    if (el.getAttribute('data-act') !== c.act) el.setAttribute('data-act', c.act);
  }
  function startCta() { stopCta(); ctaTimer = setInterval(updateCta, 30000); }
  function stopCta() { if (ctaTimer) clearInterval(ctaTimer); ctaTimer = null; }

  /* ================================================================ section open state (settings.secOpen) */
  function isOpen(id) {
    var o = RS.settings.secOpen;
    if (isObj(o) && typeof o[id] === 'boolean') return o[id];
    return id === 'salah' || id === 'lastTen';
  }
  function setOpen(id, on) {
    if (!isObj(RS.settings.secOpen)) RS.settings.secOpen = {};
    RS.settings.secOpen[id] = !!on;
    RS.saveSettings();
  }

  /* ================================================================ install prompt */
  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; softRefresh(); });
  window.addEventListener('appinstalled', function () { installEvt = null; softRefresh(); });
  function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function standalone() { return !!((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true); }
  function installCard() {
    if (RS.store.raw('rs-inst-x')) return '';
    var ios = !installEvt && isIOS() && !standalone();
    if (!installEvt && !ios) return '';
    var btns = (installEvt ? ui.btn(t('today.install.btn'), { act: 'tr.install', icon: 'download' }) : '') +
      ui.btn(t('today.install.later'), { act: 'tr.installx', variant: 'ghost' });
    return ui.card({
      kicker: { icon: 'smartphone', text: t('today.install.kicker') }, cls: 'tr-install',
      body: '<p>' + esc(t(ios ? 'today.install.ios' : 'today.install.body')) + '</p><div class="btn-row mt-3">' + btns + '</div>'
    });
  }

  /* ================================================================ TODAY */
  function renderToday(view) {
    var mode = RS.appMode();
    RS.topbar({ title: t('nav.today'), sub: RS.fmt.hijri() });
    view.innerHTML = mode === 'prep' ? prepToday() : (mode === 'year' ? yearToday() : ramadanToday());
  }

  function stepper(day) {
    var ld = liveDay(), sub = '';
    if (ld) {
      var diff = day - ld;
      if (diff === 0) sub = t('today.step.today');
      else if (diff === -1) sub = t('today.step.yesterday');
      else if (diff === 1) sub = t('today.step.tomorrow');
      else sub = RS.fmt.date(noonPlus(diff), { weekday: 'short', day: 'numeric', month: 'short' });
    }
    return ui.stepper({
      id: 'tr-step', title: t('today.step.title', { n: nf(day) }), sub: sub,
      prev: { act: 'tr.day', arg: '-1', label: t('today.step.prev'), disabled: day <= 1 },
      next: { act: 'tr.day', arg: '+1', label: t('today.step.next'), disabled: day >= DAYS }
    });
  }

  // the longest streak running now, named (ties: Fajr, Isha, Quran, Charity)
  function topStreak(s) { var k = SK[0]; SK.forEach(function (x) { if (s[x] > s[k]) k = x; }); return { k: k, n: s[k] }; }

  function ramadanToday() {
    if (archiveAsk) return archiveWait() + installCard() + prayerCard();   // nothing from last season's days
    var ctx = rCtx(), day = ctx.day, rec = getRec(ctx.key), st = live(ctx);
    var nt = nightOf(day), top = topStreak(T.streaks());
    var kick = nt && nt.odd ? { icon: 'moon-star', text: t(nt.now ? 'today.kicker.oddNow' : nt.live ? 'today.kicker.oddTonight' : 'today.kicker.oddEve', { n: nf(nt.n) }) }
      : { icon: 'moon', text: t('today.kicker.day', { n: nf(day) }) };
    var h = [stepper(day)];
    h.push(ui.hero({
      id: 'tr-hero', kicker: kick, number: nf(st.pct), unit: '%',
      label: liveDay() === day ? t('today.hero.labelLive') : t('today.hero.label', { n: nf(day) }),
      ring: { pct: st.pct, id: 'tr-ring', label: t('today.hero.ring', { done: nf(st.done), tot: nf(st.tot) }) },
      metrics: [
        { label: t('today.metric.deeds'), value: nf(st.done) + '/' + nf(st.tot) },
        { label: t(ctx.mult > 1 ? 'today.metric.pointsBonus' : 'today.metric.points'), value: nf(st.pts) },
        { label: t('today.metric.quran'), value: nf(qOf(qObj(), day)) },
        { label: t('today.metric.streakOf', { name: streakName(top.k) }), value: nf(top.n) }
      ],
      cta: heroCta()
    }));
    h.push(installCard());
    h.push(prayerCard());
    h.push(lqCard(day));
    h.push(hadithCard(day));
    if (RS.settings.showPrep) h.push(planCard());
    h.push(checklist(ctx, rec));
    h.push(journalCard(ctx));
    return h.join('');
  }

  // Laylatul Qadr countdown (v7 updLQCountdown, with nights counted from the evening before)
  // Outside a live Ramadan (or while browsing another day) the texts name the evening ("begins at sunset on day N")
  // instead of saying "tonight".
  function lqCard(day) {
    if (day < 15) return '';
    var nt = nightOf(day) || { n: day + 1, now: false, live: false }, title, body, ref = null;
    if (day < 20) { title = t('today.lq.nearTitle'); body = tn('today.lq.near', 20 - day); }
    else if (day === 20) {
      title = t(nt.live ? 'today.lq.tonightTitle' : 'today.lq.eveTitle'); body = t(nt.live ? 'today.lq.tonight' : 'today.lq.eve');
      ref = { ref: 'Bukhari 2017', url: 'https://sunnah.com/bukhari:2017', grade: 'Sahih (Bukhari)' };
    }
    else if (nt.n >= 21 && nt.n <= 30) {
      title = t('today.lq.hereTitle');
      var odd = nt.n % 2 === 1, form = nt.now ? 'Now' : nt.live ? 'Tonight' : 'Eve';
      body = t('today.lq.' + (odd ? 'odd' : 'even') + form, { n: nf(nt.n), d: nf(nt.n - 1) });
      ref = odd ? { ref: 'Bukhari 2017', url: 'https://sunnah.com/bukhari:2017', grade: 'Sahih (Bukhari)' } : { ref: 'Muslim 1175', url: 'https://sunnah.com/muslim:1175', grade: 'Sahih (Muslim)' };
    } else { title = t('today.lq.lastTitle'); body = t('today.lq.last'); }
    return ui.card({ kicker: { icon: 'moon-star', text: t('today.lq.kicker') }, title: title, cls: 'tr-lq',
      body: '<p>' + esc(body) + '</p>' + (ref ? '<div class="mt-2">' + ui.ref(ref) + '</div>' : '') });
  }

  function hadithCard(day) {
    var hd = (content().hadith || []).filter(function (x) { return x && x.n === day; })[0];
    if (!hd || !RS.has('hadith.' + day)) return '';
    var quran = ui.gradeClass(hd.grade || '') === 'quran' || /^qur'?an\b/i.test(hd.ref || '');
    return ui.card({ kicker: { icon: quran ? 'book-open' : 'scroll-text', text: t(quran ? 'today.hadith.verse' : 'today.hadith.kicker') }, cls: 'tr-hadith',
      body: '<p class="quote">' + esc(t('hadith.' + day)) + '</p>' + ui.ref({ ref: hd.ref, url: hd.url, grade: hd.grade }) });
  }

  /* ---------------------------------------------------------------- checklist */
  // o.preview: read-only rows (Ramadan Prep); o.pin: a Ramadan day number whose record the ticks change (me/day
  // outside Ramadan mode) instead of the day or date Today shows.
  function checklist(ctx, rec, o) {
    o = o || {};
    var v = { ctx: ctx, ck: rec ? rec.ck : {}, hayd: rec ? rec.hayd : false, detail: !!RS.settings.detail, preview: !!o.preview, pin: o.pin || 0 };
    var h = [ui.section(t('today.list.title'), { text: t(v.detail ? 'today.list.hideSources' : 'today.list.showSources'), act: 'tr.detail', icon: v.detail ? 'eye-off' : 'eye' })];
    if (!v.preview) h.push(haydCard(v.hayd, v.pin));
    sections().forEach(function (sec) {
      if (sec.l10 && !ctx.l10) return;
      h.push(secCard(sec, v));
    });
    return h.join('');
  }
  T.renderTodayChecklist = function (el) {
    if (!el) return;
    var ctx = checkCtx();
    el.innerHTML = checklist(ctx, getRec(ctx.key));
  };

  function secCard(sec, v) {
    var ck = v.ck, hayd = v.hayd, preview = v.preview;
    var shown = function (id) { return !!deed(id) && counts(v.ctx, id); };
    var ids = secIds(sec).filter(shown), done = 0, tot = 0;
    if (!ids.length) return '';
    ids.forEach(function (id) { if (hayd && deed(id).haydOff) return; tot++; if (ck[id]) done++; });
    var open = isOpen(sec.id), bid = 'tr-secbd-' + sec.id, hid = 'tr-sech-' + sec.id;
    var countTxt = preview ? tn('today.sec.items', tot) : t('today.sec.count', { done: nf(done), tot: nf(tot) });
    var head = '<h3 class="tr-sec-h"><button type="button" class="tr-sec-btn" id="' + hid + '" aria-expanded="' + open + '" aria-controls="' + bid + '" data-act="tr.sec" data-arg="' + esc(sec.id) + '">' +
      '<span class="row-ic" aria-hidden="true">' + RS.icon(sec.icon || 'list', { size: 19 }) + '</span>' +
      '<span class="tr-sec-txt"><span class="tr-sec-title">' + esc(t('sec.' + sec.id + '.title')) + '</span></span>' +
      '<span class="tr-sec-n"><span aria-hidden="true">' + esc(preview ? countTxt : nf(done) + '/' + nf(tot)) + '</span><span class="sr-only">' + esc(countTxt) + '</span></span>' +
      RS.icon('chevron-down', { size: 20, cls: 'tr-sec-chev' }) + '</button></h3>' +
      (preview ? '' : ui.bar(tot ? done / tot * 100 : 0, { cls: 'tr-sec-bar' }));
    var body = '';
    if (open) {
      if (sec.note && RS.has('sec.' + sec.id + '.note')) {
        body += '<div class="tr-note"><p>' + esc(t('sec.' + sec.id + '.note')) + '</p>' + ui.ref({ ref: sec.note.ref, url: sec.note.url, grade: sec.note.grade }) + '</div>';
      }
      var rows = function (list) { return ui.list(list.filter(shown).map(function (id) { return deedRow(id, v); }), { cls: 'tr-deeds' }); };
      (sec.subs || []).forEach(function (sub) {
        var list = (sub.items || []).filter(shown);
        if (!list.length) return;
        body += '<h4 class="tr-sub">' + RS.icon(sub.icon || 'circle', { size: 16 }) + '<span>' + esc(t('sub.' + sub.id)) + '</span></h4>' + rows(list);
      });
      if (sec.items && sec.items.filter(shown).length) body += rows(sec.items);
    }
    return '<section class="card tr-sec' + (sec.l10 ? ' is-l10' : '') + (!preview && tot && done === tot ? ' is-complete' : '') + '" id="tr-sec-' + esc(sec.id) + '">' + head +
      '<div class="tr-sec-bd" id="' + bid + '"' + (open ? '' : ' hidden') + '>' + body + '</div></section>';
  }

  function deedRow(id, v) {
    var d = deed(id), preview = v.preview, off = !!(v.hayd && d.haydOff), on = !off && !!v.ck[id], label = deedLabel(id);
    var extra = '';
    if (v.detail) {
      var exp = deedExp(id);
      if (exp) extra += '<p class="tr-exp">' + esc(exp) + '</p>';
      var links = [];
      if (d.ref || d.grade) links.push(ui.ref({ ref: d.ref, url: d.url, grade: d.grade }));
      if (!preview && aiOn()) links.push(ui.linkAction({ text: t('today.deed.explain'), act: 'ai.explain', arg: id, label: t('today.deed.explainLabel', { deed: label }) }));
      if (!preview && d.give && RS.cloud) links.push(ui.linkAction({ text: t('today.deed.give'), act: 'cloud.give', arg: id, icon: 'hand-heart', label: t('today.deed.giveLabel', { deed: label }) }));
      if (d.app && APPS[d.app]) {
        links.push(ui.linkAction({ text: APPS[d.app].name, href: APPS[d.app].url, icon: 'arrow-up-right' }));
      }
      if (links.length) extra += '<div class="tr-links">' + ui.meta(links) + '</div>';
    }
    if (id === 'dua-list') {
      var dl = duaLines();
      if (dl.length) extra += '<div class="tr-dualist"><p class="tr-dualist-t">' + esc(t('today.duaList')) + '</p><ul>' + dl.slice(0, 20).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    }
    // "+15" is shown; a screen reader hears "Fajr prayer, 15 points" (words inside the title) instead of "+15" run
    // into the name
    var pts = '<span class="row-val" aria-hidden="true">' + esc(signed(num(d.pts))) + '</span>';
    var title = esc(label) + '<span class="sr-only">' + esc(tn('today.deed.ptsSr', num(d.pts))) + '</span>';
    if (preview) {
      return ui.row({ lead: '<span class="tr-dot" aria-hidden="true"></span>', titleHtml: title, trail: pts, extra: extra || null, cls: 'tr-deed' });
    }
    return ui.row({
      lead: ui.check(on, { cls: off ? 'is-off' : '' }), check: { on: on, act: 'tr.tick', arg: v.pin ? id + '@' + v.pin : id },
      titleHtml: title, sub: off ? t('today.deed.off') : '', trail: pts, disabled: off, extra: extra || null, cls: 'tr-deed'
    });
  }

  function haydCard(on, pin) {
    var row = ui.row({ icon: 'flower-2', title: t('today.hayd.title'), sub: t('today.hayd.sub'), toggle: { on: on, act: 'tr.hayd', arg: pin || null }, id: 'tr-hayd-row' });
    var body = '<ul class="list"><li class="li">' + row + '</li></ul>';
    if (on) {
      var tips = [];
      for (var i = 1; i <= HAYD_TIPS; i++) tips.push('<li>' + esc(t('today.hayd.tip' + i)) + '</li>');
      body += '<div class="tr-hayd-bd"><p class="quote">' + esc(t('today.hayd.ayah')) + '</p>' + ui.ref({ ref: 'Quran 2:286', url: 'https://quran.com/2/286', grade: 'Quran' }) +
        '<p class="tr-hayd-tt">' + esc(t('today.hayd.tipsTitle')) + '</p><ul class="tr-tips">' + tips.join('') + '</ul></div>';
    }
    return ui.card({ body: body, cls: 'tr-hayd is-tight' + (on ? ' is-on' : '') });
  }

  /* ---------------------------------------------------------------- journal */
  // The suggested question and the save status are polite live regions (always in the DOM, so a change is read out;
  // the status only changes when its text does, at most once a minute while typing).
  function journalCard(ctx) {
    var key = jKey(ctx), j = jGet(key);
    var body = '<div class="tr-jlive" aria-live="polite"><p class="tr-jprompt" id="tr-jprompt"' + (j.p ? '' : ' hidden') + '><span class="sr-only">' + esc(t('journal.promptLabel')) + ': </span><span id="tr-jprompt-t">' + esc(j.p || '') + '</span></p></div>' +
      ui.textarea({ id: 'tr-journal', label: ctx.kind === 'year' ? t('journal.labelToday') : t('journal.label', { n: nf(ctx.day) }), hideLabel: true,
        value: j.t || '', placeholder: t('journal.ph'), maxlength: 600, rows: 3, actInput: 'tr.jinput', actChange: 'tr.jsave', arg: key }) +
      '<p class="caption tr-jstatus" id="tr-jstatus" aria-live="polite">' + esc(j.ts && j.t ? t('journal.saved', { time: RS.fmt.time(j.ts) }) : jHint(key)) + '</p>';
    return ui.card({
      id: 'tr-journal-card', cls: 'tr-journal', kicker: { icon: 'notebook-pen', text: t('journal.kicker') },
      action: aiOn() ? { text: t('journal.suggest'), act: 'tr.reflect', arg: key, icon: 'lightbulb', id: 'tr-jsuggest' } : null, body: body
    });
  }
  function saveJournal(key, text) {
    var j = jSet(key, { t: String(text || '').slice(0, 600) });
    var st = document.getElementById('tr-jstatus'), msg = j.t ? t('journal.saved', { time: RS.fmt.time(j.ts) }) : jHint(key);
    if (st && st.textContent !== msg) st.textContent = msg;
  }
  function jHint(key) { return t(/^r\d+$/.test(key) ? 'journal.hint' : 'journal.hintYear'); }

  /* ---------------------------------------------------------------- My Ramadan plan (v7 prep card) */
  function planCard() {
    var x = extras(), g = isObj(x.goals) ? x.goals : {}, q = qada();
    var left = Math.max(0, q.owed - q.done);
    function stepperRow(k, label) {
      return '<div class="tr-qada-row"><span class="tr-qada-l" id="tr-qada-' + k + '">' + esc(label) + '</span>' +
        ui.iconBtn('minus', { act: 'tr.qada', arg: k + ':-1', label: t('modes.plan.less', { what: label }) }) +
        '<output class="tr-qada-n" aria-labelledby="tr-qada-' + k + '">' + esc(nf(q[k])) + '</output>' +
        ui.iconBtn('plus', { act: 'tr.qada', arg: k + ':1', label: t('modes.plan.more', { what: label }) }) + '</div>';
    }
    var body = '<h3 class="tr-h3">' + esc(t('modes.plan.intentions')) + '</h3>' +
      [1, 2, 3].map(function (i) {
        return ui.field({ id: 'tr-goal' + i, label: t('modes.plan.intention', { n: nf(i) }), value: (isObj(g['g' + i]) ? g['g' + i].t : '') || '', maxlength: 120, actInput: 'tr.goal', actChange: 'tr.goal', arg: i });
      }).join('') +
      '<h3 class="tr-h3">' + esc(t('modes.plan.duas')) + '</h3>' +
      ui.textarea({ id: 'tr-duas', label: t('modes.plan.duasLabel'), hideLabel: true, value: isObj(x.duas) ? x.duas.t || '' : '', placeholder: t('modes.plan.duasPh'), maxlength: 2000, rows: 4, actInput: 'tr.duas', actChange: 'tr.duas' }) +
      '<h3 class="tr-h3">' + esc(t('modes.plan.qada')) + '</h3>' +
      '<div class="tr-qada">' + stepperRow('owed', t('modes.plan.owed')) + stepperRow('done', t('modes.plan.madeUp')) + '</div>' +
      '<p class="caption mt-2">' + esc(left > 0 ? tn('modes.plan.left', left) : t('modes.plan.caughtUp')) + '</p>';
    return ui.card({ kicker: { icon: 'target', text: t('modes.plan.kicker') }, body: body, cls: 'tr-plan', id: 'tr-plan' });
  }
  function qada() { var q = extras().qada; q = isObj(q) ? q : {}; return { owed: Math.max(0, Math.round(num(q.owed))), done: Math.max(0, Math.round(num(q.done))) }; }

  /* ---------------------------------------------------------------- prep mode */
  function prepToday() {
    var h = [];
    var hero = RS.prep && typeof RS.prep.todayHeroHtml === 'function' ? cloudTry(function () { return RS.prep.todayHeroHtml(); }, '') : '';
    if (!hero || String(hero).indexOf('hero') < 0) {
      var dl = daysToRamadan();
      hero = ui.hero({
        kicker: { icon: 'sprout', text: t('today.prep.kicker') },
        number: dl != null ? nf(dl) : '', label: dl != null ? tn('today.prep.daysLabel', dl) : t('today.prep.soon'),
        cta: RS.router.has('prep') ? { eyebrow: t('today.prep.ctaEyebrow'), text: t('today.prep.cta'), act: 'nav.go', arg: 'prep' } : null
      });
    }
    h.push(hero);
    h.push(installCard());
    h.push(prayerCard());
    var cards = RS.prep && typeof RS.prep.todayCardsHtml === 'function' ? cloudTry(function () { return RS.prep.todayCardsHtml(); }, '') : '';
    if (cards) h.push(cards);
    h.push(planCard());
    h.push(ui.card({ cls: 'is-tight', body: ui.list([ui.row({ icon: 'list-checks', title: t('today.prep.preview'), sub: t('today.prep.previewSub'), act: 'nav.go', arg: 'today/preview', chevron: true })]) }));
    return h.join('');
  }

  function renderPreview(view) {
    RS.topbar({ title: t('today.preview.title'), back: 'today' });
    var all = [], l10 = [];
    sections().forEach(function (s) { (s.l10 ? l10 : all).push.apply(s.l10 ? l10 : all, secIds(s)); });
    var pts = all.reduce(function (a, id) { return a + num(deed(id).pts); }, 0);
    view.innerHTML = ui.hero({
      kicker: { icon: 'list-checks', text: t('today.preview.kicker') }, number: nf(all.length), label: t('today.preview.label'),
      metrics: [{ label: t('today.preview.sections'), value: nf(sections().filter(function (s) { return !s.l10; }).length) },
        { label: t('today.preview.points'), value: nf(pts) }, { label: t('today.preview.lastTen'), value: signed(l10.length) }]
    }) + ui.note(t('today.preview.note'), { icon: 'info', tone: 'plain' }) + checklist(rCtx(21), null, { preview: true });
  }

  /* ---------------------------------------------------------------- year-round mode */
  function fastsThisMonth(h) {
    var f = extras().fasts, c = 0;
    if (!isObj(f)) return 0;
    Object.keys(f).forEach(function (iso) {
      if (!isObj(f[iso]) || !f[iso].v || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
      var hh = RS.hijri(iso);
      if (hh.month === h.month && hh.year === h.year) c++;
    });
    return c;
  }
  // The hero's fasting line: what today is (a logged fast first), else the next Sunnah fast, named when it is a special day.
  function fastText(fi, on) {
    if (fi.ramadan) return t('modes.year.ramadan');
    if (fi.eid) return t('modes.year.eid');
    if (fi.tashreeq) return t('modes.year.tashreeq');
    if (on) return t('modes.year.fasting');
    if (fi.special) return t('modes.year.' + fi.special);
    if (fi.shawwal) return t('modes.year.shawwal');
    if (fi.white) return t('modes.year.white', { n: nf(fi.h.day) });
    if (fi.mon) return t('modes.year.monday');
    if (fi.thu) return t('modes.year.thursday');
    var nx = nextFast();
    if (!nx) return '';
    var sp = nx.fi.special, day = RS.fmt.date(nx.date, { weekday: 'long' });
    if (nx.inDays === 1) return sp ? t('modes.year.nextTomorrowSpecial', { name: t('modes.fastName.' + sp) }) : t('modes.year.nextTomorrow');
    return sp ? t('modes.year.nextSpecial', { name: t('modes.fastName.' + sp), day: day }) : t('modes.year.next', { day: day });
  }
  function yearToday() {
    var ctx = yCtx(), rec = getRec(ctx.key), st = live(ctx), now = new Date(), fi = fastInfo(now), h = fi.h;
    var out = [];
    out.push(ui.hero({
      id: 'tr-hero', kicker: { icon: 'calendar', text: t('modes.year.kicker') },
      number: nf(h.day), unit: RS.hijriMonth(h.month),
      label: RS.fmt.date(now, { weekday: 'long', day: 'numeric', month: 'long' }),
      text: fastText(fi, fastLogged(ctx.date)),
      ring: { pct: st.pct, id: 'tr-ring', text: pf(st.pct), sub: t('modes.year.ringSub'), label: t('today.hero.ring', { done: nf(st.done), tot: nf(st.tot) }) },
      metrics: [{ label: t('modes.year.mFasts'), value: nf(fastsThisMonth(h)) }, { label: t('modes.year.mQuran'), value: nf(qlogOf(qlog(), ctx.date)) },
        { label: t('modes.year.mDeeds'), value: nf(st.done) + '/' + nf(st.tot) }],
      cta: heroCta()
    }));
    out.push(installCard());
    out.push(prayerCard());
    out.push(fastCard(fi, h, ctx.date));
    if (h.month === 10) out.push(shawwalCard(h));
    if (h.month === 12 && h.day <= 13) out.push(dhCard(h));
    out.push(prepRow());
    if (RS.settings.showPrep) {
      var cards = RS.prep && typeof RS.prep.todayCardsHtml === 'function' ? cloudTry(function () { return RS.prep.todayCardsHtml(); }, '') : '';
      if (cards) out.push(cards);
      out.push(planCard());
    }
    out.push(checklist(ctx, rec));
    out.push(journalCard(ctx));
    return out.join('');
  }
  function fastCard(fi, h, iso) {
    var on = fastLogged(iso), c = fastsThisMonth(h);
    var row = ui.row({ icon: 'moon', title: t('modes.fast.toggle'), sub: fi.blocked ? t('modes.fast.blocked') : t(on ? 'modes.fast.toggleSub' : 'modes.fast.toggleOff'),
      toggle: { on: on, act: 'tr.fast' }, disabled: fi.blocked && !on, id: 'tr-fast-row' });
    var sp = fi.special ? '<div class="tr-fast-day"><p class="tr-fast-day-t">' + esc(t('modes.fast.today.' + fi.special)) + '</p><p class="quote">' + esc(t('modes.fast.quote.' + fi.special)) + '</p>' + ui.ref(FAST_REF[fi.special]) + '</div>' : '';
    return ui.card({ kicker: { icon: 'moon', text: t('modes.fast.kicker') }, cls: 'tr-fast',
      body: '<p>' + esc(t('modes.fast.body')) + '</p>' + sp + '<p class="caption mt-2">' + esc(tn('modes.fast.count', c, { month: RS.hijriMonth(h.month) })) + '</p>' +
        '<ul class="list mt-2"><li class="li">' + row + '</li></ul>' });
  }
  function shawwalCard(h) {
    var cur = shawwalDone(h.year), cells = '';
    for (var i = 1; i <= 6; i++) {
      cells += '<li><button type="button" class="tr-cell' + (i <= cur ? ' is-on' : '') + '" aria-pressed="' + (i <= cur) + '" data-act="tr.shawwal" data-arg="' + i + '" aria-label="' + esc(t('modes.shawwal.cell', { n: nf(i) })) + '">' + esc(nf(i)) + '</button></li>';
    }
    return ui.card({ kicker: { icon: 'calendar-check', text: t('modes.shawwal.kicker') }, cls: 'tr-shawwal',
      body: '<p class="quote">' + esc(t('modes.shawwal.quote')) + '</p>' + ui.ref({ ref: 'Muslim 1164', url: 'https://sunnah.com/muslim:1164', grade: 'Sahih (Muslim)' }) +
        '<ul class="tr-cells tr-cells-6 mt-4">' + cells + '</ul><p class="caption mt-2">' + esc(t('modes.shawwal.count', { n: nf(cur) })) + '</p>' });
  }
  // Day 9 (Arafah) shows only its number, like the other cells, plus a dot explained by the key under the grid;
  // its accessible name starts with the visible number ("Day 9, the Day of Arafah").
  function dhCard(h) {
    var dh = (extras().dhulhijjah || {})[h.year], cells = '', c = 0;
    dh = isObj(dh) ? dh : {};
    for (var i = 1; i <= 10; i++) {
      var on = !!dh[i], arafah = i === 9; if (on) c++;
      var lbl = arafah ? t('modes.dh.arafahCell', { n: nf(i) }) : t('modes.dh.cell', { n: nf(i) });
      cells += '<li><button type="button" class="tr-cell' + (on ? ' is-on' : '') + (i === h.day ? ' is-today' : '') + (arafah ? ' is-arafah' : '') + '" aria-pressed="' + on + '" data-act="tr.dh" data-arg="' + i + '" aria-label="' + esc(lbl) + '"' + (i === h.day ? ' aria-current="date"' : '') + '>' +
        esc(nf(i)) + (arafah ? '<span class="tr-cell-dot" aria-hidden="true"></span>' : '') + '</button></li>';
    }
    return ui.card({ kicker: { icon: 'mountain', text: t('modes.dh.kicker') }, cls: 'tr-dh',
      body: '<p class="quote">' + esc(t('modes.dh.quote')) + '</p>' + ui.ref({ ref: 'Tirmidhi 757', url: 'https://sunnah.com/tirmidhi:757', grade: 'Sahih (al-Albani)' }) +
        '<p class="mt-3">' + esc(t('modes.dh.hint')) + '</p><ul class="tr-cells tr-cells-5 mt-3">' + cells + '</ul>' +
        '<p class="caption mt-2 tr-cells-cap"><span>' + esc(t('modes.dh.count', { n: nf(c) })) + '</span><span class="tr-cell-key"><span class="tr-cell-dot" aria-hidden="true"></span>' + esc(t('modes.dh.arafahKey', { n: nf(9) })) + '</span></p>' });
  }
  function prepRow() {
    if (!RS.router.has('prep')) return '';
    var active = !!(RS.prep && typeof RS.prep.active === 'function' && cloudTry(function () { return RS.prep.active(); }, false));
    var dl = daysToRamadan();
    return ui.card({ cls: 'is-tight', body: ui.list([ui.row({ icon: 'sprout', title: t(active ? 'modes.prep.continue' : 'modes.prep.start'),
      sub: dl != null ? tn('modes.prep.days', dl) : t('modes.prep.sub'), act: 'nav.go', arg: 'prep', chevron: true })]) });
  }

  /* ================================================================ QURAN */
  function renderQuran(view) {
    var ram = RS.appMode() === 'ramadan';
    // a new Ramadan with last season's pages still on the device: neutral until the archive question is answered
    if (ram && archiveAsk) {
      RS.topbar({ title: t('nav.quran'), sub: RS.fmt.hijri() });
      view.innerHTML = archiveWait() + quranLinks();
      return;
    }
    RS.topbar({ title: t('nav.quran'), sub: ram ? t('today.step.title', { n: nf(curDay()) }) : RS.fmt.hijri() });
    view.innerHTML = ram ? quranRamadan() : quranYear();
  }
  function qMessage(tot, left, pace) {
    var p = tot / Q_TOTAL * 100;
    if (tot === 0) return t('quran.msg.start');
    if (left === 0) return t('quran.msg.done');
    if (p >= 75) return tn('quran.msg.almost', left);
    if (p >= 50) return tn('quran.msg.half', pace);
    return tn('quran.msg.going', left, { pace: nf(pace) });
  }
  function quranRamadan() {
    var day = curDay(), q = qObj(), tot = qTotal(q), today = qOf(q, day);
    var left = Math.max(0, Q_TOTAL - tot), dLeft = Math.max(1, DAYS - day + 1), pace = left > 0 ? Math.ceil(left / dLeft) : 0;
    var pc = Math.min(100, Math.round(tot / Q_TOTAL * 100));
    var vals = [], labels = [], logRows = [];
    for (var d = 1; d <= DAYS; d++) { vals.push(qOf(q, d)); labels.push(d === 1 || d % 5 === 0 ? nf(d) : ''); }
    for (d = DAYS; d >= 1; d--) if (qOf(q, d)) logRows.push(ui.row({ title: t('quran.logDay', { n: nf(d) }), value: tn('quran.pages', qOf(q, d)), cls: d === day ? 'is-current' : '' }));
    var h = [];
    h.push(ui.hero({
      kicker: { icon: 'book-open', text: t('quran.kicker') }, number: nf(tot), unit: tn('quran.unit', tot),
      label: left === 0 ? t('quran.complete') : t('quran.of', { juz: nf(juzOf(tot)) }),
      ring: { pct: pc, text: pf(pc), label: t('quran.ring', { pct: pf(pc) }) },
      // the pages of the day being viewed: "Today" only when it is today's date in a live Ramadan
      metrics: [{ label: liveDay() === day ? t('quran.mToday') : t('quran.mDay', { n: nf(day) }), value: nf(today) },
        { label: t('quran.mNeeded'), value: left === 0 ? '\u2013' : nf(pace) }, { label: t('quran.mDaysLeft'), value: nf(dLeft) }],
      cta: { eyebrow: t('quran.ctaEyebrow'), text: t('quran.cta'), act: 'tr.qlog' }
    }));
    h.push(ui.card({ kicker: { icon: 'chart-column', text: t('quran.chartTitle') }, cls: 'tr-qchart-card',
      body: pagesChart(vals, { labels: labels, highlight: day - 1, pace: Q_TOTAL / DAYS, label: t('quran.chartLabel', { total: nf(tot) }) }) +
        '<p class="caption mt-2 tr-legend"><span class="tr-key tr-key-pace" aria-hidden="true"></span>' + esc(tn('quran.paceKey', Math.round(Q_TOTAL / DAYS))) + '</p>' }));
    h.push(ui.note(qMessage(tot, left, pace), { icon: 'sprout' }));
    h.push(ui.card({ kicker: { icon: 'list', text: t('quran.logTitle') }, cls: 'tr-qlog',
      body: logRows.length ? ui.list(logRows) : ui.empty({ icon: 'book-open', title: t('quran.emptyTitle'), body: t('quran.emptyBody'), action: { text: t('quran.cta'), act: 'tr.qlog', icon: 'plus' } }) }));
    h.push(quranQuote());
    h.push(quranLinks());
    return h.join('');
  }
  function quranYear() {
    var log = qlog(), iso = RS.todayISO(), all = 0, last30 = 0, vals = [], labels = [], rows = [];
    Object.keys(log).forEach(function (k) { if (/^\d{4}-\d{2}-\d{2}$/.test(k)) all += qlogOf(log, k); });
    for (var i = 29; i >= 0; i--) {
      var dt = noonPlus(-i), k = RS.todayISO(dt), v = qlogOf(log, k);
      vals.push(v); last30 += v; labels.push(i % 5 === 0 ? RS.fmt.date(dt, { day: 'numeric' }) : '');
    }
    Object.keys(log).filter(function (k) { return /^\d{4}-\d{2}-\d{2}$/.test(k) && qlogOf(log, k) > 0; }).sort().reverse().slice(0, 60).forEach(function (k) {
      rows.push(ui.row({ title: RS.fmt.date(k, { weekday: 'short', day: 'numeric', month: 'short' }), value: tn('quran.pages', qlogOf(log, k)), cls: k === iso ? 'is-current' : '' }));
    });
    var kh = Math.floor(all / Q_TOTAL), cur = all - kh * Q_TOTAL, pc = Math.round(cur / Q_TOTAL * 100);
    var h = [];
    h.push(ui.hero({
      kicker: { icon: 'book-open', text: t('quran.kickerYear') }, number: nf(cur), unit: tn('quran.unit', cur),
      label: t('quran.of', { juz: nf(juzOf(cur)) }), ring: { pct: pc, text: pf(pc), label: t('quran.ring', { pct: pf(pc) }) },
      metrics: [{ label: t('quran.mToday'), value: nf(qlogOf(log, iso)) }, { label: t('quran.m30'), value: nf(last30) }, { label: t('quran.mKhatms'), value: nf(kh) }],
      cta: { eyebrow: t('quran.ctaEyebrow'), text: t('quran.cta'), act: 'tr.qlog' }
    }));
    h.push(ui.card({ kicker: { icon: 'chart-column', text: t('quran.chart30') },
      body: pagesChart(vals, { labels: labels, highlight: 29, label: t('quran.chart30Label', { total: nf(last30) }) }) }));
    h.push(ui.card({ kicker: { icon: 'list', text: t('quran.logTitle') }, cls: 'tr-qlog',
      body: rows.length ? ui.list(rows) : ui.empty({ icon: 'book-open', title: t('quran.emptyTitle'), body: t('quran.emptyBodyYear'), action: { text: t('quran.cta'), act: 'tr.qlog', icon: 'plus' } }) }));
    h.push(quranQuote());
    h.push(quranLinks());
    return h.join('');
  }
  function quranQuote() {
    return ui.card({ kicker: { icon: 'book-heart', text: t('quran.quoteKicker') },
      body: '<p class="quote">' + esc(t('quran.quote')) + '</p>' + ui.ref({ ref: 'Quran 2:185', url: 'https://quran.com/2/185', grade: 'Quran' }) + '<p class="mt-3">' + esc(t('quran.quoteTail')) + '</p>' });
  }
  function quranLinks() {
    return ui.card({ kicker: { icon: 'headphones', text: t('quran.linksTitle') }, cls: 'is-tight tr-links-card', body: ui.list([
      ui.row({ icon: 'mic', title: 'Tarteel AI', sub: t('quran.tarteel'), href: 'https://tarteel.ai/' }),
      ui.row({ icon: 'book-open', title: 'Quran.com', sub: t('quran.qcom'), href: 'https://quran.com/' })
    ]) });
  }
  // Pages-per-day bars with an optional dashed pace line. Axis labels are HTML under the SVG (12px at every width);
  // days run left to right in both directions, like ui.bars.
  function pagesChart(vals, o) {
    var nv = vals.length, W = 300, H = 96;
    var vmax = Math.max.apply(null, vals.concat([1]));
    var max = Math.max(vmax, o.pace ? o.pace * 1.25 : 0, 4);
    var slot = W / nv, bw = Math.max(2, slot * 0.62), rx = Math.min(bw / 2, 3), out = '', axis = '';
    vals.forEach(function (v, i) {
      var hh = v > 0 ? Math.max(3, v / max * H) : 2, x = i * slot + (slot - bw) / 2, hi = i === o.highlight;
      out += '<rect class="bars-b' + (hi ? ' is-hi' : '') + (v > 0 ? '' : ' is-zero') + '" x="' + x.toFixed(2) + '" y="' + (H - hh).toFixed(2) + '" width="' + bw.toFixed(2) + '" height="' + hh.toFixed(2) + '" rx="' + rx.toFixed(2) + '"/>';
      if (o.labels && o.labels[i]) axis += '<span class="bars-lbl' + (hi ? ' is-hi' : '') + '" style="left:' + ((i + 0.5) / nv * 100).toFixed(3) + '%">' + esc(o.labels[i]) + '</span>';
    });
    if (o.pace) { var y = (H - o.pace / max * H).toFixed(2); out += '<line class="tr-pace" x1="0" x2="' + W + '" y1="' + y + '" y2="' + y + '"/>'; }
    return '<div class="bars-wrap tr-qchart-wrap"><svg class="chart bars tr-qchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label) + '" focusable="false">' + out + '</svg>' +
      (axis ? '<div class="bars-axis" aria-hidden="true">' + axis + '</div>' : '') + '</div>';
  }

  function openQuranSheet() {
    var ram = RS.appMode() === 'ramadan', day = curDay(), iso = RS.todayISO();
    var cur = ram ? qOf(qObj(), day) : qlogOf(qlog(), iso);
    var so = ram ? tn('quran.sheetSoFar', cur, { day: nf(day) }) : tn('quran.sheetSoFarToday', cur);
    RS.sheet.open({
      title: t('quran.sheetTitle'),
      body: '<form id="tr-q-form" data-act-submit="tr.qsave" novalidate><p class="tr-q-so">' + esc(so) + '</p>' +
        '<div class="chips mt-3" role="group" aria-label="' + esc(t('quran.quick')) + '">' + [1, 5, 10, 20].map(function (v) { return ui.chip(signed(v), { act: 'tr.qchip', arg: v }); }).join('') + '</div>' +
        '<div class="mt-4">' + ui.field({ id: 'tr-q-add', name: 'pages', label: t('quran.addLabel'), type: 'number', inputmode: 'numeric', min: 1, max: Q_TOTAL, placeholder: '0', hint: t('quran.addHint'), attrs: { step: '1' } }) + '</div>' +
        (cur > 0 ? '<div class="mt-3">' + ui.btn(t('quran.clear'), { act: 'tr.qclear', variant: 'danger', icon: 'trash-2' }) + '</div>' : '') + '</form>',
      actions: [{ text: t('core.cancel'), act: 'sheet.close' }, { text: t('quran.addBtn'), variant: 'primary', type: 'submit', attrs: { form: 'tr-q-form' } }]
    });
  }
  function addPages(v) {
    var ram = RS.appMode() === 'ramadan', mode = RS.appMode(), total, day = curDay(), iso = RS.todayISO();
    if (ram) {
      var q = qObj();
      total = qOf(q, day) + v;
      q[day] = total;
      RS.store.set('rs-quran-pages', q);
      var ctx = rCtx(day), r = getRec(ctx.key);
      if (!(r && r.ck['quran-recitation'])) change(ctx, function (ck) { ck['quran-recitation'] = true; }, { id: 'quran-recitation' });
    } else {
      total = qlogOf(qlog(), iso) + v;
      setExtra('qlog', iso, { p: total, ts: Date.now() }, true);
      if (mode === 'year') {
        var y = yCtx(iso), yr = getRec(y.key);
        if (!(yr && yr.ck['quran-recitation'])) change(y, function (ck) { ck['quran-recitation'] = true; }, { id: 'quran-recitation' });
      }
    }
    emit();
    return { total: total, day: day, ram: ram };
  }

  /* ================================================================ ME */
  function meData() {
    var recs = allDays(), dc = 0, tp = 0, pd = 0, pts = 0, best = { d: 0, p: 0 }, last = 0, lastRec = 0;
    for (var d = 1; d <= DAYS; d++) {
      var x = recs[d];
      if (!x) continue;
      pts += x.pts || 0;
      lastRec = d;
      if (x.pct > 0) { dc++; tp += x.pct; last = d; if (x.pct === 100) pd++; if (x.pct > best.p) best = { d: d, p: x.pct }; }
    }
    return { recs: recs, dc: dc, avg: dc ? Math.round(tp / dc) : 0, pd: pd, pts: pts, best: best, last: last, lastRec: lastRec, q: qTotal() };
  }
  T.totals = function () {
    var m = meData();
    return { daysLogged: m.dc, avgPct: m.avg, totalPts: m.pts, quranPages: m.q, perfectDays: m.pd, badges: badgeCount() };
  };
  T.points = function () { return meData().pts; };
  T.dayPct = function (d) { var x = T.getDay(d); return x ? x.pct : 0; };
  T.todayIndex = function () { return curDay(); };
  T.saveDay = function () {
    var ctx = checkCtx(), r = getRec(ctx.key);
    if (!r) return null;
    var rec = build(ctx, r.ck, r.hayd, r.hck);
    RS.store.set(ctx.key, rec);
    emit();
    return rec;
  };
  // The Ramadan (Hijri year) the days on this device belong to: rs-season, else worked out from the data (v6 never
  // stored it, see inferSeason), else the Hijri year now (nothing logged yet).
  function season() { return storedSeason() || (hasRamadanData() ? inferSeason() : String(RS.hijri().year)); }
  function heatLv(x) { if (!x || !(x.pct > 0)) return 0; return x.pct >= 76 ? 4 : x.pct >= 51 ? 3 : x.pct >= 26 ? 2 : 1; }

  var catScope = 'day';
  function renderMe(view) {
    var m = meData(), b = T.best(), cur = T.streaks(), bm = badgeMap(), bc = badgeCount(bm), day = curDay();
    var bestAll = Math.max(b.fajr, b.night, b.quran, b.charity);
    RS.topbar({ title: t('nav.me'), sub: t('me.sub', { year: season() }),
      actions: RS.cloud ? [{ icon: 'share-2', act: 'share.progress', label: t('me.share') }] : [] });
    var h = [];
    h.push(ui.hero({
      kicker: { icon: 'chart-line', text: t('me.kicker') }, number: nf(m.avg), unit: '%',
      label: m.dc ? tn('me.avgLabel', m.dc) : t('me.avgNone'),
      ring: { pct: m.dc / DAYS * 100, text: nf(m.dc) + '/' + nf(DAYS), sub: t('me.ringSub'), label: t('me.ringLabel', { n: nf(m.dc) }) },
      metrics: [{ label: t('me.mPerfect'), value: nf(m.pd) }, { label: t('me.mBest'), value: nf(bestAll) }, { label: t('me.mBadges'), value: nf(bc) + '/' + nf(badges().length) }],
      cta: { eyebrow: t('me.ctaEyebrow'), text: t('me.cta'), act: 'tr.pdf' }
    }));
    // streaks
    h.push(ui.card({ kicker: { icon: 'flame', text: t('me.streaks') }, cls: 'tr-streaks', body: ui.list(SK.map(function (k) {
      return ui.row({ icon: SICON[k], title: streakName(k), subHtml: ui.meta([esc(t('me.streakSub.' + k)), esc(t('me.streakBest', { n: nf(b[k]) }))]), value: tn('me.days', cur[k]) });
    })) }));
    // heatmap
    var cells = '';
    for (var d = 1; d <= DAYS; d++) {
      var x = m.recs[d], lv = heatLv(x);
      var al = x ? (x.hayd ? t('me.heat.cellHayd', { n: nf(d), pct: pf(x.pct) }) : t('me.heat.cell', { n: nf(d), pct: pf(x.pct) })) : t('me.heat.cellNone', { n: nf(d) });
      cells += '<li><button type="button" class="tr-heat-c" data-lv="' + lv + '"' + (x && x.hayd ? ' data-hayd="1"' : '') + (d === day ? ' aria-current="date"' : '') +
        ' data-act="tr.heat" data-arg="' + d + '" aria-label="' + esc(al) + '">' + esc(nf(d)) + '</button></li>';
    }
    var anyHayd = Object.keys(m.recs).some(function (k) { return m.recs[k] && m.recs[k].hayd; });
    var legend = '<div class="tr-heat-leg" aria-hidden="true">' + (anyHayd ? '<span class="tr-heat-hk"><i data-hayd="1"></i>' + esc(t('me.heat.hayd')) + '</span>' : '') +
      '<span>' + esc(t('me.heat.less')) + '</span>' + [0, 1, 2, 3, 4].map(function (l) { return '<i data-lv="' + l + '"></i>'; }).join('') + '<span>' + esc(t('me.heat.more')) + '</span></div>';
    // the season's totals (v7 "Overall progress"; days logged is the hero's ring) head the 30-day card
    var totals = ui.metrics([{ label: t('me.tot.points'), value: nf(m.pts) }, { label: t('me.tot.quran'), value: nf(m.q) },
      { label: t('me.tot.best'), value: m.best.d ? t('me.tot.bestVal', { n: nf(m.best.d), pct: pf(m.best.p) }) : '\u2013' }], { cls: 'tr-totals' });
    h.push(ui.card({ kicker: { icon: 'calendar-days', text: t('me.heat.title') }, cls: 'tr-heat-card',
      body: totals + '<ul class="tr-heat mt-4" aria-label="' + esc(t('me.heat.title')) + '">' + cells + '</ul>' + legend + '<p class="caption mt-2">' + esc(t('me.heat.hint')) + '</p>' }));
    // comparison
    h.push(compareCard(m.recs, day));
    // trend: day 1 to the last day with a record; days without a record are gaps, never 0%
    var vals = [];
    for (d = 1; d <= m.lastRec; d++) vals.push(m.recs[d] ? m.recs[d].pct : null);
    h.push(ui.card({ kicker: { icon: 'chart-line', text: t('me.trend') },
      body: m.dc ? trendChart(vals, { label: tn('me.trendLabel', vals.filter(function (v) { return v != null; }).length, { last: nf(m.lastRec) }) })
        : ui.empty({ icon: 'chart-line', title: t('me.trendEmptyTitle'), body: t('me.trendEmpty') }) }));
    // categories
    h.push(categoriesCard(day, m.recs));
    // badges
    h.push(ui.card({ kicker: { icon: 'award', text: t('me.badges') }, title: t('me.badgesCount', { n: nf(bc), total: nf(badges().length) }),
      action: { text: t('me.badgesAll'), act: 'nav.go', arg: 'me/badges', icon: 'chevron-right' }, body: badgeGrid(bm) }));
    // cloud (account, competitions)
    if (RS.cloud && typeof RS.cloud.meCardsHtml === 'function') h.push(cloudTry(function () { return RS.cloud.meCardsHtml(); }, '') || '');
    // more
    var more = [
      ui.row({ icon: 'settings', title: t('me.settings'), sub: t('me.settingsSub'), act: 'nav.go', arg: 'me/settings', chevron: true }),
      ui.row({ icon: 'circle-help', title: t('me.guide'), sub: t('me.guideSub'), act: 'nav.go', arg: 'me/guide', chevron: true })
    ];
    if (RS.router.has('prep')) more.push(ui.row({ icon: 'sprout', title: t('me.prep'), sub: t('me.prepSub'), act: 'nav.go', arg: 'prep', chevron: true }));
    if (RS.cloud) more.push(ui.row({ icon: 'share-2', title: t('me.share'), sub: t('me.shareSub'), act: 'share.progress', chevron: true }));
    h.push(ui.card({ cls: 'is-tight', body: ui.list(more) }));
    // data
    h.push(ui.card({ kicker: { icon: 'file-text', text: t('me.data.title') }, cls: 'tr-data', body: ui.list([
      ui.row({ icon: 'download', title: t('me.data.export'), sub: t('me.data.exportSub'), act: 'tr.export' }),
      ui.row({ icon: 'upload', title: t('me.data.import'), sub: t('me.data.importSub'), act: 'tr.importpick' }),
      ui.row({ icon: 'trash-2', title: t('me.data.reset'), sub: t('me.data.resetSub'), act: 'tr.reset', cls: 'tr-danger' })
    ]) + '<input type="file" id="tr-import" class="tr-file" accept=".json,application/json" tabindex="-1" aria-hidden="true" data-act-change="tr.import">' }));
    // about
    h.push(aboutCard());
    view.innerHTML = h.join('');
  }

  function compareCard(recs, day) {
    var avg = function (a, b) { var s = 0, c = 0; for (var d = a; d <= b; d++) { var x = recs[d]; if (x && x.pct > 0) { s += x.pct; c++; } } return c ? Math.round(s / c) : null; };
    var th = [avg(1, 10), avg(11, 20), avg(21, 30)];
    var body = '<p class="tr-h3">' + esc(t('me.cmp.thirds')) + '</p>' + ui.metrics([
      { label: t('me.cmp.t1'), value: th[0] == null ? '\u2013' : pf(th[0]) }, { label: t('me.cmp.t2'), value: th[1] == null ? '\u2013' : pf(th[1]) },
      { label: t('me.cmp.t3'), value: th[2] == null ? '\u2013' : pf(th[2]) }], { cls: 'mt-2' });
    var cw = day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4;
    if (cw > 1) {
      var R = [[1, 7], [8, 14], [15, 21], [22, 30]];
      var pa = avg(R[cw - 2][0], R[cw - 2][1]), ca = avg(R[cw - 1][0], R[cw - 1][1]);
      body += '<hr class="divider"><p class="tr-h3">' + esc(t('me.cmp.weeks')) + '</p>' + ui.metrics([
        { label: t('me.cmp.week', { n: nf(cw - 1) }), value: pa == null ? '\u2013' : pf(pa) }, { label: t('me.cmp.week', { n: nf(cw) }), value: ca == null ? '\u2013' : pf(ca) }], { cls: 'mt-2' });
      // the difference of two averages is in percentage points (64% → 74% is "10 percentage points higher", not 10%);
      // only compared when both weeks have something logged
      if (pa != null && ca != null) {
        var diff = ca - pa;
        body += '<p class="tr-delta ' + (diff > 0 ? 'is-up' : diff < 0 ? 'is-down' : '') + '">' + RS.icon(diff > 0 ? 'arrow-up' : diff < 0 ? 'arrow-down' : 'minus', { size: 16 }) +
          '<span>' + esc(diff > 0 ? tn('me.cmp.up', diff) : diff < 0 ? tn('me.cmp.down', -diff) : t('me.cmp.same')) + '</span></p>';
      }
    }
    return ui.card({ kicker: { icon: 'scale', text: t('me.cmp.title') }, cls: 'tr-cmp', body: body });
  }

  // Only days with something ticked count: a day with no record (or nothing ticked) shows the empty state, not 0% bars.
  // Daily completion as a line (0-100%), one point per day from day 1 to the last day with a record. Days without a
  // record are gaps (a lone day is a dot), never drawn as 0%; faint guides at 0, 50 and 100% with HTML labels (12px at
  // every width). Days run left to right in both directions, like the other charts.
  function trendChart(vals, o) {
    var n = vals.length, W = 300, H = 88, PX = 6, PY = 7, li = -1;
    var X = function (i) { return n > 1 ? PX + i * (W - 2 * PX) / (n - 1) : W / 2; };
    var Y = function (v) { return PY + (H - 2 * PY) * (1 - RS.clamp(v, 0, 100) / 100); };
    var grid = [100, 50, 0].map(function (g) { var y = Y(g).toFixed(2); return '<line class="tr-grid" x1="0" x2="' + W + '" y1="' + y + '" y2="' + y + '"/>'; }).join('');
    var paths = '', dots = '', run = [];
    function flushRun() {
      if (run.length > 1) paths += '<path class="spark-line" d="' + run.map(function (p, k) { return (k ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2); }).join(' ') + '"/>';
      else if (run.length === 1) dots += '<circle class="tr-trend-pt" cx="' + run[0][0].toFixed(2) + '" cy="' + run[0][1].toFixed(2) + '" r="4"/>';
      run = [];
    }
    vals.forEach(function (v, i) { if (v == null) flushRun(); else { run.push([X(i), Y(v)]); li = i; } });
    flushRun();
    var end = li >= 0 ? '<circle class="spark-dot" cx="' + X(li).toFixed(2) + '" cy="' + Y(vals[li]).toFixed(2) + '" r="4"/>' : '';
    var yl = [100, 50, 0].map(function (g) { return '<span style="top:' + (Y(g) / H * 100).toFixed(2) + '%">' + esc(pf(g)) + '</span>'; }).join('');
    return '<div class="tr-trend"><div class="tr-trend-y" aria-hidden="true">' + yl + '</div>' +
      '<svg class="chart tr-trend-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label) + '" focusable="false">' + grid + paths + dots + end + '</svg>' +
      '<div class="tr-trend-x caption" aria-hidden="true"><span>' + esc(t('me.dayShort', { n: nf(1) })) + '</span>' + (n > 1 ? '<span>' + esc(t('me.dayShort', { n: nf(n) })) + '</span>' : '') + '</div></div>';
  }

  function categoriesCard(day, recs) {
    var list = Object.keys(recs).map(function (k) { return recs[k]; }).filter(function (r) { return r && r.done > 0; });
    if (catScope !== 'all') { var r = getRec(rCtx(day).key); list = r && r.done > 0 ? [r] : []; }
    var rows = sections().map(function (sec) {
      var ids = secIds(sec), done = 0, tot = 0;
      list.forEach(function (r) { ids.forEach(function (id) { if (!(id in r.ck)) return; tot++; if (r.ck[id]) done++; }); });
      if (!tot) return '';
      var p = Math.round(done / tot * 100), name = t('sec.' + sec.id + '.title');
      return '<div class="tr-cat"><div class="spread"><span class="tr-cat-n">' + RS.icon(sec.icon || 'list', { size: 16 }) + '<span>' + esc(name) + '</span></span><span class="strong">' + esc(pf(p)) + '</span></div>' +
        ui.bar(p, { label: t('me.cat.barLabel', { name: name, pct: pf(p) }) }) + '</div>';
    }).filter(Boolean);
    var seg = ui.seg([{ value: 'day', text: t('me.cat.day', { n: nf(day) }) }, { value: 'all', text: t('me.cat.all') }], catScope, { act: 'tr.catscope', label: t('me.cat.scope') });
    return ui.card({ kicker: { icon: 'chart-column', text: t('me.cat.title') }, cls: 'tr-cats',
      body: seg + (rows.length ? '<div class="stack mt-4">' + rows.join('') + '</div>' : '<p class="caption mt-4">' + esc(t('me.cat.empty')) + '</p>') });
  }

  function badgeGrid(m) {
    return '<ul class="tr-badges">' + badges().map(function (b) {
      var on = !!m[b.id], name = badgeName(b.id);
      return '<li><button type="button" class="tr-badge' + (on ? ' is-on' : '') + '" data-act="tr.badge" data-arg="' + esc(b.id) + '" aria-label="' + esc(name + ', ' + t(on ? 'me.badge.on' : 'me.badge.off')) + '">' +
        '<span class="tr-badge-ic" aria-hidden="true">' + RS.icon(b.icon || 'award', { size: 24 }) + (on ? '' : '<span class="tr-badge-lock">' + RS.icon('lock', { size: 12 }) + '</span>') + '</span>' +
        '<span class="tr-badge-n" aria-hidden="true">' + esc(name) + '</span></button></li>';
    }).join('') + '</ul>';
  }
  function badgeStatus(id, m) {
    var e = m[id];
    if (!e) return t('me.badge.locked');
    var d = isObj(e) && e.d ? new Date(e.d) : null;
    // a badge from older data (true, or no date) has no unlock date to show
    return d && !isNaN(d.getTime()) ? t('me.badge.unlocked', { date: RS.fmt.date(d, { day: 'numeric', month: 'long', year: 'numeric' }) }) : t('me.badge.unlockedNoDate');
  }
  function openBadge(id) {
    var b = badges().filter(function (x) { return x.id === id; })[0];
    if (!b) return;
    var m = badgeMap(), on = !!m[id];
    RS.sheet.open({ title: badgeName(id), cls: 'tr-badge-sheet',
      body: '<div class="tr-badge-big' + (on ? ' is-on' : '') + '" aria-hidden="true">' + RS.icon(b.icon || 'award', { size: 40 }) + '</div>' +
        '<p class="tr-rule"><span class="sr-only">' + esc(t('me.badge.rule')) + ': </span>' + esc(t('me.rule.' + id)) + '</p>' +
        '<p class="caption t-center mt-2">' + esc(badgeStatus(id, m)) + '</p>',
      actions: [{ text: t('core.close'), act: 'sheet.close' }] });
  }

  function aboutCard() {
    return ui.card({ kicker: { icon: 'info', text: t('me.about.title') }, cls: 'is-tight tr-about', body: ui.list([
      ui.row({ icon: 'badge-check', title: t('me.about.version'), value: RS.VERSION }),
      ui.row({ icon: 'lock', title: t('me.about.privacy'), sub: t('me.about.privacySub'), href: 'privacy.html', chevron: true }),
      ui.row({ icon: 'mail', title: t('me.about.feedback'), sub: t('me.about.feedbackSub'), href: 'mailto:' + FEEDBACK + '?subject=' + encodeURIComponent('Ramadan Strivers ' + RS.VERSION), chevron: true })
    ]) + '<p class="caption t-center tr-about-tag">' + esc(t('core.tagline')) + '<br>' + esc(t('me.about.free')) + '</p>' });
  }

  /* ---------------------------------------------------------------- day detail (sheet + route) */
  function dayParts(d) {
    var x = T.getDay(d), q = qOf(qObj(), d), j = jGet('r' + d), done = {}, missed = {};
    if (x) {
      sections().forEach(function (sec) {
        secIds(sec).forEach(function (id) {
          if (!(id in x.ck)) return;
          (x.ck[id] ? done : missed)[sec.id] = ((x.ck[id] ? done : missed)[sec.id] || []).concat([id]);
        });
      });
    }
    return { x: x, q: q, j: j, done: done, missed: missed };
  }
  // groups of deeds under their section names; level = the heading level below the card's own h2 (default h3)
  function deedGroups(groups, icon, level) {
    var out = '', hx = 'h' + RS.clamp(parseInt(level, 10) || 3, 2, 6);
    sections().forEach(function (sec) {
      var ids = groups[sec.id];
      if (!ids || !ids.length) return;
      out += '<' + hx + ' class="tr-sub">' + RS.icon(sec.icon || 'list', { size: 16 }) + '<span>' + esc(t('sec.' + sec.id + '.title')) + '</span></' + hx + '>' +
        ui.list(ids.map(function (id) { return ui.row({ lead: '<span class="tr-mini ' + icon + '" aria-hidden="true">' + RS.icon(icon === 'is-done' ? 'check' : 'minus', { size: 14 }) + '</span>', title: deedLabel(id) }); }), { cls: 'tr-compact' });
    });
    return out;
  }
  // The heatmap sheet is a short summary (metrics and one count per section); the full lists are on me/day
  // ("All details"). The summary is one focusable group, so the sheet can be scrolled from the keyboard when it
  // does not fit (small screens, large text).
  function openDaySheet(d) {
    var p = dayParts(d), x = p.x, body;
    if (!x && !p.q) body = ui.empty({ icon: 'calendar', title: t('me.day.noneTitle'), body: t('me.day.none') });
    else {
      body = ui.metrics([{ label: t('me.day.mPct'), value: x ? pf(x.pct) : '\u2013' }, { label: t('today.metric.deeds'), value: x ? nf(x.done) + '/' + nf(x.tot) : '\u2013' },
        { label: t('today.metric.points'), value: x ? nf(x.pts) : '\u2013' }, { label: t('today.metric.quran'), value: nf(p.q) }]);
      if (x && x.hayd) body += ui.note(t('me.day.hayd'), { icon: 'flower-2', tone: 'plain', cls: 'mt-3' });
      var rows = [];
      if (x) sections().forEach(function (sec) {
        var dn = (p.done[sec.id] || []).length, tot = dn + (p.missed[sec.id] || []).length;
        if (tot) rows.push(ui.row({ icon: sec.icon || 'list', title: t('sec.' + sec.id + '.title'), value: nf(dn) + '/' + nf(tot), cls: dn === tot ? 'is-full' : '' }));
      });
      if (rows.length) body += '<p class="tr-h3 mt-4">' + esc(t('me.day.bySection')) + '</p>' + ui.list(rows, { cls: 'tr-compact tr-daysum-list' });
      body = '<div class="tr-daysum" tabindex="0" role="group" aria-label="' + esc(t('me.day.summary', { n: nf(d) })) + '">' + body + '</div>';
    }
    // "Open in Today" only where Today shows Ramadan days; in year-round and Prep mode the day is changed on me/day
    var acts = RS.appMode() === 'ramadan'
      ? [{ text: t('me.day.details'), act: 'tr.daydetail', arg: d }, { text: t('me.day.open'), act: 'tr.dayopen', arg: d, variant: 'primary' }]
      : [{ text: t('core.close'), act: 'sheet.close' }, { text: t('me.day.edit'), act: 'tr.daydetail', arg: d, variant: 'primary' }];
    RS.sheet.open({ title: t('me.day.title', { n: nf(d) }), body: body, actions: acts });
  }
  // Ramadan mode: the day's summary (done and not done) and "Open in Today", which shows that day on Today.
  // Year-round and Prep mode, where Today shows other things: the day's checklist right here, so a past Ramadan day
  // can still be corrected (the ticks change rs-day-<n>, never the date or the day Today shows).
  function renderDay(view, params) {
    var d = RS.clamp(parseInt(params && params.n, 10) || curDay(), 1, DAYS), p = dayParts(d), x = p.x, ram = RS.appMode() === 'ramadan';
    RS.topbar({ title: t('me.day.title', { n: nf(d) }), sub: t('me.sub', { year: season() }), back: 'me' });
    var h = [ui.hero({
      kicker: { icon: 'calendar-days', text: t('today.kicker.day', { n: nf(d) }) }, number: x ? nf(x.pct) : '0', unit: '%',
      label: x ? t('me.day.label') : t('me.day.none'), ring: { pct: x ? x.pct : 0, id: 'tr-ring' },
      metrics: [{ label: t('today.metric.deeds'), value: x ? nf(x.done) + '/' + nf(x.tot) : '\u2013' }, { label: t('today.metric.points'), value: x ? nf(x.pts) : '\u2013' }, { label: t('today.metric.quran'), value: nf(p.q) }],
      cta: ram ? { eyebrow: t('me.day.ctaEyebrow'), text: t('me.day.open'), act: 'tr.dayopen', arg: d } : null
    })];
    if (!ram) {
      h.push(ui.note(t('me.day.editNote', { n: nf(d), year: season() }), { icon: 'info', tone: 'plain' }));
      h.push(checklist(rCtx(d), getRec('rs-day-' + d), { pin: d }));
    } else {
      if (x && x.hayd) h.push(ui.note(t('me.day.hayd'), { icon: 'flower-2', tone: 'plain' }));
      var dn = deedGroups(p.done, 'is-done', 3), ms = deedGroups(p.missed, 'is-missed', 3);
      if (x) {
        h.push(ui.card({ kicker: { icon: 'circle-check', text: t('me.day.done') }, body: dn || '<p class="caption">' + esc(t('me.day.noneDone')) + '</p>' }));
        if (ms) h.push(ui.card({ kicker: { icon: 'circle', text: t('me.day.missed') }, body: ms }));
      }
    }
    if (p.j && p.j.t) h.push(ui.card({ kicker: { icon: 'notebook-pen', text: t('journal.kicker') }, body: (p.j.p ? '<p class="tr-jprompt">' + esc(p.j.p) + '</p>' : '') + '<p class="tr-jtext">' + esc(p.j.t) + '</p>' }));
    view.innerHTML = h.join('');
  }

  /* ---------------------------------------------------------------- badges route */
  function renderBadges(view) {
    RS.topbar({ title: t('me.badges'), back: 'me' });
    var m = badgeMap(), c = badgeCount(m), tot = badges().length;
    view.innerHTML = ui.hero({
      // one string ("3/12"): a separate "/12" unit would take the RTL direction and read "3 12/" in Arabic
      kicker: { icon: 'award', text: t('me.badges') }, number: nf(c) + '/' + nf(tot), label: t('me.badgesLabel'),
      ring: { pct: tot ? c / tot * 100 : 0 }
    }) + ui.card({ cls: 'is-tight tr-badge-list', body: ui.list(badges().map(function (b) {
      var on = !!m[b.id];
      return ui.row({ lead: '<span class="tr-badge-ic sm' + (on ? ' is-on' : '') + '" aria-hidden="true">' + RS.icon(b.icon || 'award', { size: 20 }) + '</span>',
        title: badgeName(b.id), subHtml: esc(t('me.rule.' + b.id)) + '<span class="tr-badge-st' + (on ? ' is-on' : '') + '">' + esc(badgeStatus(b.id, m)) + '</span>', act: 'tr.badge', arg: b.id });
    })) });
  }

  /* ---------------------------------------------------------------- guide route */
  // The hero is the topic that matters most in the current mode (how Today works in Ramadan, the prep plan in Sha'ban,
  // modes and the Hijri date the rest of the year); its CTA opens that topic in the list.
  var GUIDE_START = { ramadan: 'today', prep: 'prep', year: 'modes' };
  // the first sentence(s) that fit in `max` characters; else a word-boundary cut with an ellipsis, never inside
  // an open parenthesis
  function excerpt(str, max) {
    str = String(str || '').trim();
    if (str.length <= max) return str;
    var cut = str.slice(0, max), end = -1, re = /[.!?\u3002\u061F](?=\s|$)/g, m;
    while ((m = re.exec(cut))) end = m.index;
    if (end >= 30) return cut.slice(0, end + 1);
    var sp = cut.lastIndexOf(' ');
    if (sp > 0) cut = cut.slice(0, sp);
    var open = cut.lastIndexOf('(');
    if (open > 30 && open > cut.lastIndexOf(')')) cut = cut.slice(0, open);
    return cut.replace(/[\s,;:\-\u2013\u2014(]+$/, '') + '\u2026';
  }
  function renderGuide(view) {
    RS.topbar({ title: t('me.guide'), back: 'me' });
    var g = (content().guide || []).filter(function (x) { return x && RS.has('guide.' + x.id + '.title'); });
    var feat = g.filter(function (x) { return x.id === GUIDE_START[RS.appMode()]; })[0] || g[0];
    var items = g.map(function (x) {
      var body = String(t('guide.' + x.id + '.body') || '').split(/\n+/).filter(Boolean).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
      return '<li class="li"><details class="tr-guide" id="tr-g-' + esc(x.id) + '"><summary class="row"><span class="row-ic" aria-hidden="true">' + RS.icon(x.icon || 'info', { size: 19 }) + '</span>' +
        '<span class="row-txt"><span class="row-title">' + esc(t('guide.' + x.id + '.title')) + '</span></span>' + RS.icon('chevron-down', { size: 18, cls: 'row-chev tr-guide-chev' }) + '</summary>' +
        '<div class="tr-guide-bd">' + body + '</div></details></li>';
    });
    var hero = feat ? ui.hero({ kicker: { icon: feat.icon || 'circle-help', text: t('me.guideStart') }, cls: 'tr-hero-topic',
      label: t('guide.' + feat.id + '.title'), text: excerpt(String(t('guide.' + feat.id + '.body') || '').split(/\n+/)[0], 190),
      cta: { eyebrow: tn('me.guideTopics', items.length), text: t('me.guideRead'), act: 'tr.guideopen', arg: feat.id } })
      : ui.hero({ kicker: { icon: 'circle-help', text: t('me.guide') }, cls: 'tr-hero-topic', label: t('me.guideEmpty') });
    view.innerHTML = hero +
      (items.length ? ui.card({ cls: 'is-tight', body: '<ul class="list">' + items.join('') + '</ul>' }) : ui.card({ body: ui.empty({ icon: 'circle-help', title: t('me.guideEmpty') }) })) +
      ui.card({ kicker: { icon: 'link', text: t('me.res.title') }, cls: 'tr-res', body: ui.list([
        ui.row({ icon: 'mic', title: 'Tarteel AI', sub: t('quran.tarteel'), href: 'https://tarteel.ai/' }),
        ui.row({ icon: 'heart', title: 'Life with Allah', sub: t('me.res.lwa'), href: APPS.lwa.url }),
        ui.row({ icon: 'scroll-text', title: 'Sunnah.com', sub: t('me.res.sunnah'), href: 'https://sunnah.com/' }),
        ui.row({ icon: 'book-open', title: 'Quran.com', sub: t('quran.qcom'), href: 'https://quran.com/' })
      ]) });
  }

  /* ---------------------------------------------------------------- settings route */
  function modeName(m) { return t('me.set.mode.' + (m || 'auto')); }
  function moonName(v) { return t(v === '-1' ? 'me.set.moonMinus' : v === '1' ? 'me.set.moonPlus' : 'me.set.moonZero'); }
  function openModeSheet() {
    var cur = RS.settings.mode || 'auto', opts = ['auto', 'ramadan', 'year'], month = RS.hijriMonth(RS.hijri().month);
    if (cur === 'prep') opts.splice(2, 0, 'prep');
    var rows = opts.map(function (v) {
      var on = v === cur;
      // each row switches to its mode and closes the sheet (an action, not a toggle): the current one is marked
      // aria-current rather than aria-pressed
      return ui.row({ lead: ui.check(on), title: modeName(v), sub: t('me.set.modeDesc.' + v, { month: month }), act: 'tr.modepick', arg: v,
        cls: on ? 'is-current' : '', attrs: { 'aria-current': on ? 'true' : null } });
    });
    RS.sheet.open({ title: t('me.set.modeTitle'), cls: 'tr-mode-sheet', body: ui.list(rows, { cls: 'tr-modes' }), actions: [{ text: t('core.close'), act: 'sheet.close' }] });
  }
  function renderSettings(view) {
    RS.topbar({ title: t('me.settings'), back: 'me' });
    var s = RS.settings, h = RS.hijri();
    var modeOpts = ['auto', 'ramadan', 'year'];
    if (s.mode === 'prep') modeOpts.splice(2, 0, 'prep');
    // The hero is the date everything else follows: the Hijri date as the app counts it, which decides the mode and
    // the Ramadan day (and is what the moon-sighting adjustment below corrects). Its CTA changes the mode.
    var moon = String(RS.clamp(parseInt(s.hijriOff, 10) || 0, -1, 1));
    var out = [ui.hero({
      kicker: { icon: 'calendar', text: t('me.set.heroKicker') }, number: nf(h.day), unit: RS.hijriMonth(h.month),
      label: t(s.mode ? 'me.set.heroManual' : 'me.set.heroAuto', { year: String(h.year) }),
      metrics: [{ label: t('me.set.mode'), value: t('core.mode.' + RS.appMode()) }, { label: t('me.set.mMoon'), value: moonName(moon) },
        { label: t('me.set.mDay'), value: t(s.autoDay !== false ? 'me.set.dayAuto' : 'me.set.dayManual') }],
      cta: { eyebrow: t('me.set.mode'), text: t('me.set.modeCta'), act: 'tr.modesheet' }
    })];
    out.push(ui.card({ kicker: { icon: 'palette', text: t('me.set.display') }, cls: 'tr-set', body:
      ui.select({ id: 'tr-set-lang', label: t('me.set.language'), value: RS.lang(), act: 'tr.lang', options: RS.LANGS.map(function (l) { return { value: l.code, text: l.name, lang: l.code, dir: l.dir }; }) }) +
      '<div class="field"><span class="field-lbl" id="tr-theme-lbl">' + esc(t('theme.label')) + '</span>' +
      ui.seg([{ value: 'system', text: t('theme.system') }, { value: 'light', text: t('theme.light') }, { value: 'dark', text: t('theme.dark') }], s.theme, { act: 'tr.theme', label: t('theme.label') }) + '</div>' +
      ui.select({ id: 'tr-set-level', label: t('me.set.level'), hint: t('me.set.levelSub'), value: s.level || 'adult', act: 'tr.level',
        options: ['adult', 'new', 'kids'].map(function (v) { return { value: v, text: t('me.set.level.' + v) }; }) }) +
      ui.list([ui.row({ title: t('me.set.detail'), sub: t('me.set.detailSub'), toggle: { on: !!s.detail, act: 'tr.detail' }, id: 'tr-set-detail' })], { cls: 'mt-3' }) }));
    out.push(ui.card({ kicker: { icon: 'calendar', text: t('me.set.calendar') }, cls: 'tr-set', body:
      ui.select({ id: 'tr-set-mode', label: t('me.set.mode'), hint: t('me.set.modeSub', { month: RS.hijriMonth(h.month) }), value: s.mode || 'auto', act: 'tr.mode',
        options: modeOpts.map(function (v) { return { value: v, text: modeName(v) }; }) }) +
      '<div class="field mt-3"><span class="field-lbl">' + esc(t('me.set.moon')) + '</span>' +
      ui.seg([{ value: '-1', text: t('me.set.moonMinus') }, { value: '0', text: t('me.set.moonZero') }, { value: '1', text: t('me.set.moonPlus') }], moon, { act: 'tr.moon', label: t('me.set.moon') }) +
      '<p class="field-hint">' + esc(t('me.set.moonSub')) + '</p></div>' +
      ui.list([ui.row({ title: t('me.set.autoDay'), sub: t('me.set.autoDaySub'), toggle: { on: s.autoDay !== false, act: 'tr.autoday' }, id: 'tr-set-autoday' })], { cls: 'mt-3' }) }));
    var cloudRows = RS.cloud && typeof RS.cloud.settingsRowsHtml === 'function' ? cloudTry(function () { return RS.cloud.settingsRowsHtml(); }, '') : '';
    if (cloudRows) out.push(ui.card({ kicker: { icon: 'cloud', text: t('me.set.cloud') }, cls: 'tr-set tr-set-cloud', body: cloudRows }));
    out.push(ui.card({ kicker: { icon: 'sprout', text: t('me.set.prep') }, cls: 'is-tight tr-set', body: ui.list([
      ui.row({ title: t('me.set.showPrep'), sub: t('me.set.showPrepSub'), toggle: { on: !!s.showPrep, act: 'tr.showprep' }, id: 'tr-set-prep' })]) }));
    view.innerHTML = out.join('');
  }
  function applyBody() {
    if (!document.body) return;
    document.body.classList.toggle('lvl-kids', RS.settings.level === 'kids');
  }
  function saveSetting(k, v) { RS.settings[k] = v; RS.saveSettings(); emit(); }

  /* ================================================================ Eid report (jsPDF) */
  var PDF_LANGS = ['en', 'es', 'fr', 'pt'];   // Helvetica covers Latin-1 only
  function pdfLang() { return PDF_LANGS.indexOf(RS.lang()) >= 0 ? RS.lang() : 'en'; }
  function pT(k, v) {
    var L = pdfLang(), d = RS.I18N[L] || {}, en = RS.I18N.en || {};
    var s = Object.prototype.hasOwnProperty.call(d, k) ? d[k] : (Object.prototype.hasOwnProperty.call(en, k) ? en[k] : k);
    return String(s).replace(/\{(\w+)\}/g, function (m0, kk) { return v && v[kk] != null ? String(v[kk]) : m0; });
  }
  function latin(s) {
    return String(s == null ? '' : s).replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2013\u2014\u2212]/g, '-').replace(/\u2026/g, '...').replace(/[\u00a0\u202f\u2009]/g, ' ')
      .replace(/\u00d7/g, 'x').replace(/\ufdfa/g, '(peace be upon him)');
  }
  // Journal text for the PDF. jsPDF's Helvetica prints WinAnsi (cp1252): Latin-1 plus the characters in CP1252
  // (œ Œ € š „ ‰ ™ …), so French "cœur", "10 €" or "Œuvre" print as they are. Emoji, variation selectors, joiners
  // and control characters are removed, and each run of another script becomes a short marker ("[Arabic]" or
  // "[...]"), so "said الحمد لله after Fajr 🙏" prints as "said [Arabic] after Fajr". Only an entry that would lose
  // more than half of its letters is replaced by a note (null); one with nothing left at all (only emoji) is skipped ('').
  var EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{E0020}-\u{E007F}\u{FE00}-\u{FE0F}\u{200B}-\u{200F}\u{20E3}]/gu;
  var CP1252 = '\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013\u2014\u2018\u2019\u201a\u201c\u201d\u201e\u2020\u2021\u2022\u2026\u2030\u2039\u203a\u20ac\u2122';
  var NOT_WIN = '[^\\u0000-\\u00ff' + CP1252 + ']';
  var OTHER_RUN = new RegExp(NOT_WIN + '+(?:[\\s.,;:!?\'"()\\-]+' + NOT_WIN + '+)*', 'g');
  var CTRL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
  var ARABIC = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/;
  function letters(str) { var m = String(str).match(/\p{L}/gu); return m ? m.length : 0; }
  function pdfText(str) {
    var s0 = latin(String(str == null ? '' : str).replace(EMOJI, '').replace(CTRL, ''));
    var before = letters(s0), kept = s0.replace(OTHER_RUN, ' ');
    var after = letters(kept);
    var out = s0.replace(OTHER_RUN, function (run) { return ARABIC.test(run) ? pT('me.pdf.arabic') : '[...]'; })
      .replace(/[ \t]{2,}/g, ' ').replace(/ +\n/g, '\n').trim();
    if (!before) return /[0-9A-Za-z]/.test(kept) ? kept.replace(/\s+/g, ' ').trim() : '';
    return after / before < 0.5 ? null : out;
  }
  var pdfBusy = false;
  function genPdf() {
    if (pdfBusy) return;                                  // a second tap while the report is being built does nothing
    pdfBusy = true;
    var cta = document.querySelector('[data-act="tr.pdf"]');
    if (cta) cta.setAttribute('aria-busy', 'true');
    RS.toast(t('me.pdf.loading'));
    var cool = 0;
    RS.lazy(JSPDF).then(function () {
      if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF did not load');
      buildPdf(new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }));
      RS.toast(t('me.pdf.done'), { tone: 'success' });
      cool = 1500;                                        // a double tap just after the download makes no second file
    }).catch(function (e) {
      if (window.console) console.warn('[tracker] the Eid report could not be created', e);   // handled: the user gets a toast
      RS.toast(t('me.pdf.failed'), { tone: 'error' });
    }).then(function () {
      setTimeout(function () {
        pdfBusy = false;
        var el = document.querySelector('[data-act="tr.pdf"]');
        if (el) el.removeAttribute('aria-busy');
      }, cool);
    });
  }
  function buildPdf(doc) {
    var L = pdfLang(), nfm = new Intl.NumberFormat(L + '-u-nu-latn'), dfm = new Intl.DateTimeFormat(L + '-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
    var N = function (x) { return nfm.format(x); };
    var PINE = [11, 34, 25], EMER = [4, 120, 87], MINT = [167, 243, 208], SOFT = [236, 253, 245], INK = [16, 25, 21], INK2 = [69, 82, 76], INK3 = [95, 108, 102], HAIR = [214, 224, 219];
    var W = 210, H = 297, M = 16, y = 0;
    // "current" streaks run up to today in a live Ramadan, else up to the last day with a record (not the day that
    // happens to be open on Today)
    var m = meData(), b = T.best(), q = qObj(), bm = badgeMap(), sea = season();
    var cur = streaksAt((!archiveAsk && liveDay()) || m.lastRec || curDay(), m.recs);
    function col(c, kind) { if (kind === 'fill') doc.setFillColor(c[0], c[1], c[2]); else if (kind === 'draw') doc.setDrawColor(c[0], c[1], c[2]); else doc.setTextColor(c[0], c[1], c[2]); }
    function font(style, size) { doc.setFont('helvetica', style); doc.setFontSize(size); }
    function room(hh) { if (y + hh > H - 18) { doc.addPage(); y = 20; } }
    function head(txt) {
      room(18); y += 4;
      font('bold', 10.5); col(EMER); doc.text(latin(txt).toUpperCase(), M, y);
      col(MINT, 'draw'); doc.setLineWidth(0.6); doc.line(M, y + 2.2, W - M, y + 2.2); y += 9;
    }
    function kv(label, value) {
      room(8); font('normal', 10); col(INK2); doc.text(latin(label), M, y);
      font('bold', 10); col(INK); doc.text(latin(value), W - M, y, { align: 'right' });
      col(HAIR, 'draw'); doc.setLineWidth(0.2); doc.line(M, y + 2.6, W - M, y + 2.6); y += 7.4;
    }
    // header band
    col(PINE, 'fill'); doc.rect(0, 0, W, 42, 'F');
    col(EMER, 'fill'); doc.rect(0, 42, W, 1.4, 'F');
    font('bold', 21); col([238, 248, 242]); doc.text(latin(pT('me.pdf.title')), M, 20);
    font('normal', 10.5); col(MINT); doc.text(latin(pT('me.pdf.subtitle', { year: sea })), M, 29);
    font('normal', 9); col([182, 206, 195]); doc.text(latin(pT('me.pdf.generated', { date: dfm.format(new Date()) })), W - M, 20, { align: 'right' });
    y = 56;
    // overall
    head(pT('me.pdf.overall'));
    kv(pT('me.pdf.daysLogged'), N(m.dc) + ' / ' + N(DAYS));
    kv(pT('me.pdf.avg'), N(m.avg) + '%');
    kv(pT('me.pdf.perfect'), N(m.pd));
    kv(pT('me.pdf.points'), N(m.pts));
    kv(pT('me.pdf.quran'), N(m.q) + ' / ' + N(Q_TOTAL));
    kv(pT('me.pdf.badges'), N(badgeCount(bm)) + ' / ' + N(badges().length));
    kv(pT('me.pdf.bestDay'), m.best.d ? pT('me.pdf.bestDayVal', { n: N(m.best.d), pct: N(m.best.p) + '%' }) : '-');
    // daily table
    y += 2; head(pT('me.pdf.daily'));
    var cols = [M + 2, M + 22, M + 54, M + 82, M + 110, M + 140];
    function tableHead() {
      col(PINE, 'fill'); doc.rect(M, y - 4.6, W - 2 * M, 7, 'F'); font('bold', 8.5); col([238, 248, 242]);
      ['me.pdf.colDay', 'me.pdf.colPct', 'me.pdf.colDone', 'me.pdf.colPts', 'me.pdf.colQuran', 'me.pdf.colNote'].forEach(function (k, i) { doc.text(latin(pT(k)), cols[i], y); });
      y += 6.6;
    }
    tableHead();
    for (var d = 1; d <= DAYS; d++) {
      if (y + 6 > H - 18) { doc.addPage(); y = 20; tableHead(); }
      var x = m.recs[d], qp = qOf(q, d);
      if (x && x.pct > 0) { col(SOFT, 'fill'); doc.rect(M, y - 4.2, W - 2 * M, 6, 'F'); }
      font('normal', 8.8); col(INK);
      doc.text(latin(pT('me.pdf.dayN', { n: N(d) })), cols[0], y);
      doc.text(x ? N(x.pct) + '%' : '-', cols[1], y);
      doc.text(x ? N(x.done) + '/' + N(x.tot) : '-', cols[2], y);
      doc.text(x ? N(x.pts) : '-', cols[3], y);
      doc.text(qp ? N(qp) : '-', cols[4], y);
      col(INK3); doc.text(x && x.hayd ? latin(pT('me.pdf.noteHayd')) : '', cols[5], y);
      y += 6;
    }
    // Quran
    y += 2; head(pT('me.pdf.quranTitle'));
    var qDays = 0, qBest = 0;
    for (d = 1; d <= DAYS; d++) { var v = qOf(q, d); if (v) { qDays++; qBest = Math.max(qBest, v); } }
    kv(pT('me.pdf.quranTotal'), N(m.q) + ' / ' + N(Q_TOTAL) + (m.q >= Q_TOTAL ? ' - ' + pT('me.pdf.khatm') : ''));
    kv(pT('me.pdf.quranJuz'), N(juzOf(m.q)) + ' / 30');
    kv(pT('me.pdf.quranDays'), N(qDays));
    kv(pT('me.pdf.quranBest'), N(qBest));
    // badges
    y += 2; head(pT('me.pdf.badgesTitle'));
    var any = false;
    badges().forEach(function (bd) {
      if (!bm[bd.id]) return;
      any = true;
      var e = bm[bd.id], dt = isObj(e) && e.d ? new Date(e.d) : null;
      kv(pT('badge.' + bd.id + '.name'), dt && !isNaN(dt.getTime()) ? dfm.format(dt) : '');
    });
    if (!any) { room(8); font('normal', 10); col(INK3); doc.text(latin(pT('me.pdf.noBadges')), M, y); y += 8; }
    // streaks
    y += 2; head(pT('me.pdf.streaksTitle'));
    SK.forEach(function (k) { kv(pT('me.streak.' + k), pT('me.pdf.streakVal', { best: N(b[k]), cur: N(cur[k]) })); });
    // reflections
    var jr = extras().journal, keys = isObj(jr) ? Object.keys(jr).filter(function (k) { return /^r\d+$/.test(k) && isObj(jr[k]) && jr[k].t && pdfText(jr[k].t) !== ''; }).sort(function (a, c) { return parseInt(a.slice(1), 10) - parseInt(c.slice(1), 10); }) : [];
    if (keys.length) {
      y += 2; head(pT('me.pdf.reflections'));
      keys.forEach(function (k) {
        var txt = pdfText(jr[k].t), lines = doc.splitTextToSize(txt == null ? pT('me.pdf.otherScript') : txt, W - 2 * M);
        room(6 + lines.length * 4.6);
        font('bold', 9.5); col(EMER); doc.text(latin(pT('me.pdf.dayN', { n: N(parseInt(k.slice(1), 10)) })), M, y); y += 5;
        font('normal', 9.5); col(txt == null ? INK3 : INK); doc.text(lines, M, y); y += lines.length * 4.6 + 3;
      });
    }
    // footer
    room(22); y += 6;
    col(MINT, 'draw'); doc.setLineWidth(0.6); doc.line(M, y, W - M, y); y += 8;
    font('bold', 10.5); col(EMER); doc.text(latin(pT('me.pdf.footer')), W / 2, y, { align: 'center' }); y += 6;
    font('normal', 8); col(INK3); doc.text(latin(pT('me.pdf.footer2', { v: RS.VERSION })), W / 2, y, { align: 'center' });
    var pages = doc.getNumberOfPages();
    for (var p = 1; p <= pages; p++) { doc.setPage(p); font('normal', 7.5); col(INK3); doc.text(N(p) + ' / ' + N(pages), W - M, H - 8, { align: 'right' }); }
    doc.save('Ramadan-Strivers-Eid-Report-' + sea + '.pdf');
  }

  /* ================================================================ backup: export / import / reset */
  function exportData() {
    var d = { app: 'ramadan-strivers', format: 8, version: RS.VERSION, exported: new Date().toISOString(),
      settings: getObj('rs-settings') || {}, badges: badgeMap(), bestStreaks: bestStored(), qPages: qObj(), days: {}, yr: {},
      extras: extras(), learn: getObj('rs-learn'), prep: getObj('rs-prep'),
      quiz: { stats: getObj('rs-quiz-stats'), best: getObj('rs-quiz-best') }, season: RS.store.raw('rs-season'), archives: {} };
    for (var i = 1; i <= DAYS; i++) { var x = getObj('rs-day-' + i); if (x) d.days[i] = x; }
    RS.store.keys('rs-yr-').forEach(function (k) { var v = getObj(k); if (v) d.yr[k.slice(6)] = v; });
    RS.store.keys('rs-archive-').forEach(function (k) { var v = RS.store.get(k, null); if (v != null) d.archives[k.slice(11)] = v; });
    try {
      var blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'ramadan-strivers-' + RS.todayISO() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      RS.toast(t('me.data.exported'), { tone: 'success' });
    } catch (e) { if (window.console) console.warn('[tracker] export failed', e); RS.toast(t('err.generic'), { tone: 'error' }); }
  }
  function cleanRec(r, extra) {
    var x = norm(r);
    if (!x) return null;
    var ck = {};
    Object.keys(x.ck).forEach(function (k) { if (/^[\w-]{1,60}$/.test(k)) ck[k] = !!x.ck[k]; });
    var o = { ck: ck, ts: x.ts || Date.now(), hayd: x.hayd, done: Math.round(x.done), tot: Math.round(x.tot), pct: RS.clamp(Math.round(x.pct), 0, 100), pts: Math.max(0, Math.round(x.pts)) };
    if (x.hck) { var hk = {}; Object.keys(x.hck).forEach(function (k) { if (/^[\w-]{1,60}$/.test(k) && x.hck[k]) hk[k] = true; }); if (Object.keys(hk).length) o.hck = hk; }
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function planImport(d) {
    if (!isObj(d)) return null;
    var looks = d.app === 'ramadan-strivers' || ['days', 'qPages', 'quranPages', 'badges', 'bestStreaks'].some(function (k) { return isObj(d[k]); });
    if (!looks) return null;
    var p = { days: {}, yr: {}, q: null, badges: null, best: null, settings: null, extras: null, learn: null, prep: null, qs: null, qb: null, season: null, archives: {}, nDays: 0, nPages: 0, nBadges: 0 };
    if (isObj(d.days)) Object.keys(d.days).forEach(function (k) {
      var n = parseInt(k, 10);
      if (String(n) !== String(k).trim() || !(n >= 1 && n <= DAYS)) return;
      var r = d.days[k];
      if (!isObj(r) || !(isObj(r.ck) || isObj(r.checklist))) return;
      p.days[n] = cleanRec(r, { day: n }); p.nDays++;
    });
    var qp = isObj(d.qPages) ? d.qPages : (isObj(d.quranPages) ? d.quranPages : null);
    if (qp) {
      p.q = {};
      Object.keys(qp).forEach(function (k) { var n = parseInt(k, 10), v = Math.round(Number(qp[k])); if (n >= 1 && n <= DAYS && isFinite(v) && v > 0 && v <= 1000) { p.q[n] = v; p.nPages += v; } });
    }
    if (isObj(d.badges)) {
      p.badges = {};
      Object.keys(d.badges).forEach(function (k) { if (/^[A-Za-z0-9_-]{1,40}$/.test(k) && d.badges[k]) { p.badges[k] = isObj(d.badges[k]) ? { u: 1, d: String(d.badges[k].d || '') } : { u: 1, d: '' }; p.nBadges++; } });
    }
    if (isObj(d.bestStreaks)) { p.best = {}; SK.forEach(function (k) { var v = Number(d.bestStreaks[k]); p.best[k] = isFinite(v) ? RS.clamp(Math.round(v), 0, DAYS) : 0; }); }
    if (isObj(d.settings)) {
      p.settings = {};
      Object.keys(RS.DEFAULTS).concat(['secOpen']).forEach(function (k) { if (k in d.settings) p.settings[k] = d.settings[k]; });
    }
    if (isObj(d.yr)) Object.keys(d.yr).forEach(function (k) { if (/^\d{4}-\d{2}-\d{2}$/.test(k) && isObj(d.yr[k]) && isObj(d.yr[k].ck)) p.yr[k] = cleanRec(d.yr[k], { date: k }); });
    if (isObj(d.extras)) p.extras = d.extras;
    if (isObj(d.learn)) p.learn = d.learn;
    if (isObj(d.prep)) p.prep = d.prep;
    if (isObj(d.quiz)) { if (isObj(d.quiz.stats)) p.qs = d.quiz.stats; if (isObj(d.quiz.best)) p.qb = d.quiz.best; }
    if (d.season != null && /^\d{4}$/.test(String(d.season))) p.season = String(d.season);
    if (isObj(d.archives)) Object.keys(d.archives).forEach(function (k) { if (/^\d{4}$/.test(k) && d.archives[k] != null) p.archives[k] = d.archives[k]; });
    return p;
  }
  // Merge by key, as the confirmation says: a day, date, Quran-page day, journal entry, Sunnah fast, Shawwal/Dhul Hijjah
  // year or intention in the file replaces the same one on this device; everything else here is kept. Only the
  // single-value sections (the dua list and the qada counter) are replaced as a whole when the file has them.
  // Learning and Ramadan Prep progress (other modules' stores) are merged one level deep the same way.
  var WHOLE = { duas: 1, qada: 1 };
  function assign(a, b) { var o = {}; [a, b].forEach(function (m) { if (isObj(m)) Object.keys(m).forEach(function (k) { o[k] = m[k]; }); }); return o; }
  function merge1(cur, inc) {
    var out = assign(cur, null);
    Object.keys(inc).forEach(function (k) { out[k] = isObj(out[k]) && isObj(inc[k]) ? assign(out[k], inc[k]) : inc[k]; });
    return out;
  }
  function applyImport(p) {
    Object.keys(p.days).forEach(function (n) { RS.store.set('rs-day-' + n, p.days[n]); });
    Object.keys(p.yr).forEach(function (k) { RS.store.set('rs-yr-' + k, p.yr[k]); });
    if (p.q) RS.store.set('rs-quran-pages', assign(qObj(), p.q));
    if (p.badges) { var bm = badgeMap(); Object.keys(p.badges).forEach(function (k) { if (!bm[k]) bm[k] = p.badges[k]; }); RS.store.set('rs-badges', bm); }
    if (p.best) { var b = bestStored(); SK.forEach(function (k) { b[k] = Math.max(b[k], p.best[k] || 0); }); RS.store.set('rs-best-streaks', b); }
    if (p.settings) { var s = getObj('rs-settings') || {}; Object.keys(p.settings).forEach(function (k) { s[k] = p.settings[k]; }); RS.store.set('rs-settings', s); }
    if (p.extras) {
      var x = extras();
      Object.keys(p.extras).forEach(function (k) { var v = p.extras[k]; x[k] = !WHOLE[k] && isObj(x[k]) && isObj(v) ? assign(x[k], v) : v; });
      RS.store.set('rs-extras', x);
    }
    if (p.learn) RS.store.set('rs-learn', merge1(getObj('rs-learn'), p.learn));
    if (p.prep) RS.store.set('rs-prep', merge1(getObj('rs-prep'), p.prep));
    if (p.qs) { var qs = getObj('rs-quiz-stats'); if (!qs || num(p.qs.ans) >= num(qs.ans)) RS.store.set('rs-quiz-stats', p.qs); }
    if (p.qb) { var qb = getObj('rs-quiz-best') || {}; Object.keys(p.qb).forEach(function (k) { var v = num(p.qb[k]); if (!(num(qb[k]) >= v)) qb[k] = v; }); RS.store.set('rs-quiz-best', qb); }
    if (p.season) RS.store.setRaw('rs-season', p.season);
    Object.keys(p.archives).forEach(function (k) { var v = p.archives[k]; if (typeof v === 'string') RS.store.setRaw('rs-archive-' + k, v); else RS.store.set('rs-archive-' + k, v); });
  }
  function importFile(file) {
    var r = new FileReader();
    r.onload = function () {
      var data = null;
      try { data = JSON.parse(String(r.result || '')); } catch (e) { data = null; }
      var p = planImport(data);
      if (!p) { RS.toast(t('me.data.invalid'), { tone: 'error' }); return; }
      RS.confirm({ title: t('me.data.importTitle'), ok: t('me.data.importOk'),
        body: t('me.data.importBody', { days: tn('me.data.nDays', p.nDays), pages: tn('me.data.nPages', p.nPages), badges: tn('me.data.nBadges', p.nBadges) }) }).then(function (ok) {
        if (!ok) return;
        try { applyImport(p); } catch (e) { if (window.console) console.warn('[tracker] import failed', e); RS.toast(t('err.generic'), { tone: 'error' }); return; }
        emit();
        RS.toast(t('me.data.imported'), { tone: 'success' });
        setTimeout(function () { location.reload(); }, 1300);
      });
    };
    r.onerror = function () { RS.toast(t('me.data.invalid'), { tone: 'error' }); };
    r.readAsText(file);
  }
  function resetAll() {
    RS.confirm({ title: t('me.data.reset1Title'), body: t('me.data.reset1Body'), ok: t('me.data.reset1Ok'), danger: true }).then(function (ok) {
      if (!ok) return null;
      return RS.confirm({ title: t('me.data.reset2Title'), body: t('me.data.reset2Body'), ok: t('me.data.reset2Ok'), danger: true });
    }).then(function (ok) {
      if (!ok) return;
      RS.store.keys('rs-').forEach(function (k) { RS.store.del(k); });
      RS.toast(t('me.data.resetDone'));
      // reminders: without rs-push the settings could no longer turn them off, so this browser's push
      // subscription is cancelled too (the server drops an endpoint that no longer accepts pushes)
      Promise.race([dropPush(), new Promise(function (r) { setTimeout(r, 1200); })]).then(function () { setTimeout(function () { location.reload(); }, 300); });
    });
  }
  function dropPush() {
    try {
      if (!('serviceWorker' in navigator) || !navigator.serviceWorker.getRegistration) return Promise.resolve();
      return navigator.serviceWorker.getRegistration().then(function (reg) { return reg && reg.pushManager ? reg.pushManager.getSubscription() : null; })
        .then(function (sub) { return sub ? sub.unsubscribe() : null; }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(); }
  }

  /* ================================================================ boot: auto day, new season, reminder */
  var autoFor = 0;
  function autoDay(quiet) {
    var h = RS.hijri();
    if (RS.settings.autoDay === false || h.month !== 9 || RS.appMode() !== 'ramadan') return false;
    var d = RS.clamp(h.day, 1, DAYS);
    if (autoFor === d) return false;
    autoFor = d;
    if (RS.settings.day === d) return false;
    RS.settings.day = d;
    RS.saveSettings();
    if (!quiet) RS.emit('day', d);
    return true;
  }
  function hasRamadanData() { for (var i = 1; i <= DAYS; i++) if (RS.store.raw('rs-day-' + i) != null) return true; return qTotal() > 0; }
  function storedSeason() { var s = String(RS.store.raw('rs-season') || '').trim(); return /^\d{4}$/.test(s) ? s : ''; }
  // The Ramadan that data saved at time `ms` belongs to: the latest one that had begun by then (Hijri month 9 or
  // later of that year, else the year before).
  function seasonAt(ms) { var h = RS.hijri(new Date(ms)); return String(h.month >= 9 ? h.year : h.year - 1); }
  // rs-season is missing when the days were saved by v6, which never stored it (v6 was the live version in Ramadan
  // 1447 AH; v7 came later). The season then comes from the data, never from today's date: the newest timestamp of a
  // day record or a Ramadan journal entry (v6 and v7 save one with each). Data with no timestamp at all counts as the
  // season before the current one until the current Ramadan is over, so a new Ramadan still asks what to do with it.
  var TS_MIN = Date.UTC(2020, 0, 1);       // an older "timestamp" (0, 1, …) is not a real save time
  function inferSeason() {
    var ts = 0, j = extras().journal;
    var see = function (v) { v = num(v); if (v >= TS_MIN && v > ts) ts = v; };
    for (var i = 1; i <= DAYS; i++) { var r = getRec('rs-day-' + i); if (r) see(r.ts); }
    if (isObj(j)) Object.keys(j).forEach(function (k) { if (/^r\d+$/.test(k) && isObj(j[k])) see(j[k].ts); });
    if (ts) return seasonAt(Math.min(ts, Date.now()));
    var h = RS.hijri();
    return String(h.month > 9 ? h.year : h.year - 1);
  }
  // Boot, before the first render: days without rs-season get their season from the data, and a device with nothing
  // logged starts the season when Ramadan begins (v7 rule). Saved silently (rs-season is not in the cloud snapshot).
  function seasonBoot() {
    if (storedSeason()) return;
    var h = RS.hijri(), s = hasRamadanData() ? inferSeason() : (h.month === 9 ? String(h.year) : '');
    if (s) RS.store.setRaw('rs-season', s);
  }
  // v7 archiveCheck: a new Ramadan (Hijri year) with an earlier season's days on the device → offer to archive them.
  // Only an explicit choice in the sheet stores anything. Closing it (Escape, Back, the scrim, the close button) means
  // "later": rs-season stays as it was, Today and Quran keep a neutral hero (archiveWait) whose button asks again, and
  // the question comes back at the next start. Last season's records are never shown as this Ramadan's.
  var archiveAsk = null, archiveSheet = false;
  function archiveNeeded() {
    var h = RS.hijri();
    if (h.month !== 9 || !hasRamadanData()) return null;
    var sea = season();
    return sea === String(h.year) ? null : { year: String(h.year), old: sea };
  }
  function archiveWait() {
    var a = archiveAsk;
    return ui.hero({ kicker: { icon: 'moon', text: t('today.archive.kicker', { year: a.year }) }, label: t('today.archive.title'), cls: 'tr-hero-topic',
      text: t('today.archive.wait', { old: a.old }), cta: { eyebrow: t('today.archive.eyebrow'), text: t('today.archive.choose'), act: 'tr.archive' } });
  }
  // Re-reads the question (at start-up, when the app comes back to the foreground, from the neutral hero's button);
  // open: show it now.
  function archiveCheck(open) {
    var h = RS.hijri();
    // nothing on the device to move: the new season simply starts (v7)
    if (h.month === 9 && !hasRamadanData() && storedSeason() !== String(h.year)) RS.store.setRaw('rs-season', String(h.year));
    var was = !!archiveAsk;
    archiveAsk = archiveNeeded();
    if (!!archiveAsk !== was) softRefresh();
    if (archiveAsk && open) openArchiveSheet();
  }
  function openArchiveSheet() {
    var a = archiveAsk;
    if (!a || archiveSheet) return;
    archiveSheet = true;
    RS.sheet.open({
      title: t('today.archive.title'), cls: 'tr-archive-sheet',
      body: '<p>' + esc(t('today.archive.body', { year: a.year, old: a.old })) + '</p><p class="caption mt-3">' + esc(t('today.archive.later')) + '</p>',
      actions: [{ text: t('today.archive.cancel'), act: 'tr.archivekeep' }, { text: t('today.archive.ok'), act: 'tr.archivego', variant: 'primary' }],
      onClose: function () { archiveSheet = false; }
    });
  }
  // archive: the old season's days, Quran pages and Ramadan journal entries move to rs-archive-<old season> (an
  // archive already there for that season keeps whatever this one does not replace); otherwise they stay where they
  // are and count as this season's (v7 "Cancel"). Badges and best streaks stay either way.
  function archiveAnswer(archive) {
    var a = archiveAsk;
    RS.sheet.close();
    if (!a) return;
    if (archive) {
      var prev = RS.store.get('rs-archive-' + a.old, null);
      var arc = { days: {}, qPages: RS.store.raw('rs-quran-pages'), best: RS.store.raw('rs-best-streaks'), journal: {} };
      for (var d = 1; d <= DAYS; d++) { var k = RS.store.raw('rs-day-' + d); if (k != null) { arc.days[d] = k; RS.store.del('rs-day-' + d); } }
      RS.store.del('rs-quran-pages');
      var x = extras();
      if (isObj(x.journal)) Object.keys(x.journal).forEach(function (jk) { if (/^r\d+$/.test(jk)) { arc.journal[jk] = x.journal[jk]; delete x.journal[jk]; } });
      RS.store.set('rs-extras', x);
      if (isObj(prev)) {
        ['days', 'journal'].forEach(function (f) { if (isObj(prev[f])) Object.keys(prev[f]).forEach(function (k2) { if (!(k2 in arc[f])) arc[f][k2] = prev[f][k2]; }); });
        if (arc.qPages == null && prev.qPages != null) arc.qPages = prev.qPages;
        if (arc.best == null && prev.best != null) arc.best = prev.best;
      }
      RS.store.setRaw('rs-archive-' + a.old, JSON.stringify(arc));
    }
    RS.store.setRaw('rs-season', a.year);
    archiveAsk = null;
    RS.toast(archive ? t('today.archive.done', { old: a.old }) : t('today.archive.kept', { year: a.year }), { tone: archive ? 'success' : 'default' });
    emit();
    softRefresh();
  }
  function dailyReminder() {
    var mode = RS.appMode();
    if (mode === 'prep' || archiveAsk) return;
    var today = RS.todayISO();
    if (RS.settings.remindOn === today) return;
    var ctx = mode === 'year' ? yCtx() : rCtx(), r = getRec(ctx.key);
    if (r && r.done > 0) return;
    RS.settings.remindOn = today;
    RS.saveSettings();
    RS.toast(t('today.toast.reminder'), { ms: 4200 });
  }

  /* ================================================================ actions */
  RS.act('tr.day', function (arg) {
    var d = RS.clamp(curDay() + (parseInt(arg, 10) || 0), 1, DAYS);
    if (d === curDay()) return;
    RS.settings.day = d;
    RS.saveSettings();
    RS.buzz(8);
    RS.emit('day', d);
    refresh();
    announceDay();                          // focus stays on the arrow: the new day and its progress are read out
  });
  // arg: a deed id (the day or date Today shows), or "<id>@<day>" for a Ramadan day changed on me/day
  RS.act('tr.tick', function (arg) {
    var m = /^(.+)@(\d{1,2})$/.exec(String(arg || '')), id = m ? m[1] : arg;
    if (!deed(id)) return;
    var ctx = m ? rCtx(m[2]) : checkCtx(), on = false;
    var r = change(ctx, function (ck, st) { if (st.hayd && deed(id).haydOff) return; ck[id] = !ck[id]; on = ck[id]; }, { id: id });
    RS.buzz(on ? 10 : 6);
    refresh();
    var sec = on ? secOfDeed(id) : null, secEl = sec && document.getElementById('tr-sec-' + sec);
    if (secEl && (r.perfect || secEl.classList.contains('is-complete'))) pulseSection(sec);
    if (r.perfect) pulseRing();
  });
  // arg: empty (Today), or a Ramadan day number (me/day)
  RS.act('tr.hayd', function (arg) {
    var n = parseInt(arg, 10), ctx = n >= 1 && n <= DAYS ? rCtx(n) : checkCtx();
    change(ctx, function (ck, st) { st.hayd = !st.hayd; });
    RS.buzz(8);
    refresh();
  });
  RS.act('tr.sec', function (id) { setOpen(id, !isOpen(id)); refresh(); });
  RS.act('tr.detail', function () { saveSetting('detail', !RS.settings.detail); refresh(); });
  RS.act('tr.jinput', function (v, el) { var key = el.getAttribute('data-arg'); later('j:' + key, function () { saveJournal(key, v); }, 700); });
  RS.act('tr.jsave', function (v, el) { var key = el.getAttribute('data-arg'); if (pend['j:' + key]) clearTimeout(pend['j:' + key].tm); delete pend['j:' + key]; saveJournal(key, v); });
  RS.act('tr.reflect', function (key, el) {
    if (!aiOn() || typeof RS.cloud.reflect !== 'function') return;
    var pr = document.getElementById('tr-jprompt'), tx = document.getElementById('tr-jprompt-t');
    if (el) el.setAttribute('aria-busy', 'true');
    if (pr && tx) { pr.hidden = false; tx.textContent = t('journal.thinking'); }
    Promise.resolve().then(function () { return RS.cloud.reflect(); }).then(function (q) {
      q = String(q || '').trim();
      if (!q) throw new Error('empty');
      flush('j:' + key);
      jSet(key, { p: q.slice(0, 300) });
      if (tx) tx.textContent = q.slice(0, 300);
    }).catch(function () {
      var j = jGet(key);
      if (tx) tx.textContent = j.p || '';
      if (pr) pr.hidden = !j.p;
      RS.toast(t('journal.aiError'), { tone: 'error' });
    }).then(function () { if (el) el.removeAttribute('aria-busy'); });
  });
  RS.act('tr.goal', function (v, el) {
    var i = parseInt(el.getAttribute('data-arg'), 10);
    if (!(i >= 1 && i <= 3)) return;
    later('g' + i, function () { setExtra('goals', 'g' + i, { t: String(v || '').slice(0, 120), ts: Date.now() }); }, 600);
  });
  RS.act('tr.duas', function (v) { later('duas', function () { setExtra('duas', null, { t: String(v || '').slice(0, 2000), ts: Date.now() }); }, 600); });
  RS.act('tr.qada', function (arg) {
    var p = String(arg || '').split(':'), k = p[0], dlt = parseInt(p[1], 10) || 0;
    if (k !== 'owed' && k !== 'done') return;
    var q = qada();
    q[k] = Math.max(0, q[k] + dlt);
    q.ts = Date.now();
    setExtra('qada', null, q);
    refresh();
  });
  // A fast logged from 2 Shawwal on also counts toward the six days of Shawwal (until six are marked), and undoing
  // it takes that one back. Today's year-round record is re-totalled, because the fast-day deeds count only with a fast.
  RS.act('tr.fast', function () {
    var iso = RS.todayISO(), f = extras().fasts, cur = isObj(f) && isObj(f[iso]) ? f[iso] : null, on = !!(cur && cur.v);
    var fi = fastInfo(new Date()), h = fi.h, entry = { v: !on, ts: Date.now() }, six = -1;
    if (!on && fi.blocked) return;
    if (h.month === 10 && h.day >= 2) {
      var n = shawwalDone(h.year);
      if (!on && n < 6) { six = n + 1; entry.sh = 1; }
      else if (on && cur.sh) six = Math.max(0, n - 1);
    }
    if (six >= 0) setExtra('shawwal', String(h.year), six, true);
    setExtra('fasts', iso, entry, true);
    var y = yCtx(iso), r = getRec(y.key);
    if (r) RS.store.set(y.key, build(y, r.ck, r.hayd, r.hck));
    emit();
    if (six === 6 && !on) RS.toast(t('modes.shawwal.done'), { tone: 'success' });
    RS.buzz(8);
    refresh();
  });
  RS.act('tr.shawwal', function (arg) {
    var h = RS.hijri(), i = RS.clamp(parseInt(arg, 10) || 0, 1, 6), cur = RS.clamp(num((extras().shawwal || {})[h.year]), 0, 6);
    var nv = cur === i ? i - 1 : i;
    setExtra('shawwal', String(h.year), nv);
    if (nv === 6 && cur !== 6) RS.toast(t('modes.shawwal.done'), { tone: 'success' });
    RS.buzz(8);
    refresh();
  });
  RS.act('tr.dh', function (arg) {
    var h = RS.hijri(), i = RS.clamp(parseInt(arg, 10) || 0, 1, 10), all = extras().dhulhijjah, cur = isObj(all) && isObj(all[h.year]) ? all[h.year] : {};
    var nv = {}; Object.keys(cur).forEach(function (k) { nv[k] = cur[k]; });
    nv[i] = !nv[i]; nv.ts = Date.now();
    setExtra('dhulhijjah', String(h.year), nv);
    RS.buzz(8);
    refresh();
  });
  RS.act('tr.qlog', function () { openQuranSheet(); });
  RS.act('tr.qchip', function (v) {
    var f = document.getElementById('tr-q-add');
    if (!f) return;
    f.value = Math.min(Q_TOTAL, (parseInt(f.value, 10) || 0) + (parseInt(v, 10) || 0));
    f.removeAttribute('aria-invalid');
    RS.buzz(6);
  });
  RS.act('tr.qsave', function (vals) {
    // whole pages only: "2.5" or "1e2" is rejected, not silently cut to 2 or read as 100
    var f = document.getElementById('tr-q-add'), raw = String(vals && vals.pages != null ? vals.pages : '').trim();
    var v = /^\d{1,4}$/.test(raw) ? parseInt(raw, 10) : NaN;
    if (!(v >= 1 && v <= Q_TOTAL)) {
      if (f) { f.setAttribute('aria-invalid', 'true'); try { f.focus(); } catch (e) { /* ignore */ } }
      RS.toast(t('quran.invalid'), { tone: 'error' });
      return;
    }
    var r = addPages(v);
    RS.sheet.close();
    RS.toast(r.ram ? tn('quran.added', v, { day: nf(r.day), total: nf(r.total) }) : tn('quran.addedToday', v, { total: nf(r.total) }), { tone: 'success' });
    refresh();
  });
  RS.act('tr.qclear', function () {
    var ram = RS.appMode() === 'ramadan', day = curDay();
    RS.confirm({ title: t('quran.clearTitle'), body: ram ? t('quran.clearBody', { day: nf(day) }) : t('quran.clearBodyToday'), ok: t('quran.clearOk'), danger: true }).then(function (ok) {
      if (!ok) return;
      if (ram) { var q = qObj(); delete q[day]; RS.store.set('rs-quran-pages', q); }
      else setExtra('qlog', RS.todayISO(), { p: 0, ts: Date.now() }, true);
      emit();
      RS.sheet.close();
      RS.toast(t('quran.cleared'));
      refresh();
    });
  });
  RS.act('tr.install', function () {
    if (!installEvt) return;
    var e = installEvt;
    installEvt = null;
    try {
      e.prompt();
      Promise.resolve(e.userChoice).then(function (c) { if (c && c.outcome === 'accepted') RS.toast(t('today.install.done'), { tone: 'success' }); }).catch(function () {}).then(softRefresh);
    } catch (err) { softRefresh(); }
  });
  RS.act('tr.installx', function () { RS.store.setRaw('rs-inst-x', '1'); refresh(); });
  RS.act('tr.heat', function (d) { openDaySheet(RS.clamp(parseInt(d, 10) || 1, 1, DAYS)); });
  RS.act('tr.daydetail', function (d) { RS.sheet.close(); RS.router.go('me/day', { n: RS.clamp(parseInt(d, 10) || 1, 1, DAYS) }); });
  // Today shows Ramadan days only in Ramadan mode; otherwise the day is opened on me/day and the day Today would
  // show is left alone.
  RS.act('tr.dayopen', function (d) {
    d = RS.clamp(parseInt(d, 10) || 1, 1, DAYS);
    RS.sheet.close();
    if (RS.appMode() !== 'ramadan') { RS.router.go('me/day', { n: d }); return; }
    if (RS.settings.day !== d) { RS.settings.day = d; RS.saveSettings(); RS.emit('day', d); }
    RS.router.go('today');
    if (!archiveAsk) setTimeout(announceDay, 400);
  });
  RS.act('tr.badge', function (id) { openBadge(id); });
  RS.act('tr.catscope', function (v) { catScope = v === 'all' ? 'all' : 'day'; refresh(); });
  RS.act('tr.pdf', function () { genPdf(); });
  RS.act('tr.export', function () { exportData(); });
  RS.act('tr.importpick', function () { var f = document.getElementById('tr-import'); if (f) f.click(); });
  RS.act('tr.import', function (v, el) { var f = el && el.files && el.files[0]; if (f) importFile(f); if (el) el.value = ''; });
  RS.act('tr.reset', function () { resetAll(); });
  RS.act('tr.lang', function (v) { RS.setLang(v); });
  RS.act('tr.theme', function (v) { RS.setTheme(v); refresh(); });
  RS.act('tr.level', function (v) { saveSetting('level', v === 'kids' || v === 'new' ? v : 'adult'); applyBody(); refresh(); });
  function setMode(v) {
    var m = v === 'ramadan' || v === 'year' || v === 'prep' ? v : null;
    saveSetting('mode', m);
    autoFor = 0;
    autoDay();
    var am = RS.appMode();
    RS.toast(t('me.set.modeToast.' + am));
    refresh();
  }
  RS.act('tr.mode', setMode);
  RS.act('tr.modesheet', function () { openModeSheet(); });
  RS.act('tr.modepick', function (v) { RS.sheet.close(); setMode(v); });
  RS.act('tr.archive', function () { archiveCheck(true); });
  RS.act('tr.archivego', function () { archiveAnswer(true); });
  RS.act('tr.archivekeep', function () { archiveAnswer(false); });
  RS.act('tr.guideopen', function (id) {
    var el = document.getElementById('tr-g-' + id);
    if (!el) return;
    el.open = true;
    var sum = el.querySelector('summary');
    try { el.scrollIntoView({ block: 'start', behavior: RS.reducedMotion() ? 'auto' : 'smooth' }); } catch (e) { el.scrollIntoView(); }
    if (sum) { try { sum.focus({ preventScroll: true }); } catch (e) { sum.focus(); } }
  });
  RS.act('tr.autoday', function () {
    saveSetting('autoDay', RS.settings.autoDay === false);
    autoFor = 0;
    if (RS.settings.autoDay !== false && autoDay()) RS.toast(t('me.set.autoDayOn', { n: nf(curDay()) }));
    refresh();
  });
  RS.act('tr.moon', function (v) {
    saveSetting('hijriOff', RS.clamp(parseInt(v, 10) || 0, -1, 1));
    autoFor = 0;
    autoDay();
    refresh();
  });
  RS.act('tr.showprep', function () { saveSetting('showPrep', !RS.settings.showPrep); refresh(); });

  /* ================================================================ routes */
  RS.router.register('today', { render: renderToday, onShow: function () { startCta(); }, onHide: stopCta });
  RS.router.register('today/preview', { tab: 'today', parent: 'today', title: function () { return t('today.preview.title'); }, render: renderPreview });
  RS.router.register('quran', { render: renderQuran });
  RS.router.register('me', { render: renderMe });
  RS.router.register('me/settings', { tab: 'me', parent: 'me', title: function () { return t('me.settings'); }, render: renderSettings });
  RS.router.register('me/guide', { tab: 'me', parent: 'me', title: function () { return t('me.guide'); }, render: renderGuide });
  RS.router.register('me/badges', { tab: 'me', parent: 'me', title: function () { return t('me.badges'); }, render: renderBadges });
  RS.router.register('me/day', { tab: 'me', parent: 'me', title: function (p) { return t('me.day.title', { n: nf(RS.clamp(parseInt(p && p.n, 10) || curDay(), 1, DAYS)) }); }, render: renderDay });

  /* ================================================================ boot */
  RS.on('boot', function () {
    applyBody();
    liveEl();
    seasonBoot();                           // before the first render: v6 days get their season from the data
    archiveAsk = archiveNeeded();           // Today and Quran stay neutral until the new-season question is answered
    autoDay(true);
    var best = saveBest(T.best());          // a longer run in the stored days becomes the best (e.g. v6 data)
    setTimeout(function () {                // after router.start(): the first navigation closes open overlays
      if (best) emit();                     // rs-best-streaks is part of the cloud snapshot
      archiveCheck(true);
    }, 0);
    setTimeout(dailyReminder, 1500);
    var c = RS.cloud;
    if (c && c.ready && typeof c.ready.then === 'function') c.ready.then(softRefresh, function () {});
  });
  RS.on('data', function (d) { if (!d || d.source !== 'tracker') softRefresh(); });
  RS.on('sync', softRefresh);
  RS.on('theme', function () { var c = RS.router.current(); if (c && c.route === 'me/settings') softRefresh(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { flushAll(); return; }
    archiveCheck(false);                    // the app may have stayed open into a new Ramadan
    if (autoDay()) softRefresh();
    else updateCta();
  });
  window.addEventListener('pagehide', flushAll);
})();
