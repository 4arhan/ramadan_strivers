/* =====================================================================================================
   Ramadan Strivers v8 — prep.js (prep module): the Ramadan Prep programme.
   A readiness check (one question per screen), a 30-day plan of three small prompts a day with a reflection,
   daily SALAH and QURAN check-ins, week milestones, a readiness score, a completion moment on day 30, and the
   v7 "Prepare for Ramadan" planner (three intentions, dua list, make-up fasts) kept in its v7 storage format.

   Routes   prep (intro until started, then the prep home) · prep/assess?q= · prep/result · prep/day?n= · prep/plan
   Hooks    RS.prep.active() · todayHeroHtml() · todayCardsHtml() · readiness() · daysUntilRamadan()   (CONTRACT §8)
   Plan day In Sha'ban the plan follows the calendar: day = Hijri day, and day 30 is the eve of Ramadan (also when
            Sha'ban has 29 days). Outside Sha'ban it counts the days since the start, capped at 30. Someone who
            starts earlier goes through the plan at their own pace and it starts again on 1 Sha'ban: each pass is a
            "round", and only ticks made since the round began count (older ticks stay stored). In Ramadan the plan
            is a read-only summary.
   Storage  rs-prep  {v:2, started (ms, first start; cloud sync keeps the earlier one), since {ts, hy} (the current
                      pass: the start or last restart, and the Hijri year of the Ramadan it prepares for), hy,
                      answers {qid: option}, assessment {qid: score}, assessedAt, done {promptId: ms},
                      undone {promptId: {ts}} (an untick newer than the tick wins: cloud merges done by max and
                      undone by newer ts), reflections {n: {t, ts}} (older builds stored plain text: read as ts 0),
                      checkins {'YYYY-MM-DD': {salah: [bool x5], pray: {fajr: {v, ts}, …}, quran: {minutes, ts}}},
                      qunit, completedAt, autoShow (prep turned settings.showPrep on), past}
            Sync     Everything another device can edit carries its own ts, so cloud sync (cloud.js newer(): the newer
                      ts wins per key) merges reflections one by one, Quran minutes per date and salah prayer by prayer
                      (pray; salah [bool x5] is kept in step with it and read through it). A check-in date has no ts
                      of its own on purpose: that would make one device's whole day replace the other's.
                      The salah check-in follows the prayer day (Fajr to Fajr): before Fajr, ticks count for the day
                      before, so a late Isha lands on its own day.
            Quran pages are not kept here: the check-in reads and writes the tracker's stores, so the Quran tab shows
                      the same number — rs-extras.qlog[date] = {p, ts}, or rs-quran-pages[day] in Ramadan mode.
            rs-extras goals {g1..g3: {t, ts}} · duas {t, ts} · qada {owed, done, ts}   (v7 format; read-modify-write of
                      single sections only — the tracker keeps its journal and Quran log in the same object)
   Text     UI strings: prep.ui.* (i18n-src/en/prep.json). Programme text: prep.* content keys (CONTRACT §4).
   Every persisted change emits RS.emit('data', {source: 'prep'}).
   ===================================================================================================== */
(function () {
  'use strict';
  var RS = window.RS;
  if (!RS || !RS.router) return;

  var KEY = 'rs-prep';
  var EXTRAS = 'rs-extras';
  var QPAGES = 'rs-quran-pages';
  var PRAYERS = [
    { id: 'fajr', icon: 'sunrise' }, { id: 'dhuhr', icon: 'sun' }, { id: 'asr', icon: 'sun-moon' },
    { id: 'maghrib', icon: 'sunset' }, { id: 'isha', icon: 'moon' }
  ];
  // Quran check-in: a gentle daily target that grows week by week toward 20 pages (about 40 minutes) a day.
  var Q_UNITS = ['pages', 'minutes'];
  var Q_TARGET = { pages: [2, 5, 10, 15, 20], minutes: [5, 10, 20, 30, 40] };
  var Q_STEP = { pages: 1, minutes: 5 };
  var Q_MAX = { pages: 604, minutes: 1440 };
  // The generated content has no track on assessment questions yet (build-content.js emits {id, scores}). A `track`
  // on a question always wins. This table is only a fallback for the question set it was written for (ids a1..a7,
  // all present; questions added later need their own track); otherwise no area mapping rather than a wrong one.
  var Q_TRACK = { a1: 'salah', a2: 'salah', a3: 'quran', a4: 'quran', a5: 'fasting', a6: 'habits', a7: 'charity' };
  var FOCUS_BELOW = 70;      // an area becomes a focus area when its readiness-check score is below this (%)
  var FULL_DONE = 70;        // share of the round's prompts (%) for the full "prep complete" wording
  var SALAH_WINDOW = 7;
  var FAJR_FALLBACK = 3;     // without prayer times, the prayer day turns over at 3 am (local)
  var CATCH_ROWS = 3;        // earlier focus days listed on the catch-up card
  // cloud.js offers these reminder hours and reads any other stored hour as 20:00 (its push settings row)
  var PUSH_HOURS = [6, 7, 8, 12, 17, 18, 19, 20, 21, 22];
  var TEXT_MAX = 2000;
  var GOAL_MAX = 120;
  var QADA_MAX = 9999;

  var esc = RS.esc;
  function t(k, v) { return RS.t('prep.ui.' + k, v); }
  function tn(k, n, v) { return RS.tn('prep.ui.' + k, n, v); }
  function num(n) { return RS.fmt.n(n, { maximumFractionDigits: 0 }); }
  function frac(a, b) { return num(a) + '/' + num(b); }
  // RS.fmt.pct split into the figure and the sign after it, for a hero number with a small unit: '48' + '%', or
  // '48' + ' %' where the language puts a space before the sign (fr, es, ru). Bidi marks are dropped (the hero lays
  // out '48%' in RTL itself). A sign before the figure (no app language does this) stays in one piece.
  function pctParts(v) {
    var s = RS.fmt.pct(v), n = num(Math.round(v)), i = s.indexOf(n);
    if (i < 0 || s.slice(0, i).replace(/[‎‏؜\s]/g, '')) return { number: s, unit: '' };
    return { number: n, unit: s.slice(i + n.length).replace(/[‎‏؜]/g, '') };
  }
  function obj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
  function safeId(s) { return String(s).replace(/[^A-Za-z0-9_-]/g, '_'); }
  function ctext(key) { return RS.has(key) ? RS.t(key) : ''; }      // optional content text (no raw key on screen)
  function shaban() { return RS.hijriMonth(8); }

  /* ------------------------------------------------------------------ content */
  function C() { return (RS.content && RS.content.prep) || {}; }
  function tracks() { return Array.isArray(C().tracks) ? C().tracks : []; }
  function trackById(id) {
    var list = tracks();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function trackName(id) { return trackById(id) ? RS.t('prep.track.' + id + '.name') : ''; }
  function questions() { return (Array.isArray(C().assessment) ? C().assessment : []).filter(function (q) { return q && q.id && Array.isArray(q.scores) && q.scores.length; }); }
  var dayCache = { src: null, list: [] };
  function days() {
    var src = C().days;
    if (dayCache.src !== src) {
      dayCache.src = src;
      dayCache.list = (Array.isArray(src) ? src : []).filter(function (d) { return d && isFinite(d.n) && d.n >= 1; })
        .slice().sort(function (a, b) { return a.n - b.n; });
    }
    return dayCache.list;
  }
  function dayByN(n) {
    var list = days();
    for (var i = 0; i < list.length; i++) if (list[i].n === n) return list[i];
    return null;
  }
  function totalDays() { var d = days(); return d.length ? d[d.length - 1].n : 30; }
  function prompts(day) { return day && Array.isArray(day.prompts) ? day.prompts.filter(function (p) { return p && p.id; }) : []; }
  function allPromptCount() { return days().reduce(function (a, d) { return a + prompts(d).length; }, 0); }
  function perDay() { return days().reduce(function (a, d) { return Math.max(a, prompts(d).length); }, 0) || 3; }
  function dayOfPrompt(id) {
    var list = days();
    for (var i = 0; i < list.length; i++) if (prompts(list[i]).some(function (p) { return p.id === id; })) return list[i];
    return null;
  }
  function milestones() {
    return (Array.isArray(C().milestones) ? C().milestones : []).filter(function (m) { return m && isFinite(m.week); })
      .slice().sort(function (a, b) { return a.week - b.week; });
  }
  function weekCount() { var m = milestones(); return m.length ? m[m.length - 1].week : Math.max(1, Math.ceil(totalDays() / 7)); }
  function weekOf(n) { return RS.clamp(Math.ceil(n / 7), 1, weekCount()); }
  function weekRange(w) {
    var total = totalDays();
    return { from: (w - 1) * 7 + 1, to: w >= weekCount() ? total : Math.min(total, w * 7) };
  }
  function milestone(w) {
    var m = milestones();
    for (var i = 0; i < m.length; i++) if (m[i].week === w) return m[i];
    return null;
  }

  /* ------------------------------------------------------------------ dates + Hijri */
  function noon(d) { d = d instanceof Date ? d : (d != null ? new Date(d) : new Date()); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12); }
  function dayDiff(a, b) { return Math.round((noon(b) - noon(a)) / 86400000); }
  function midnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function todayKey() { return RS.todayISO(); }
  function calKey() { return RS.todayISO(noon()) + '|' + (parseInt(RS.settings.hijriOff, 10) || 0); }

  // Days until 1 Ramadan (0 during Ramadan) and until 1 Sha'ban (0 during Sha'ban), walking forward day by day with
  // RS.hijri (settings.hijriOff applies). Cached per date and moon setting.
  var walkCache = { k: null, v: null };
  function walk() {
    var k = calKey();
    if (walkCache.k === k) return walkCache.v;
    var v = { ram: null, sha: null };
    try {
      var base = noon(), h = RS.hijri(base);
      if (h.month === 9) v.ram = 0;
      if (h.month === 8) v.sha = 0;
      for (var i = 1; i <= 400 && (v.ram == null || v.sha == null); i++) {
        var x = RS.hijri(addDays(base, i));
        if (v.ram == null && x.month === 9) v.ram = i;       // the first Ramadan date reached is 1 Ramadan
        if (v.sha == null && x.month === 8) v.sha = i;
      }
    } catch (e) { v = { ram: null, sha: null }; }
    walkCache = { k: k, v: v };
    return v;
  }
  function daysUntilRamadan() { return walk().ram; }
  function daysUntilShaban() { return walk().sha; }
  function month() { return RS.hijri(noon()).month; }
  function inRamadan() { return month() === 9; }
  // The Hijri year of the Ramadan a date prepares for (the current one until it ends, then the next).
  function targetYear(d) { var h = RS.hijri(noon(d)); return h.month <= 9 ? h.year : h.year + 1; }
  // Plan day of a date in Sha'ban: its Hijri day, or the last day on the eve of Ramadan (when Sha'ban has 29 days).
  var shCache = {};
  function shabanDay(d) {
    var base = noon(d), k = RS.todayISO(base) + '|' + (parseInt(RS.settings.hijriOff, 10) || 0) + '|' + totalDays();
    if (shCache[k] == null) {
      var h = RS.hijri(base);
      shCache[k] = h.month !== 8 ? 0 : (RS.hijri(addDays(base, 1)).month === 9 ? totalDays() : h.day);
    }
    return shCache[k];
  }
  // Local midnight of 1 Sha'ban: of this Sha'ban, or (during Ramadan) of the Sha'ban just before it; else null.
  var shStart = { k: null, v: null };
  function shabanStart() {
    var k = calKey();
    if (shStart.k === k) return shStart.v;
    var base = noon(), h = RS.hijri(base), v = null;
    if (h.month === 9) { base = addDays(base, -h.day); h = RS.hijri(base); }
    if (h.month === 8) v = midnight(addDays(base, 1 - h.day));
    shStart = { k: k, v: v };
    return v;
  }

  /* ------------------------------------------------------------------ state */
  // A reflection {t, ts}; a plain string (older builds, CONTRACT §5 'reflections:{n:text}') reads as {t, ts: 0}.
  function reflOf(v) {
    if (typeof v === 'string') return { t: v, ts: 0 };
    v = obj(v);
    return { t: typeof v.t === 'string' ? v.t : '', ts: Number(v.ts) > 0 ? Number(v.ts) : 0 };
  }
  function reflText(s, n) { return reflOf(s.reflections[n]).t; }
  function state() {
    var s = obj(RS.store.get(KEY, null));
    s.answers = obj(s.answers);
    s.assessment = obj(s.assessment);
    s.done = obj(s.done);
    s.undone = obj(s.undone);
    s.reflections = obj(s.reflections);
    Object.keys(s.reflections).forEach(function (k) { s.reflections[k] = reflOf(s.reflections[k]); });
    s.checkins = obj(s.checkins);
    if (typeof s.started === 'string') s.started = Date.parse(s.started) || null;
    if (typeof s.started !== 'number' || !isFinite(s.started) || s.started <= 0) s.started = null;
    if (Q_UNITS.indexOf(s.qunit) < 0) s.qunit = 'pages';
    return s;
  }
  function save(s) {
    s.v = 2;
    RS.store.set(KEY, s);
    RS.emit('data', { source: 'prep' });
  }
  // The current pass began at the start or at the last restart. Cloud sync keeps the EARLIER `started` of two
  // devices, so a restart (or a new year's start) is recorded in `since` {ts, hy}, which syncs by its timestamp.
  function passStart(s) { var ts = Number(obj(s.since).ts) || 0; return Math.max(s.started || 0, ts > 0 ? ts : 0); }
  function passYear(s) { return parseInt(obj(s.since).hy, 10) || parseInt(s.hy, 10) || (s.started ? targetYear(s.started) : 0); }
  // A programme started for an earlier Ramadan is kept (in rs-prep.past once a new one starts) but no longer runs.
  function isStale(s) { return !!s.started && passYear(s) !== targetYear(); }
  function isOn(s) { return !!s.started && !isStale(s); }

  // The current round: ticks made from `from` on count, and it began on plan day `day`. An earlier pass ends on
  // 1 Sha'ban, when the plan starts again at day 1 in step with the calendar; a start or restart in Sha'ban begins
  // on that date's plan day (the days before it can still be done as catch-up).
  function round(s) {
    var from = passStart(s), sh = shabanStart();
    if (sh == null) return { from: from, day: 1 };
    if (from < sh) return { from: sh, day: 1 };
    return { from: from, day: RS.clamp(shabanDay(new Date(from)) || 1, 1, totalDays()) };
  }
  // When a prompt was ticked (0 = never, or unticked since).
  function tickTs(s, id) {
    var d = Number(s.done[id]) || 0;
    if (d <= 0) return 0;
    var u = Number(obj(s.undone[id]).ts) || 0;
    return u >= d ? 0 : d;
  }
  function isDone(s, id, r) { var d = tickTs(s, id); return d > 0 && d >= r.from; }
  function dayDone(s, day, r) { return prompts(day).filter(function (p) { return isDone(s, p.id, r); }).length; }
  function doneCount(s, r) { return days().reduce(function (a, d) { return a + dayDone(s, d, r); }, 0); }

  function planDay(s) {
    var total = totalDays(), base = noon(), m = RS.hijri(base).month;
    if (m === 9) return total;
    if (m === 8) return RS.clamp(shabanDay(base), 1, total);
    if (!isOn(s)) return 1;
    return RS.clamp(dayDiff(new Date(passStart(s)), base) + 1, 1, total);
  }
  // Started before Sha'ban: the plan runs at the person's own pace and starts again on 1 Sha'ban.
  function early(s) { var m = month(); return isOn(s) && m !== 8 && m !== 9; }
  // ... and already past the last day of this pass, waiting for 1 Sha'ban.
  function waiting(s) { return early(s) && dayDiff(new Date(passStart(s)), noon()) + 1 > totalDays(); }
  function canTick(s, n) { return isOn(s) && !inRamadan() && n <= planDay(s); }
  function lastDayDone(s, r) {
    var ps = prompts(dayByN(totalDays()));
    return !!ps.length && ps.every(function (p) { return isDone(s, p.id, r); });
  }
  function isComplete(s) { return isOn(s) && lastDayDone(s, round(s)); }
  // Share of this round's prompts done (days from the round's first day to the last).
  function roundPct(s, r) {
    var all = 0, got = 0;
    days().forEach(function (d) { if (d.n >= r.day) { all += prompts(d).length; got += dayDone(s, d, r); } });
    return all ? 100 * got / all : 0;
  }
  function reflectionCount(s) { return Object.keys(s.reflections).filter(function (k) { return reflText(s, k).trim(); }).length; }
  // Days whose prompts are all done (this round's ticks, catch-up included).
  function fullDays(s, r) { return days().filter(function (d) { var all = prompts(d).length; return all && dayDone(s, d, r) === all; }).length; }

  /* ------------------------------------------------------------------ assessment + readiness */
  function answerIdx(ans, q) {
    var k = parseInt(ans[q.id], 10);
    return k >= 0 && k < q.scores.length ? k : -1;
  }
  function scoreOf(s, q) {
    var k = answerIdx(s.answers, q);
    if (k >= 0) return Number(q.scores[k]) || 0;
    var v = Number(s.assessment[q.id]);
    return s.assessment[q.id] != null && isFinite(v) ? v : null;
  }
  function qMax(q) { return Math.max.apply(null, q.scores.map(function (x) { return Number(x) || 0; })) || 1; }
  function answeredCount(ans) { return questions().filter(function (q) { return answerIdx(ans, q) >= 0; }).length; }
  function firstUnanswered(ans) {
    var qs = questions();
    for (var i = 0; i < qs.length; i++) if (answerIdx(ans, qs[i]) < 0) return i;
    return -1;
  }
  // 0..100 from the scores of the answered questions, or null before any answer.
  function assessPct(s) {
    var got = 0, max = 0;
    questions().forEach(function (q) {
      var v = scoreOf(s, q);
      if (v == null) return;
      got += v; max += qMax(q);
    });
    return max ? Math.round(100 * got / max) : null;
  }
  function legacyTracks() {
    var ids = questions().map(function (q) { return q.id; });
    return Object.keys(Q_TRACK).every(function (id) { return ids.indexOf(id) >= 0; }) ? Q_TRACK : null;
  }
  function trackOfQuestion(q, legacy) {
    if (q.track && trackById(q.track)) return q.track;
    return legacy && legacy[q.id] && trackById(legacy[q.id]) ? legacy[q.id] : null;
  }
  function trackScores(s) {
    var acc = {}, legacy = legacyTracks();
    questions().forEach(function (q) {
      var tr = trackOfQuestion(q, legacy), v = scoreOf(s, q);
      if (!tr || v == null) return;
      acc[tr] = acc[tr] || { got: 0, max: 0 };
      acc[tr].got += v; acc[tr].max += qMax(q);
    });
    var out = {};
    Object.keys(acc).forEach(function (k) { out[k] = Math.round(100 * acc[k].got / acc[k].max); });
    return out;
  }
  // Up to two weakest areas below FOCUS_BELOW (ties keep the content order: salah and Quran come first).
  function focusTracks(s) {
    var sc = trackScores(s);
    return tracks().map(function (tr, i) { return { id: tr.id, i: i, pct: sc[tr.id] }; })
      .filter(function (x) { return x.pct != null && x.pct < FOCUS_BELOW; })
      .sort(function (a, b) { return a.pct - b.pct || a.i - b.i; })
      .slice(0, 2).map(function (x) { return x.id; });
  }
  // The last plan day of this round that is over: yesterday's plan day, or the last day once the plan is closed
  // (Ramadan) or done (waiting for 1 Sha'ban). In Sha'ban it follows the calendar, so the day that a 29-day Sha'ban
  // skips on the eve of Ramadan (day 29) is not counted as missed.
  function lastElapsed(s, cur) {
    if (inRamadan() || waiting(s)) return totalDays();
    var h = RS.hijri(noon());
    return (h.month === 8 ? Math.min(cur, h.day) : cur) - 1;
  }
  // Prompts of this round's days that are over (due), and the ticks on this round's days up to today (done, at most
  // due: today's ticks can make up for a missed one). Catch-up ticks on days before the round began do not count.
  function promptStats(s, r) {
    var cur = planDay(s), upto = lastElapsed(s, cur), due = 0, done = 0;
    days().forEach(function (d) {
      if (d.n < r.day || d.n > cur) return;
      prompts(d).forEach(function (p) {
        if (d.n <= upto) due += 1;
        if (isDone(s, p.id, r)) done += 1;
      });
    });
    return { due: due, done: Math.min(done, due) };
  }
  // Prayers on time over the last 7 prayer days of the programme. An earlier day without a check-in counts as 0 of 5;
  // the current prayer day counts once checked in. In Ramadan the window ends on the last day of Sha'ban.
  function salahStats(s) {
    var end = salahDay(), h = RS.hijri(end), closed = h.month === 9, on = 0, of = 0, from = passStart(s);
    if (closed) end = addDays(end, -h.day);               // the last day of Sha'ban
    for (var i = 0; i < SALAH_WINDOW; i++) {
      var d = addDays(end, -i), k = RS.todayISO(d);
      if (from && dayDiff(new Date(from), d) < 0) break;
      var has = hasSalah(s, k);
      if (i === 0 && !closed && !has) continue;           // the current prayer day counts once checked in
      of += 5;
      if (has) on += salahOf(s, k).filter(Boolean).length;
    }
    return { on: on, of: of };
  }
  // readiness = 40% readiness check + 40% prompts done of those on this round's days that are over (promptStats) +
  // 20% prayers on time (salahStats), 0..100. A part with nothing to count yet (day 1, or no check-in so far) takes
  // the readiness-check score; without a readiness check the other parts share its weight.
  function readiness(s) {
    s = s || state();
    var A = assessPct(s);
    if (!isOn(s)) return A == null ? 0 : A;
    var r = round(s), p = promptStats(s, r), q = salahStats(s);
    var parts = [[A, 0.4], [p.due ? 100 * p.done / p.due : null, 0.4], [q.of ? 100 * q.on / q.of : null, 0.2]];
    var sum = 0, w = 0;
    parts.forEach(function (x) {
      var v = x[0] == null ? A : x[0];
      if (v == null) return;
      sum += v * x[1]; w += x[1];
    });
    return w ? Math.round(RS.clamp(sum / w, 0, 100)) : 0;
  }

  /* ------------------------------------------------------------------ check-ins */
  // The prayer day runs from Fajr to the next Fajr: before today's Fajr (prayer times from the cloud module when a
  // location is set, else FAJR_FALLBACK o'clock) the salah check-in is still the day before. Noon of that day.
  function salahDay() {
    var now = new Date(), cut = null;
    try {
      var pt = RS.cloud && RS.cloud.prayer && typeof RS.cloud.prayer.times === 'function' ? RS.cloud.prayer.times(now) : null;
      if (pt && pt.fajr instanceof Date && !isNaN(pt.fajr.getTime()) && RS.todayISO(pt.fajr) === RS.todayISO(now)) cut = pt.fajr;
    } catch (e) { cut = null; }
    if (!cut) cut = new Date(now.getFullYear(), now.getMonth(), now.getDate(), FAJR_FALLBACK);
    return now < cut ? addDays(noon(now), -1) : noon(now);
  }
  function salahKey() { return RS.todayISO(salahDay()); }
  // The five prayers of a date as [bool x5]: each prayer's newest tick or untick (pray), else the stored salah array.
  function salahOf(s, key) {
    var c = obj(s.checkins[key]), arr = Array.isArray(c.salah) ? c.salah : [], pray = obj(c.pray);
    return PRAYERS.map(function (p, i) { var e = pray[p.id]; return e && typeof e === 'object' ? !!e.v : !!arr[i]; });
  }
  function hasSalah(s, key) {
    var c = s.checkins[key];
    return !!c && typeof c === 'object' && (Array.isArray(c.salah) || Object.keys(obj(c.pray)).length > 0);
  }
  function salahToday(s) { return salahOf(s, salahKey()).filter(Boolean).length; }
  function minutesOn(s, key) { var v = Number(obj(obj(s.checkins[key]).quran).minutes); return isFinite(v) && v > 0 ? v : 0; }
  function quranTarget(n, unit) {
    var i = n <= 7 ? 0 : n <= 14 ? 1 : n <= 21 ? 2 : n <= 25 ? 3 : 4;
    return Q_TARGET[unit][i];
  }
  // The plan day the Quran target follows. Someone who started before Sha'ban keeps the target their earlier pass
  // reached: the plan starts again at day 1 on 1 Sha'ban, but the target never steps back.
  function targetDay(s) {
    var n = planDay(s), sh = shabanStart(), from = passStart(s);
    if (!isOn(s) || sh == null || !(from > 0) || from >= sh) return n;
    return Math.max(n, RS.clamp(dayDiff(new Date(from), new Date(sh - 1)) + 1, 1, totalDays()));
  }
  function daysEnding(base, count) {
    var out = [];
    for (var i = count - 1; i >= 0; i--) out.push(addDays(base, -i));
    return out;
  }
  function lastDays(count) { return daysEnding(noon(), count); }

  /* ------------------------------------------------------------------ Quran pages (the tracker's stores) */
  // Same rule as the tracker's "Log reading": rs-quran-pages[Ramadan day] in Ramadan mode, else rs-extras.qlog[date].
  function ramDay() {
    if (RS.appMode() !== 'ramadan') return 0;
    var d = 0;
    try { d = RS.tracker && typeof RS.tracker.todayIndex === 'function' ? parseInt(RS.tracker.todayIndex(), 10) : 0; } catch (e) { d = 0; }
    if (!(d >= 1)) { var h = RS.hijri(); d = h.month === 9 ? h.day : 1; }
    return RS.clamp(d, 1, 30);
  }
  function qlog(x) { return obj((x || extras()).qlog); }
  function pagesIn(log, iso) { var e = log[iso], v = Number(e && typeof e === 'object' ? e.p : e); return isFinite(v) && v > 0 ? Math.round(v) : 0; }
  function ramPages(q, day) { var v = Number(q[day]); return isFinite(v) && v > 0 ? v : 0; }
  function pagesToday() { var rd = ramDay(); return rd ? ramPages(obj(RS.store.get(QPAGES, null)), rd) : pagesIn(qlog(), todayKey()); }
  function setPagesToday(v) {
    var rd = ramDay();
    if (rd) {
      var q = obj(RS.store.get(QPAGES, null));
      if (v > 0) q[rd] = v; else delete q[rd];
      RS.store.set(QPAGES, q);
    } else {
      var x = extras();                                // re-read: other modules write their own sections
      x.qlog = qlog(x);
      x.qlog[todayKey()] = { p: v, ts: Date.now() };   // 0 is kept (with its ts) so a correction syncs
      RS.store.set(EXTRAS, x);
    }
    RS.emit('data', { source: 'prep' });
  }
  function quranWeek(s, unit) {
    var rd = unit === 'pages' ? ramDay() : 0, vals = [], labels = [];
    if (rd) {
      var q = obj(RS.store.get(QPAGES, null));
      for (var d = rd - 6; d <= rd; d++) { vals.push(d >= 1 ? ramPages(q, d) : 0); labels.push(d >= 1 ? num(d) : ''); }
    } else {
      var log = unit === 'pages' ? qlog() : null;
      lastDays(7).forEach(function (dt) {
        var k = RS.todayISO(dt);
        vals.push(log ? pagesIn(log, k) : minutesOn(s, k));
        labels.push(RS.fmt.date(dt, { weekday: 'narrow' }));
      });
    }
    return { vals: vals, labels: labels };
  }
  // Earlier v8 builds kept check-in pages in rs-prep: move them into the shared log once (keeping the larger number).
  function migratePages() {
    var s = state(), x = null, moved = false;
    Object.keys(s.checkins).forEach(function (k) {
      var c = s.checkins[k], qq = c && typeof c === 'object' ? c.quran : null;
      if (!qq || typeof qq !== 'object' || qq.pages == null) return;
      var v = Math.round(Number(qq.pages) || 0);
      if (v > 0 && /^\d{4}-\d{2}-\d{2}$/.test(k)) {
        x = x || extras();
        x.qlog = qlog(x);
        if (v > pagesIn(x.qlog, k)) x.qlog[k] = { p: v, ts: Date.now() };
      }
      delete qq.pages;
      moved = true;
    });
    if (!moved) return;
    if (x) RS.store.set(EXTRAS, x);
    save(s);
  }

  /* ------------------------------------------------------------------ rs-extras (v7 planner) */
  function extras() { return obj(RS.store.get(EXTRAS, null)); }
  function setExtras(section, val) {
    var x = extras();                        // re-read: other modules write their own sections of this object
    x[section] = val;
    RS.store.set(EXTRAS, x);
    RS.emit('data', { source: 'prep' });
  }
  function goals() { var g = obj(extras().goals); return [1, 2, 3].map(function (i) { var x = obj(g['g' + i]); return typeof x.t === 'string' ? x.t : ''; }); }
  function duaText() { var d = obj(extras().duas); return typeof d.t === 'string' ? d.t : ''; }
  function duaCount() { return duaText().split('\n').filter(function (l) { return l.trim(); }).length; }
  function qada() {
    var q = obj(extras().qada);
    return { owed: Math.max(0, parseInt(q.owed, 10) || 0), done: Math.max(0, parseInt(q.done, 10) || 0) };
  }
  function qadaLine(q) {
    if (!q.owed && !q.done) return t('qada.none');
    var left = q.owed - q.done;
    return left > 0 ? tn(inRamadan() ? 'qada.leftNow' : 'qada.left', left) : t('qada.clear');
  }

  /* ------------------------------------------------------------------ deferred text saves */
  var pending = {};
  function later(key, fn, ms) {
    if (pending[key]) clearTimeout(pending[key].timer);
    pending[key] = { fn: fn, timer: setTimeout(function () { var p = pending[key]; delete pending[key]; if (p) p.fn(); }, ms || 450) };
  }
  function now(key, fn) {
    if (pending[key]) clearTimeout(pending[key].timer);
    delete pending[key];
    fn();
  }
  function flush() {
    Object.keys(pending).forEach(function (k) { var p = pending[k]; clearTimeout(p.timer); delete pending[k]; p.fn(); });
  }
  function status(id, text) { var el = document.getElementById(id); if (el && el.textContent !== text) el.textContent = text; }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);

  /* ------------------------------------------------------------------ shared pieces */
  var openTips = {};
  var openWeeks = {};
  var celebrate = false;
  var draft = null;          // retake answers: saved only when "See my result" is tapped
  var refocus = null;        // day stepper arrow to focus again after moving to another day
  function takeCelebrate() { var c = celebrate; celebrate = false; return c; }

  function tag(text, cls) { return '<span class="prep-tag' + (cls ? ' ' + cls : '') + '">' + esc(text) + '</span>'; }
  function trackTags(trackId, focus) {
    var out = '';
    if (trackId && trackById(trackId)) out += tag(trackName(trackId));
    if (trackId && focus.indexOf(trackId) >= 0) out += tag(t('focus'), 'is-focus');
    return out;
  }
  function promptRows(s, day, locked, r) {
    var focus = focusTracks(s);
    return prompts(day).map(function (p) {
      var tip = ctext('prep.p.' + p.id + '.tip');
      var pid = 'prep-pt-' + safeId(p.id), tipId = 'prep-tip-' + safeId(p.id);
      var open = !!openTips[p.id];
      var extra = '<span class="prep-tags">' + trackTags(p.track, focus) + '</span>' + (tip ?
        '<button type="button" class="link-btn prep-tip-btn" data-act="prep.tip" data-arg="' + esc(p.id) + '" aria-expanded="' + open + '" aria-controls="' + tipId + '" aria-describedby="' + pid + '">' +
        esc(t('tip')) + RS.icon('chevron-down', { size: 16 }) + '</button><p class="prep-tip" id="' + tipId + '"' + (open ? '' : ' hidden') + '>' + esc(tip) + '</p>' : '');
      return RS.ui.row({
        check: { on: isDone(s, p.id, r), act: 'prep.done', arg: p.id },
        titleHtml: '<span id="' + pid + '">' + esc(RS.t('prep.p.' + p.id + '.text')) + '</span>',
        disabled: locked, cls: 'prep-prompt', extra: extra
      });
    });
  }
  function promptsCard(s, day, o) {
    o = o || {};
    var n = day.n, cur = planDay(s), locked = !canTick(s, n), r = round(s);
    var note = '';
    if (inRamadan()) note = RS.ui.note(t('day.readonly'), { icon: 'lock', tone: 'plain' });
    else if (!isOn(s)) note = RS.ui.note(t('day.notStarted'), { icon: 'lock', tone: 'plain' });
    else if (n > cur) note = RS.ui.note(tn('day.opensIn', n - cur, { day: num(n) }), { icon: 'lock', tone: 'plain' });
    return RS.ui.card({
      kicker: { icon: 'list-checks', text: o.kicker || t('day.steps') },
      title: o.title || null,
      cls: 'prep-prompts',
      body: (prompts(day).length ? RS.ui.list(promptRows(s, day, locked, r), { label: t('day.steps') }) : RS.ui.empty({ icon: 'sprout', title: t('empty.dayTitle'), body: t('empty.dayBody') })) +
        (note ? '<div class="mt-3">' + note + '</div>' : '') + (o.after || '')
    });
  }

  function salahCard(s) {
    var base = salahDay(), salah = salahOf(s, RS.todayISO(base));
    var count = salah.filter(Boolean).length;
    // Before Fajr the card still shows the day that is ending, and says so.
    var late = RS.todayISO(base) !== todayKey() ? '<p class="caption prep-late">' + esc(t('salah.beforeFajr', { day: RS.fmt.date(base, { weekday: 'long' }) })) + '</p>' : '';
    var grid = '<div class="prep-salah" role="group" aria-labelledby="prep-salah-title">' + PRAYERS.map(function (p, i) {
      var on = !!salah[i];
      return '<button type="button" class="prep-pray' + (on ? ' is-on' : '') + '" role="checkbox" aria-checked="' + on + '" data-act="prep.salah" data-arg="' + i + '">' +
        '<span class="prep-pray-dot" aria-hidden="true">' + RS.icon(on ? 'check' : p.icon, { size: on ? 20 : 19 }) + '</span>' +
        '<span class="prep-pray-name">' + esc(t('salah.' + p.id)) + '</span></button>';
    }).join('') + '</div>';
    var week = daysEnding(base, 7);
    var vals = week.map(function (d) { return salahOf(s, RS.todayISO(d)).filter(Boolean).length; });
    var weekOn = vals.reduce(function (a, b) { return a + b; }, 0);
    var chart = '<div class="prep-week"><div class="spread small"><span class="muted">' + esc(t('week7')) + '</span><span class="strong">' +
      esc(t('salah.weekCount', { n: num(weekOn), total: num(35) })) + '</span></div>' +
      RS.ui.bars(vals, { max: 5, highlight: 6, height: 40, labels: week.map(function (d) { return RS.fmt.date(d, { weekday: 'narrow' }); }),
        label: t('salah.chartLabel', { n: num(weekOn), total: num(35) }) }) + '</div>';
    return RS.ui.card({
      kicker: { icon: 'clock', text: t('salah.kicker') },
      title: t('salah.title'), titleId: 'prep-salah-title',
      cls: 'prep-salah-card',
      body: late + grid + '<p class="prep-status' + (count === 5 ? ' accent' : '') + '" aria-live="polite">' + esc(count === 5 ? t('salah.all') : t('salah.count', { n: num(count), total: num(5) })) + '</p>' + chart
    });
  }

  function quranCard(s) {
    var unit = s.qunit, pages = unit === 'pages', n = targetDay(s);
    var v = pages ? pagesToday() : minutesOn(s, todayKey()), target = quranTarget(n, unit), step = Q_STEP[unit];
    var pct = Math.min(100, Math.round(100 * v / target));
    var left = Math.max(0, target - v);
    var stepBtn = function (sign, icon, label, disabled) {
      return '<button type="button" class="prep-step" data-act="prep.q" data-arg="' + sign + '" aria-label="' + esc(label) + '" aria-describedby="prep-qc-val"' +
        (disabled ? ' aria-disabled="true"' : '') + '>' + RS.icon(icon, { size: 22 }) + '</button>';
    };
    var wk = quranWeek(s, unit), wsum = wk.vals.reduce(function (a, b) { return a + b; }, 0);
    var body = '<div class="prep-qc">' +
      stepBtn('-', 'minus', tn(pages ? 'quran.lessPages' : 'quran.lessMinutes', step), v <= 0) +
      '<p class="prep-qc-val" id="prep-qc-val"><span class="display">' + esc(num(v)) + '</span><span class="display-unit">' + esc(tn(pages ? 'quran.pages' : 'quran.minutes', v)) + '</span></p>' +
      stepBtn('+', 'plus', tn(pages ? 'quran.morePages' : 'quran.moreMinutes', step), v >= Q_MAX[unit]) + '</div>' +
      '<div class="stack-sm mt-3"><div class="spread small"><span class="muted">' + esc(tn(pages ? 'quran.targetPages' : 'quran.targetMinutes', target)) + '</span>' +
      '<span class="strong' + (left ? '' : ' accent') + '">' + esc(left ? tn(pages ? 'quran.leftPages' : 'quran.leftMinutes', left) : t('quran.reached')) + '</span></div>' +
      RS.ui.bar(pct, { label: t('quran.barLabel') }) + '</div>' +
      '<div class="prep-week"><div class="spread small"><span class="muted">' + esc(t('week7')) + '</span><span class="strong">' +
      esc(tn(pages ? 'quran.weekPages' : 'quran.weekMinutes', wsum)) + '</span></div>' +
      RS.ui.bars(wk.vals, { max: Math.max(target, Math.max.apply(null, wk.vals)), highlight: 6, height: 40, labels: wk.labels,
        label: tn(pages ? 'quran.chartPages' : 'quran.chartMinutes', wsum) }) + '</div>' +
      '<div class="mt-3">' + RS.ui.seg([{ value: 'pages', text: t('quran.unitPages') }, { value: 'minutes', text: t('quran.unitMinutes') }], unit, { act: 'prep.qunit', label: t('quran.unitLabel') }) + '</div>' +
      '<p class="caption mt-3">' + esc(t(pages ? 'quran.growPages' : 'quran.growMinutes')) + (pages ? ' ' + esc(t('quran.shared')) : '') + '</p>';
    return RS.ui.card({ kicker: { icon: 'book-open', text: t('quran.kicker') }, title: t('quran.title'), cls: 'prep-quran-card', body: body });
  }

  function planRows() {
    var g = goals().filter(function (x) { return x.trim(); }).length, dc = duaCount(), q = qada();
    return [
      RS.ui.row({ icon: 'target', title: t('plan.goals'), sub: t('plan.goalsSub', { n: num(g), total: num(3) }), act: 'nav.go', arg: 'prep/plan', chevron: true }),
      RS.ui.row({ icon: 'hand-heart', title: t('plan.duas'), sub: dc ? tn('plan.duasSub', dc) : t('plan.duasEmpty'), act: 'nav.go', arg: 'prep/plan', chevron: true }),
      RS.ui.row({ icon: 'calendar-check', title: t('plan.qada'), sub: qadaLine(q), act: 'nav.go', arg: 'prep/plan', chevron: true })
    ];
  }
  function planCard() { return RS.ui.card({ kicker: { icon: 'target', text: t('plan.kicker') }, title: t('plan.cardTitle'), body: RS.ui.list(planRows()) }); }

  /* ------------------------------------------------------------------ hero (prep home and Today) */
  // The hero CTA of a running programme. `act` 'prep.begin' replaces the screen (used from the result screen).
  function ctaFor(s, where, act) {
    var total = totalDays(), n = planDay(s), day = dayByN(n);
    act = act || 'nav.go';
    if (!days().length) return where === 'home' ? null : { eyebrow: t('kicker'), text: t('cta.home'), act: act, arg: 'prep' };
    if (isComplete(s)) return { eyebrow: t('complete.eyebrow'), text: t('complete.cta'), act: act, arg: 'prep/day?n=' + total };
    if (waiting(s)) return { eyebrow: t('wait.eyebrow', { month: shaban() }), text: tn('wait.cta', total), act: act, arg: 'prep/day?n=1' };
    return { eyebrow: t('cta.dayEyebrow', { n: num(n), total: num(total) }), text: day ? t('cta.today', { theme: RS.t('prep.day.' + n + '.theme') }) : t('day.title', { n: num(n) }),
      act: act, arg: 'prep/day?n=' + n };
  }
  function statsMetrics(s, r) {
    var m = [];
    if (days().length) m.push({ label: t('m.prompts'), value: frac(doneCount(s, r), allPromptCount()) });
    m.push({ label: t('m.reflections'), value: num(reflectionCount(s)) });
    m.push({ label: t('m.readiness'), value: RS.fmt.pct(readiness(s)) });
    return m;
  }
  function heroHtml(where) {
    var s = state(), total = totalDays(), n = planDay(s), du = daysUntilRamadan(), h = RS.hijri(noon());
    var on = isOn(s), kick = { icon: 'sprout', text: t('kicker') };
    var big = du != null && du > 0 ? { number: num(du), label: tn('daysUntil', du) } : { number: num(n), label: t('heroDayOf', { n: num(n), total: num(total) }) };
    var cls = 'prep-hero' + (takeCelebrate() ? ' prep-celebrate' : '');
    if (h.month === 9) {
      return RS.ui.hero({
        cls: cls, kicker: kick, text: t('begun.body'),
        number: num(h.day), label: t('begun.label', { month: RS.hijriMonth(9) }),
        cta: where === 'today' ? null : { eyebrow: t('begun.eyebrow'), text: t('begun.cta'), act: 'nav.go', arg: 'today' }
      });
    }
    if (!on) {
      var partial = answeredCount(s.answers) > 0 && firstUnanswered(s.answers) >= 0;
      return RS.ui.hero({
        cls: cls, kicker: kick, number: big.number, label: big.label, text: tn('invite', perDay()),
        metrics: [{ label: t('m.plan'), value: tn('m.days', total) }, { label: t('m.daily'), value: tn('m.steps', perDay()) }],
        // From Today the first tap opens the intro (what the plan is, with its own "Start my prep"); on the intro it
        // starts the readiness check. A half-done check continues from both.
        cta: partial ? { eyebrow: t('cta.continueEyebrow'), text: t('cta.continue'), act: 'prep.start' } :
          where === 'today' ? { eyebrow: t('cta.seeEyebrow'), text: tn('cta.see', total), act: 'nav.go', arg: 'prep' } :
            { eyebrow: t('cta.startEyebrow'), text: t('cta.start'), act: 'prep.start' }
      });
    }
    var r = round(s), done = isComplete(s), rd = readiness(s);
    var metrics = [{ label: t('m.day'), value: frac(n, total) }];
    if (days().length) metrics.push({ label: t('m.prompts'), value: frac(doneCount(s, r), allPromptCount()) });
    metrics.push({ label: t('m.salah'), value: frac(salahToday(s), 5) });
    return RS.ui.hero({
      cls: cls + (done ? ' is-complete' : ''),
      kicker: done ? { icon: 'badge-check', text: t('complete.kicker') } : kick,
      number: big.number, label: big.label,
      ring: { pct: rd, text: RS.fmt.pct(rd), sub: t('ring.sub'), label: t('ring.label', { pct: RS.fmt.pct(rd) }) },
      metrics: metrics,
      cta: ctaFor(s, where)
    });
  }
  // Started before Sha'ban: say when the plan starts again (or that this pass is over).
  function paceText(s) {
    var sh = daysUntilShaban();
    if (!early(s) || sh == null) return '';
    return tn(waiting(s) ? 'wait.note' : 'early.note', sh, { month: shaban(), total: num(totalDays()) });
  }

  /* ------------------------------------------------------------------ prep home */
  function milestoneCard(s, n, r) {
    var w = weekOf(n), m = milestone(w), wr = weekRange(w), got = 0, all = 0;
    days().forEach(function (d) { if (d.n >= wr.from && d.n <= wr.to) { all += prompts(d).length; got += dayDone(s, d, r); } });
    var title = m ? ctext('prep.ms.' + w + '.title') : '';
    var goal = m ? ctext('prep.ms.' + w + '.goal') : '';
    return RS.ui.card({
      kicker: { icon: 'mountain', text: t('ms.kicker', { n: num(w) }) },
      title: title || t('ms.fallback', { n: num(w) }),
      cls: 'prep-ms',
      body: (goal ? '<p>' + esc(goal) + '</p>' : '') +
        '<div class="stack-sm mt-3"><div class="spread small"><span class="muted">' + esc(t('ms.days', { from: num(wr.from), to: num(wr.to) })) + '</span>' +
        '<span class="strong">' + esc(tn('ms.progress', all, { done: num(got) })) + '</span></div>' +
        RS.ui.bar(all ? 100 * got / all : 0, { label: t('ms.barLabel', { n: num(w) }) }) + '</div>'
    });
  }

  function dayRow(s, d, cur, r, live) {
    var ps = prompts(d), got = dayDone(s, d, r), all = ps.length;
    var isToday = live && d.n === cur, future = live && d.n > cur, full = all && got === all;
    var lead = '<span class="prep-dn' + (full ? ' is-done' : '') + (isToday ? ' is-today' : '') + (future ? ' is-future' : '') + '" aria-hidden="true">' +
      esc(num(d.n)) + (full ? '<span class="prep-dn-ok">' + RS.icon('check', { size: 12 }) + '</span>' : '') + '</span>';
    var sub = RS.ui.meta([d.track && trackById(d.track) ? esc(trackName(d.track)) : '', isToday ? esc(t('list.today')) : '']);
    return RS.ui.row({
      lead: lead,
      titleHtml: '<span class="sr-only">' + esc(t('list.day', { n: num(d.n) })) + ' </span>' + esc(RS.t('prep.day.' + d.n + '.theme')),
      subHtml: sub,
      trail: '<span class="row-val" aria-hidden="true">' + esc(frac(got, all)) + '</span><span class="sr-only">' + esc(tn('list.doneOf', all, { done: num(got) })) + '</span>',
      act: 'nav.go', arg: 'prep/day?n=' + d.n,
      cls: 'prep-day' + (isToday ? ' is-today' : '') + (future ? ' is-future' : ''),
      attrs: isToday ? { 'aria-current': 'date' } : null
    });
  }
  // Weeks fold away so the home stays short: the current and the next week start open, and so does an earlier week
  // with focus prompts to catch up on (`also`: {week: true}); any week can be opened.
  function weekOpen(w, cur, also) {
    if (openWeeks[w] != null) return openWeeks[w];
    var c = weekOf(cur);
    return w === c || w === c + 1 || !!(also && also[w]);
  }
  function daysCard(s, cur, r, live, also) {
    var blocks = [];
    for (var w = 1; w <= weekCount(); w++) {
      var wr = weekRange(w);
      var list = days().filter(function (d) { return d.n >= wr.from && d.n <= wr.to; });
      if (!list.length) continue;
      var title = ctext('prep.ms.' + w + '.title');
      var got = 0, all = 0;
      list.forEach(function (d) { got += dayDone(s, d, r); all += prompts(d).length; });
      var open = weekOpen(w, cur, also), lid = 'prep-wk-list-' + w;
      blocks.push('<h3 class="prep-wk-h"><button type="button" class="prep-wk" data-act="prep.week" data-arg="' + w + '" aria-expanded="' + open + '" aria-controls="' + lid + '">' +
        '<span class="prep-wk-txt"><span class="prep-wk-n">' + esc(t('list.week', { n: num(w) })) + '</span>' + (title ? '<span class="prep-wk-t">' + esc(title) + '</span>' : '') + '</span>' +
        '<span class="prep-wk-c" aria-hidden="true">' + esc(frac(got, all)) + '</span><span class="sr-only">' + esc(tn('list.doneOf', all, { done: num(got) })) + '</span>' +
        RS.icon('chevron-down', { size: 18, cls: 'prep-wk-chev' }) + '</button></h3>' +
        '<ul class="list prep-wk-list" id="' + lid + '"' + (open ? '' : ' hidden') + '>' + list.map(function (d) { return '<li class="li">' + dayRow(s, d, cur, r, live) + '</li>'; }).join('') + '</ul>');
    }
    return RS.ui.card({ kicker: { icon: 'calendar-days', text: t('list.kicker') }, title: tn('list.title', totalDays()), cls: 'prep-days', body: blocks.join('') });
  }

  // Someone who started after day 1 (mid-Sha'ban, where the plan follows the calendar) skipped the first days. Those
  // with prompts in a focus area that are not done yet, in plan order: [{day, left}].
  function catchUp(s, r) {
    if (!isOn(s) || inRamadan() || r.day <= 1) return [];
    var focus = focusTracks(s);
    if (!focus.length) return [];
    return days().filter(function (d) { return d.n < r.day; }).map(function (d) {
      var left = prompts(d).filter(function (p) { return focus.indexOf(p.track) >= 0 && !isDone(s, p.id, r); }).length;
      return left ? { day: d, left: left } : null;
    }).filter(Boolean);
  }
  function catchUpCard(s, r, list) {
    if (!list.length) return '';
    var focus = focusTracks(s), more = list.length - CATCH_ROWS;
    var rows = list.slice(0, CATCH_ROWS).map(function (x) {
      var d = x.day, areas = [];
      prompts(d).forEach(function (p) { if (focus.indexOf(p.track) >= 0 && !isDone(s, p.id, r) && areas.indexOf(p.track) < 0) areas.push(p.track); });
      return RS.ui.row({
        lead: '<span class="prep-dn" aria-hidden="true">' + esc(num(d.n)) + '</span>',
        titleHtml: '<span class="sr-only">' + esc(t('list.day', { n: num(d.n) })) + ' </span>' + esc(RS.t('prep.day.' + d.n + '.theme')),
        subHtml: RS.ui.meta(areas.map(function (id) { return esc(trackName(id)); }).concat(esc(tn('catch.left', x.left)))),
        act: 'nav.go', arg: 'prep/day?n=' + d.n, chevron: true, cls: 'prep-catch-row'
      });
    });
    return RS.ui.card({
      kicker: { icon: 'target', text: t('catch.kicker') },
      title: t('catch.title'),
      cls: 'prep-catch',
      body: '<p>' + esc(t('catch.body', { n: num(r.day) })) + '</p>' + '<div class="mt-2">' + RS.ui.list(rows) + '</div>' +
        (more > 0 ? '<p class="caption mt-3">' + esc(tn('catch.more', more)) + '</p>' : '')
    });
  }

  function tracksCard(s, r) {
    var focus = focusTracks(s);
    var rows = tracks().map(function (tr) {
      var all = 0, got = 0;
      days().forEach(function (d) { prompts(d).forEach(function (p) { if (p.track === tr.id) { all += 1; if (isDone(s, p.id, r)) got += 1; } }); });
      if (!all) return '';
      var pct = Math.round(100 * got / all);
      return RS.ui.row({
        icon: tr.icon,
        titleHtml: esc(trackName(tr.id)) + (focus.indexOf(tr.id) >= 0 ? ' ' + tag(t('focus'), 'is-focus') : ''),
        sub: tn('tracks.sub', all, { done: num(got) }),
        value: RS.fmt.pct(pct),
        extra: RS.ui.bar(pct),
        cls: 'prep-track'
      });
    }).filter(Boolean);
    if (!rows.length) return '';
    return RS.ui.card({ kicker: { icon: 'compass', text: t('tracks.kicker') }, title: t('tracks.title'), body: RS.ui.list(rows), cls: 'prep-tracks' });
  }

  // Prayers ticked on time since this round began (its first prayer day to the current one).
  function prayersSince(s, r) {
    var from = RS.todayISO(new Date(r.from)), to = salahKey(), on = 0;
    Object.keys(s.checkins).forEach(function (k) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && k >= from && k <= to) on += salahOf(s, k).filter(Boolean).length;
    });
    return on;
  }
  // The completion moment (day 30): the wording follows how much of the round was done; an early pass adds that
  // the plan starts again on 1 Sha'ban. Its figures are the ones the hero does not show.
  function completeCard(s, r) {
    var full = roundPct(s, r) >= FULL_DONE;
    var again = early(s) ? '<p class="mt-2">' + esc(t('complete.again', { month: shaban() })) + '</p>' : '';
    var m = [];
    if (days().length) m.push({ label: t('m.fullDays'), value: frac(fullDays(s, r), totalDays()) });
    m.push({ label: t('m.reflections'), value: num(reflectionCount(s)) });
    m.push({ label: t('m.prayers'), value: num(prayersSince(s, r)) });
    return RS.ui.card({
      cls: 'prep-complete',
      body: '<div class="prep-complete-in"><span class="prep-complete-ic" aria-hidden="true">' + RS.icon('badge-check', { size: 26 }) + '</span>' +
        '<div class="stack-sm"><h2 class="card-title">' + esc(t(full ? 'complete.title' : 'complete.titlePartial')) + '</h2><p>' + esc(t(full ? 'complete.body' : 'complete.bodyPartial')) + '</p>' + again + '</div></div>' +
        '<div class="mt-4">' + RS.ui.metrics(m) + '</div>'
    });
  }
  // In Ramadan (plan closed, not completed): a read-only summary.
  function summaryCard(s, r) {
    return RS.ui.card({
      kicker: { icon: 'lock', text: t('readonly.kicker') },
      title: t('readonly.title'),
      cls: 'prep-summary',
      body: '<p>' + esc(t('readonly.body')) + '</p><div class="mt-4">' + RS.ui.metrics(statsMetrics(s, r)) + '</div>'
    });
  }

  function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function settingsCard() {
    var rows = [];
    // The cloud module owns push: its 'push.toggle' action opens the time picker or turns reminders off (rs-push).
    // The hour is read the way its settings row reads it (an hour it does not offer, or v7's '1', means 20:00).
    if (RS.cloud && RS.cloud.feat && RS.cloud.feat.push && pushSupported()) {
      var push = RS.store.get('rs-push', null), hour = push && typeof push === 'object' ? Number(push.hour) : NaN;
      if (PUSH_HOURS.indexOf(hour) < 0) hour = 20;
      rows.push(RS.ui.row({ icon: 'bell', title: t('settings.reminder'),
        sub: push ? t('settings.reminderOn', { time: RS.fmt.time(new Date(2000, 0, 1, hour, 0)) }) : t('settings.reminderSub'),
        toggle: { on: !!push, act: 'push.toggle' } }));
    }
    if (questions().length) rows.push(RS.ui.row({ icon: 'list-checks', title: t('settings.retake'), sub: t('settings.retakeSub'), act: 'prep.retake', chevron: true }));
    rows.push(RS.ui.row({ icon: 'rotate-ccw', title: t('settings.restart'), sub: t('settings.restartSub'), act: 'prep.restart', cls: 'prep-danger' }));
    return RS.ui.card({
      kicker: { icon: 'settings', text: t('settings.kicker') },
      body: RS.ui.list(rows) + '<p class="caption mt-3">' + esc(t('settings.how')) + '</p>'
    });
  }

  function homeView(view, s) {
    var ro = inRamadan(), n = planDay(s), r = round(s), complete = isComplete(s), h = [];
    h.push(heroHtml('home'));
    var pace = complete ? '' : paceText(s);
    if (pace) h.push(RS.ui.note(pace, { icon: 'calendar-days', tone: 'plain' }));
    if (complete) h.push(completeCard(s, r));
    else if (ro) h.push(summaryCard(s, r));
    if (!ro) { h.push(salahCard(s)); h.push(quranCard(s)); }
    if (days().length) {
      var catchList = catchUp(s, r), also = {};
      catchList.forEach(function (x) { also[weekOf(x.day.n)] = true; });
      h.push(catchUpCard(s, r, catchList));
      if (!ro && !waiting(s) && milestones().length) h.push(milestoneCard(s, n, r));     // this week's milestone
      h.push(daysCard(s, n, r, !ro && !waiting(s), also));
      h.push(tracksCard(s, r));
    } else {
      h.push(RS.ui.card({ body: RS.ui.empty({ icon: 'sprout', title: t('empty.title'), body: t('empty.body') }) }));
    }
    h.push(planCard());
    if (!ro) h.push(settingsCard());
    view.innerHTML = h.join('');
  }

  /* ------------------------------------------------------------------ intro (not started) */
  // The last programme (stale, or archived in rs-prep.past): Hijri year and prompts done.
  function lastPrep(s) {
    var src = null, year = 0;
    if (isStale(s)) { src = s; year = passYear(s); }
    else if (!s.started) {
      var past = obj(s.past), ks = Object.keys(past).filter(function (k) { return /^\d{3,4}$/.test(k); }).sort(function (a, b) { return b - a; });
      if (ks.length) { src = obj(past[ks[0]]); year = parseInt(ks[0], 10); }
    }
    if (!src || !year) return null;
    var dn = obj(src.done), un = obj(src.undone), done = 0;
    Object.keys(dn).forEach(function (id) { var d = Number(dn[id]) || 0, u = Number(obj(un[id]).ts) || 0; if (d > 0 && u < d) done += 1; });
    return { year: year, done: Math.min(done, allPromptCount()) };
  }
  function introView(view, s) {
    var ro = inRamadan(), nq = questions().length, h = [];
    h.push(heroHtml('home'));
    var last = lastPrep(s);
    if (last && allPromptCount()) h.push(RS.ui.note(tn('intro.last', allPromptCount(), { year: String(last.year), done: num(last.done) }), { icon: 'rotate-ccw', tone: 'plain' }));
    if (ro) h.push(RS.ui.note(t('intro.closed'), { icon: 'moon', tone: 'plain' }));
    else if (month() !== 8 && daysUntilShaban() > 0) h.push(RS.ui.note(tn('intro.bestTime', daysUntilShaban(), { month: shaban(), total: num(totalDays()) }), { icon: 'calendar-days', tone: 'plain' }));
    h.push(RS.ui.card({
      kicker: { icon: 'sprout', text: tn('intro.kicker', totalDays()) },
      title: ctext('prep.intro.title') || t('title'),
      body: ctext('prep.intro.body') ? '<p>' + esc(RS.t('prep.intro.body')) + '</p>' : ''
    }));
    h.push(RS.ui.card({
      kicker: { icon: 'route', text: t('how.kicker') },
      body: RS.ui.list([
        nq ? RS.ui.row({ icon: 'list-checks', title: t('how.check'), sub: tn('how.checkSub', nq) }) : '',
        RS.ui.row({ icon: 'calendar-days', title: tn('how.daily', perDay()), sub: t('how.dailySub') }),
        RS.ui.row({ icon: 'circle-check', title: t('how.checkins'), sub: t('how.checkinsSub') })
      ])
    }));
    if (tracks().length) {
      h.push(RS.ui.card({
        kicker: { icon: 'compass', text: t('covers.kicker') },
        title: tn('covers.title', tracks().length),
        body: RS.ui.list(tracks().map(function (tr) {
          return RS.ui.row({ icon: tr.icon, title: trackName(tr.id), sub: ctext('prep.track.' + tr.id + '.desc') });
        }))
      }));
    }
    h.push(planCard());
    if (!ro) {
      var partial = answeredCount(s.answers) > 0 && firstUnanswered(s.answers) >= 0;
      h.push(RS.ui.btn(partial ? t('cta.continue') : t('cta.start'), { act: 'prep.start', block: true, cls: 'prep-start' }));
    }
    view.innerHTML = h.join('');
  }

  /* ------------------------------------------------------------------ assessment */
  // First time: answers are saved as you go (the check can be continued later). A retake (after a result, or once
  // the programme runs) works on a copy that is saved only by "See my result"; leaving the check discards it.
  function isRetake(s) { return !!s.assessedAt || isOn(s); }
  function assessAnswers(s) {
    if (!isRetake(s)) return s.answers;
    if (!draft) draft = { answers: Object.assign({}, s.answers) };
    return draft.answers;
  }
  function assessView(view, params) {
    var s = state(), qs = questions();
    if (!qs.length) {
      view.innerHTML = RS.ui.hero({ kicker: { icon: 'list-checks', text: t('assess.title') }, text: t('assess.none'), cta: { text: t('cta.home'), act: 'nav.go', arg: 'prep' } });
      return;
    }
    var ans = assessAnswers(s);
    var i = parseInt(params.q, 10);
    if (!(i >= 0 && i < qs.length)) {
      // Opened without a valid ?q=: show the first unanswered question and pin it in the URL so that answering
      // (which re-renders) keeps this question on screen.
      i = firstUnanswered(ans); if (i < 0) i = 0;
      RS.router.go('prep/assess', { q: i }, { replace: true });
    }
    var q = qs[i], sel = answerIdx(ans, q), last = i === qs.length - 1;
    RS.topbar({ title: t('assess.title'), back: 'prep' });
    var hero = RS.ui.hero({
      kicker: { icon: 'list-checks', text: t('assess.kicker') },
      cls: 'prep-hero prep-q-hero',
      extra: '<p class="prep-q-count">' + esc(t('assess.progress', { n: num(i + 1), total: num(qs.length) })) + '</p>' +
        '<h2 class="prep-question" id="prep-q-title">' + esc(RS.t('prep.a.' + q.id + '.q')) + '</h2>' +
        RS.ui.bar(100 * (i + (sel >= 0 ? 1 : 0)) / qs.length, { onDark: true, label: t('assess.barLabel') })
    });
    var opts = q.scores.map(function (sc, k) {
      var id = 'prep-opt-' + k, on = k === sel;
      return '<li class="li"><label class="row prep-opt' + (on ? ' is-selected' : '') + '" for="' + id + '">' +
        '<input type="radio" class="prep-radio" name="prep-answer" id="' + id + '" value="' + k + '"' + (on ? ' checked' : '') + '>' +
        '<span class="prep-radio-dot" aria-hidden="true"></span><span class="row-txt"><span class="row-title">' + esc(RS.t('prep.a.' + q.id + '.o' + k)) + '</span></span></label></li>';
    }).join('');
    // The question heading in the hero names the group (one announcement, not three).
    var card = RS.ui.card({
      cls: 'prep-opts-card',
      body: '<fieldset class="prep-opts" aria-labelledby="prep-q-title" data-act-change="prep.answer" data-arg="' + i + '">' +
        '<ul class="list">' + opts + '</ul></fieldset>'
    });
    var nav = '<div class="btn-row prep-q-nav">' +
      (i > 0 ? RS.ui.btn(t('assess.back'), { act: 'prep.qnav', arg: 'back:' + i, variant: 'secondary', icon: 'arrow-left' }) : '') +
      RS.ui.btn(last ? t('assess.finish') : t('assess.next'), { act: 'prep.qnav', arg: 'next:' + i, disabled: sel < 0, id: 'prep-next' }) + '</div>' +
      '<p class="caption t-center">' + esc(t(isRetake(s) ? 'assess.retakeHint' : 'assess.hint')) + '</p>';
    view.innerHTML = hero + card + nav;
  }

  function resultView(view) {
    var s = state();
    RS.topbar({ title: t('result.title'), back: 'prep' });
    var A = assessPct(s);
    if (A == null) {
      view.innerHTML = RS.ui.hero({ kicker: { icon: 'list-checks', text: t('assess.kicker') }, text: t('result.none'), cta: { text: t('cta.start'), act: 'prep.start' } });
      return;
    }
    var on = isOn(s), ro = inRamadan(), total = totalDays(), sc = trackScores(s), focus = focusTracks(s), scored = Object.keys(sc).length > 0;
    var r = on ? round(s) : null, cur = planDay(s), day = dayByN(cur);
    // "Your plan starts today" only when this check started the programme (same moment) today, not on a retake.
    var here = on && Math.abs((Number(s.assessedAt) || 0) - passStart(s)) < 5000 && dayDiff(new Date(passStart(s)), noon()) === 0;
    var metrics = [];
    if (focus.length) metrics.push({ label: t('result.focusLabel'), value: trackName(focus[0]) });
    // Where the plan starts, only right after this check started it (a retake mid-plan: the CTA names today's day).
    if (here && !ro) metrics.push({ label: t('result.startLabel'), value: t('result.startValue', { n: num(r.day) }) });
    var cta;
    if (ro) cta = { eyebrow: t('begun.eyebrow'), text: t('begun.cta'), act: 'prep.begin', arg: 'today' };
    else if (!on) cta = { eyebrow: t('kicker'), text: t('cta.home'), act: 'prep.begin', arg: 'prep' };
    else if (here && day && !waiting(s)) cta = { eyebrow: t('result.ctaEyebrow'), text: t('cta.today', { theme: RS.t('prep.day.' + cur + '.theme') }), act: 'prep.begin', arg: 'prep/day?n=' + cur };
    else cta = ctaFor(s, 'result', 'prep.begin') || { eyebrow: t('kicker'), text: t('cta.home'), act: 'prep.begin', arg: 'prep' };
    var h = [], big = pctParts(A);
    h.push(RS.ui.hero({
      cls: 'prep-hero',
      kicker: { icon: 'list-checks', text: t('assess.kicker') },
      number: big.number, unit: big.unit, label: t('result.label'),
      ring: { pct: A, sub: t('result.level.' + (A < 40 ? 'start' : A < 70 ? 'build' : 'strong')), label: t('ring.label', { pct: RS.fmt.pct(A) }) },
      metrics: metrics,
      cta: cta
    }));
    if (focus.length) {
      h.push(RS.ui.card({
        kicker: { icon: 'target', text: t('result.focusKicker') },
        title: tn('result.focusTitle', focus.length),
        body: RS.ui.list(focus.map(function (id) {
          var tr = trackById(id);
          return RS.ui.row({ icon: tr.icon, title: trackName(id), sub: ctext('prep.track.' + id + '.desc'), value: RS.fmt.pct(sc[id]) });
        })) + '<p class="caption mt-3">' + esc(t('result.focusBody')) + '</p>'
      }));
    } else if (scored) {
      h.push(RS.ui.card({
        kicker: { icon: 'target', text: t('result.focusKicker') },
        title: t('result.strongTitle'),
        body: '<p>' + esc(t('result.strongBody', { pct: RS.fmt.pct(FOCUS_BELOW) })) + '</p>'
      }));
    }
    if (scored) {
      h.push(RS.ui.card({
        kicker: { icon: 'compass', text: t('result.areasKicker') },
        body: RS.ui.list(tracks().filter(function (tr) { return sc[tr.id] != null; }).map(function (tr) {
          return RS.ui.row({ icon: tr.icon, title: trackName(tr.id), value: RS.fmt.pct(sc[tr.id]), extra: RS.ui.bar(sc[tr.id]), cls: 'prep-track' });
        }))
      }));
    }
    if (milestones().length) {
      h.push(RS.ui.card({
        kicker: { icon: 'calendar-days', text: t('result.planKicker') },
        title: tn('result.planTitle', total),
        body: RS.ui.list(milestones().map(function (m) {
          var wr = weekRange(m.week);
          return RS.ui.row({ lead: '<span class="prep-dn" aria-hidden="true">' + esc(num(m.week)) + '</span>', title: ctext('prep.ms.' + m.week + '.title') || t('ms.fallback', { n: num(m.week) }),
            sub: t('ms.days', { from: num(wr.from), to: num(wr.to) }) });
        }))
      }));
    }
    h.push('<div class="btn-row">' + RS.ui.btn(t('result.home'), { act: 'prep.begin', arg: 'prep', variant: 'secondary', block: true }) + '</div>');
    view.innerHTML = h.join('');
  }

  /* ------------------------------------------------------------------ day */
  function relLabel(n, cur) {
    var d = n - cur;
    if (d === 0) return t('day.rel.today');
    if (d === 1) return t('day.rel.tomorrow');
    if (d === -1) return t('day.rel.yesterday');
    return d > 0 ? tn('day.rel.ahead', d) : tn('day.rel.ago', -d);
  }
  function dayView(view, params) {
    var s = state(), total = totalDays(), on = isOn(s), ro = inRamadan();
    var cur = planDay(s), n = RS.clamp(parseInt(params.n, 10) || cur, 1, total);
    var day = dayByN(n), r = round(s), live = on && !ro && !waiting(s);
    // "Day 12" is the (sticky) screen title; the switcher says where the day sits relative to today.
    RS.topbar({ title: t('day.title', { n: num(n) }), sub: t('title'), back: 'prep' });
    var stepper = RS.ui.stepper({
      cls: 'prep-stepper',
      title: live ? relLabel(n, cur) : t('list.week', { n: num(weekOf(n)) }),
      sub: live ? t('list.week', { n: num(weekOf(n)) }) : '',
      prev: { act: 'prep.dayStep', arg: '-1', label: t('day.prev'), disabled: n <= 1 },
      next: { act: 'prep.dayStep', arg: '+1', label: t('day.next'), disabled: n >= total }
    });
    if (!day) {
      view.innerHTML = stepper + RS.ui.hero({ kicker: { icon: 'sprout', text: t('kicker') }, text: t('empty.body'), cta: { text: t('cta.home'), act: 'nav.go', arg: 'prep' } });
      return;
    }
    var got = dayDone(s, day, r), all = prompts(day).length, track = day.track && trackById(day.track);
    var refl = reflText(s, n);
    var h = [stepper];
    var pctDay = all ? Math.round(100 * got / all) : 0;
    // The day number is the hero figure and the day's theme its headline.
    h.push(RS.ui.hero({
      cls: 'prep-hero prep-day-hero' + (takeCelebrate() ? ' prep-celebrate' : ''),
      kicker: { icon: track ? track.icon : 'sprout', text: track ? trackName(day.track) : t('kicker') },
      number: num(n), unit: t('day.of', { total: num(total) }),
      label: RS.t('prep.day.' + n + '.theme'),
      ring: all ? { pct: pctDay, text: frac(got, all), sub: t('ring.done'), label: tn('day.ringLabel', all, { done: num(got) }) } : null,
      metrics: [
        { label: t('m.week'), value: num(weekOf(n)) },
        { label: t('m.reflection'), value: refl.trim() ? t('day.written') : t('day.notYet'), id: 'prep-refl-m', text: true }
      ]
    }));
    if (n === total && isComplete(s)) h.push(completeCard(s, r));
    h.push(promptsCard(s, day, { kicker: live && n === cur ? t('day.stepsToday') : t('day.steps') }));
    var mot = ctext('prep.day.' + n + '.mot');
    if (mot || day.ref) {
      h.push(RS.ui.card({
        kicker: { icon: 'scroll-text', text: t('day.motivation') },
        cls: 'prep-mot',
        body: (mot ? '<blockquote class="quote">' + esc(mot) + '</blockquote>' : '') + RS.ui.ref({ ref: day.ref, url: day.url, grade: day.grade })
      }));
    }
    var q = ctext('prep.day.' + n + '.reflect');
    h.push(RS.ui.card({
      kicker: { icon: 'notebook-pen', text: t('day.reflection') },
      cls: 'prep-reflect',
      body: RS.ui.textarea({ id: 'prep-refl', label: q || t('day.reflectFallback'), value: refl, rows: 4, maxlength: TEXT_MAX, placeholder: t('day.reflectPh'),
        actInput: 'prep.reflect', actChange: 'prep.reflect', arg: n }) +
        '<p class="caption mt-2" id="prep-refl-status" aria-live="polite">' + esc(refl.trim() ? t('saved') : t('savedHint')) + '</p>'
    }));
    view.innerHTML = h.join('');
  }

  /* ------------------------------------------------------------------ plan (v7 intentions, dua list, make-up fasts) */
  function planView(view) {
    RS.topbar({ title: t('plan.title'), sub: t('title'), back: 'prep' });
    var g = goals(), q = qada(), dc = duaCount(), du = daysUntilRamadan();
    var written = g.filter(function (x) { return x.trim(); }).length;
    var h = [];
    // The time left to prepare is the figure (none once Ramadan has begun or when the date is unknown).
    h.push(RS.ui.hero({
      cls: 'prep-hero',
      kicker: { icon: 'target', text: t('plan.kicker') },
      number: du != null && du > 0 ? num(du) : null,
      label: du != null && du > 0 ? tn('daysUntil', du) : null,
      text: t('plan.intro'),
      metrics: [
        { label: t('plan.mGoals'), value: frac(written, 3) },
        { label: t('plan.mDuas'), value: num(dc) },
        { label: t('plan.mQada'), value: num(Math.max(0, q.owed - q.done)) }
      ]
    }));
    h.push(RS.ui.card({
      kicker: { icon: 'target', text: t('plan.goals') },
      body: [1, 2, 3].map(function (i) {
        return RS.ui.field({ id: 'prep-goal-' + i, label: t('plan.goalLabel', { n: num(i) }), value: g[i - 1], maxlength: GOAL_MAX,
          placeholder: t('plan.goalPh' + i), actInput: 'prep.goal', actChange: 'prep.goal', arg: i, autocomplete: 'off' });
      }).join('') + '<p class="caption mt-2" id="prep-goal-status" aria-live="polite">' + esc(t('savedHint')) + '</p>'
    }));
    h.push(RS.ui.card({
      kicker: { icon: 'hand-heart', text: t('plan.duas') },
      body: RS.ui.textarea({ id: 'prep-duas', label: t('plan.duaLabel'), value: duaText(), rows: 6, maxlength: TEXT_MAX, placeholder: t('plan.duaPh'),
        hint: t('plan.duaHint'), actInput: 'prep.duas', actChange: 'prep.duas' }) +
        '<p class="caption mt-2" id="prep-duas-status" aria-live="polite">' + esc(t('savedHint')) + '</p>'
    }));
    // v7 had no upper limit: '−' never goes below 0, '+' stops only at QADA_MAX; a tap changes the value by one.
    var stepper = function (k, label, value) {
      var lid = 'prep-qada-' + k, vid = 'prep-qada-v-' + k;
      return '<div class="spread prep-counter" role="group" aria-labelledby="' + lid + '"><span class="strong" id="' + lid + '">' + esc(label) + '</span>' +
        '<span class="prep-counter-ctl"><button type="button" class="prep-step" data-act="prep.qada" data-arg="' + k + ':-1" aria-label="' + esc(t('plan.less', { what: label })) + '" aria-describedby="' + vid + '"' +
        (value <= 0 ? ' aria-disabled="true"' : '') + '>' + RS.icon('minus', { size: 20 }) + '</button>' +
        '<span class="prep-counter-val" id="' + vid + '">' + esc(num(value)) + '</span>' +
        '<button type="button" class="prep-step" data-act="prep.qada" data-arg="' + k + ':1" aria-label="' + esc(t('plan.more', { what: label })) + '" aria-describedby="' + vid + '"' +
        (value >= QADA_MAX ? ' aria-disabled="true"' : '') + '>' + RS.icon('plus', { size: 20 }) + '</button></span></div>';
    };
    h.push(RS.ui.card({
      kicker: { icon: 'calendar-check', text: t('plan.qada') },
      title: t('plan.qadaTitle'),
      body: '<div class="stack">' + stepper('owed', t('plan.owed'), q.owed) + stepper('done', t('plan.madeUp'), q.done) + '</div>' +
        '<p class="prep-status' + (q.owed && q.done >= q.owed ? ' accent' : '') + '" aria-live="polite">' + esc(qadaLine(q)) + '</p>'
    }));
    view.innerHTML = h.join('');
  }

  /* ------------------------------------------------------------------ routes */
  RS.router.register('prep', {
    tab: 'today',
    title: function () { return t('title'); },
    render: function (view) {
      var s = state();
      RS.topbar({ title: t('title'), sub: RS.fmt.hijri(), back: 'today' });
      if (isOn(s)) homeView(view, s); else introView(view, s);
    },
    onHide: flush
  });
  RS.router.register('prep/assess', { tab: 'today', parent: 'prep', title: function () { return t('assess.title'); }, render: assessView });
  RS.router.register('prep/result', { tab: 'today', parent: 'prep', title: function () { return t('result.title'); }, render: resultView });
  RS.router.register('prep/day', {
    tab: 'today', parent: 'prep',
    title: function (p) { return t('day.title', { n: num(parseInt(p && p.n, 10) || planDay(state())) }); },
    render: dayView,
    onHide: flush
  });
  RS.router.register('prep/plan', { tab: 'today', parent: 'prep', title: function () { return t('plan.title'); }, render: planView, onHide: flush });

  RS.on('route', function (e) {
    var route = e && e.route;
    if (route !== 'prep/assess') draft = null;             // leaving the readiness check discards a retake
    if (refocus) {
      var arg = refocus;
      refocus = null;
      // The router focuses the screen title after a navigation; put focus back on the arrow that was used.
      if (route === 'prep/day') {
        setTimeout(function () {
          var el = document.querySelector('#view [data-act="prep.dayStep"][data-arg="' + arg + '"]');
          if (el) { try { el.focus({ preventScroll: true }); } catch (err) { el.focus(); } }
        }, 0);
      }
    }
  });

  /* ------------------------------------------------------------------ actions */
  // Starting turns on the Today prep cards (settings.showPrep, the v7 "show prep card" flag) so the check-ins and
  // prompts are on Today in every mode; prep turns it off again when this Ramadan is over, unless it was on before.
  function startProgram(s, at) {
    at = at || Date.now();
    s.started = at;
    s.hy = targetYear();
    s.since = { ts: at, hy: s.hy };
    s.completedAt = null;
    if (!RS.settings.showPrep) {
      RS.settings.showPrep = true;
      RS.saveSettings();
      s.autoShow = true;
    }
  }
  function autoHide(s) {
    if (!s.autoShow) return false;
    s.autoShow = false;
    if (RS.settings.showPrep) { RS.settings.showPrep = false; RS.saveSettings(); }
    return true;
  }
  // Values are blanked rather than deleted so that cloud sync (which merges key by key) does not bring them back.
  function blank(m, v) { var out = {}; Object.keys(obj(m)).forEach(function (k) { out[k] = v && typeof v === 'object' ? Object.assign({}, v) : v; }); return out; }
  function archive(s) {
    if (!s.started) return;
    var past = obj(s.past), y = passYear(s) || targetYear(s.started);
    past[String(y)] = { started: s.started, since: s.since || null, answers: s.answers, assessment: s.assessment, done: s.done, undone: s.undone,
      reflections: s.reflections, completedAt: s.completedAt || null };
    s.past = past;
    s.started = null; s.hy = null; s.since = null; s.startDay = null; s.completedAt = null; s.assessedAt = null;
    s.answers = blank(s.answers, null); s.assessment = blank(s.assessment, null);
    s.reflections = blank(s.reflections, { t: '', ts: Date.now() });     // newer than any copy on another device
    s.done = {}; s.undone = {};
    autoHide(s);
  }

  RS.act('prep.start', function () {
    if (inRamadan()) { RS.router.go('prep'); return; }
    var s = state();
    if (isStale(s)) { archive(s); save(s); }
    if (!questions().length) {
      if (!isOn(s)) { startProgram(s); save(s); }
      if (RS.router.current().route === 'prep') RS.refresh(); else RS.router.go('prep');
      return;
    }
    // Continue at the first unanswered question; with every answer given, at the last one ("See my result").
    var i = firstUnanswered(s.answers);
    RS.router.go('prep/assess', { q: i < 0 ? questions().length - 1 : i });
  });
  RS.act('prep.retake', function () { draft = null; RS.router.go('prep/assess', { q: 0 }); });

  RS.act('prep.answer', function (value, el) {
    var i = parseInt(el && el.getAttribute('data-arg'), 10), q = questions()[i];
    var k = parseInt(value, 10);
    if (!q || !(k >= 0 && k < q.scores.length)) return;
    var s = state(), ans = assessAnswers(s);
    ans[q.id] = k;
    if (!isRetake(s)) {                  // first time: saved as you go
      s.assessment[q.id] = Number(q.scores[k]) || 0;
      save(s);
    }
    RS.buzz(6);
    RS.refresh();
  });
  RS.act('prep.qnav', function (arg) {          // arg 'next:<i>' | 'back:<i>' (i = the question on screen)
    var s = state(), qs = questions(), m = /^(next|back):(\d+)$/.exec(arg || '');
    if (!m) return;
    var dir = m[1], i = RS.clamp(parseInt(m[2], 10), 0, Math.max(0, qs.length - 1)), ans = assessAnswers(s);
    if (dir === 'back') { RS.router.go('prep/assess', { q: Math.max(0, i - 1) }, { replace: true }); return; }
    if (!qs[i] || answerIdx(ans, qs[i]) < 0) return;
    if (i < qs.length - 1) { RS.router.go('prep/assess', { q: i + 1 }, { replace: true }); return; }
    var miss = firstUnanswered(ans);
    if (miss >= 0) { RS.router.go('prep/assess', { q: miss }, { replace: true }); return; }
    var keep = Object.assign({}, ans), at = Date.now();
    draft = null;
    if (isStale(s)) archive(s);
    s.answers = keep;
    qs.forEach(function (q) { var k = answerIdx(keep, q); if (k >= 0) s.assessment[q.id] = Number(q.scores[k]) || 0; });
    s.assessedAt = at;
    if (!isOn(s) && !inRamadan()) startProgram(s, at);
    save(s);
    RS.router.go('prep/result', null, { replace: true });
  });
  RS.act('prep.begin', function (route) { RS.router.go(route || 'prep', null, { replace: true }); });

  // A tap records that one prayer with its time (pray), so syncing with another device keeps the prayers each one
  // ticked; salah [bool x5] is updated with it.
  RS.act('prep.salah', function (i) {
    i = parseInt(i, 10);
    if (!(i >= 0 && i < 5)) return;
    var s = state(), key = salahKey(), c = obj(s.checkins[key]), salah = salahOf(s, key);
    salah[i] = !salah[i];
    c.pray = obj(c.pray);
    c.pray[PRAYERS[i].id] = { v: salah[i], ts: Date.now() };
    c.salah = salah;
    s.checkins[key] = c;
    save(s);
    RS.buzz(8);
    if (salah[i] && salah.every(Boolean)) RS.toast(t('toast.allSalah'), { tone: 'success' });
    RS.refresh();
  });
  RS.act('prep.q', function (sign) {
    var s = state(), key = todayKey(), unit = s.qunit;
    var before = unit === 'pages' ? pagesToday() : minutesOn(s, key);
    var v = RS.clamp(before + (sign === '-' ? -Q_STEP[unit] : Q_STEP[unit]), 0, Q_MAX[unit]);
    if (v === before) return;
    if (unit === 'pages') setPagesToday(v);
    else {
      var c = obj(s.checkins[key]);
      c.quran = { minutes: v, ts: Date.now() };     // 0 is kept (with its ts) so a correction syncs
      s.checkins[key] = c;
      save(s);
    }
    RS.buzz(6);
    var target = quranTarget(targetDay(s), unit);
    if (before < target && v >= target) RS.toast(t('toast.quranTarget'), { tone: 'success' });
    RS.refresh();
  });
  RS.act('prep.qunit', function (unit) {
    if (Q_UNITS.indexOf(unit) < 0) return;
    var s = state();
    if (s.qunit === unit) return;
    s.qunit = unit;
    save(s);
    RS.refresh();
  });
  RS.act('prep.done', function (id) {
    var s = state(), day = dayOfPrompt(id);
    if (!day) return;
    if (!canTick(s, day.n)) {
      RS.toast(inRamadan() ? t('day.readonly') : isOn(s) ? tn('day.opensIn', day.n - planDay(s), { day: num(day.n) }) : t('day.notStarted'));
      return;
    }
    var r = round(s), wasComplete = lastDayDone(s, r), finished = false, at = Date.now();
    // An untick is recorded with its time (undone) so that syncing with another device does not tick it again.
    if (isDone(s, id, r)) { delete s.done[id]; s.undone[id] = { ts: at }; }
    else { s.done[id] = at; delete s.undone[id]; }
    var nowDone = isDone(s, id, r);
    if (!wasComplete && lastDayDone(s, r) && !((Number(s.completedAt) || 0) >= r.from)) {
      s.completedAt = at;
      celebrate = finished = true;
    }
    save(s);
    RS.buzz(nowDone ? 10 : 6);
    if (finished) RS.toast(t(roundPct(s, r) >= FULL_DONE ? 'toast.complete' : 'toast.completePartial'), { tone: 'success', ms: 5000 });
    else if (nowDone && dayDone(s, day, r) === prompts(day).length) RS.toast(t('toast.dayDone', { n: num(day.n) }), { tone: 'success' });
    RS.refresh();
  });
  RS.act('prep.tip', function (id, el) {
    openTips[id] = !openTips[id];
    if (!el) return;
    el.setAttribute('aria-expanded', String(!!openTips[id]));
    var p = document.getElementById(el.getAttribute('aria-controls'));
    if (p) p.hidden = !openTips[id];
  });
  RS.act('prep.week', function (w, el) {
    w = parseInt(w, 10);
    if (!(w >= 1)) return;
    var open = !(el && el.getAttribute('aria-expanded') === 'true');
    openWeeks[w] = open;
    if (!el) return;
    el.setAttribute('aria-expanded', String(open));
    var list = document.getElementById(el.getAttribute('aria-controls'));
    if (list) list.hidden = !open;
  });
  RS.act('prep.dayStep', function (d) {
    var cur = RS.router.current(), n = parseInt(cur.params && cur.params.n, 10) || planDay(state());
    var to = RS.clamp(n + (d === '-1' ? -1 : 1), 1, totalDays());
    if (to === n) return;
    refocus = d === '-1' ? '-1' : '+1';
    RS.router.go('prep/day', { n: to }, { replace: true });
  });

  RS.act('prep.reflect', function (value, el, e) {
    var n = parseInt(el && el.getAttribute('data-arg'), 10);
    if (!(n >= 1)) return;
    var text = String(value || '').slice(0, TEXT_MAX);
    var write = function () {
      var s = state();
      // {t, ts} like the journal: sync keeps the newer edit. '' (not deleted) so that a cleared reflection syncs.
      s.reflections[n] = { t: text.trim() ? text : '', ts: Date.now() };
      save(s);
      status('prep-refl-status', t('saved'));
      // the day hero's Reflection metric, when this day is still on screen
      var dd = document.querySelector('#prep-refl-m dd'), cur = RS.router.current();
      if (dd && cur && cur.route === 'prep/day' && parseInt(cur.params && cur.params.n, 10) === n) {
        var v = text.trim() ? t('day.written') : t('day.notYet');
        if (dd.textContent !== v) dd.textContent = v;
      }
    };
    if (e && e.type === 'change') now('refl' + n, write); else later('refl' + n, write);
  });
  RS.act('prep.goal', function (value, el, e) {
    var i = parseInt(el && el.getAttribute('data-arg'), 10);
    if (!(i >= 1 && i <= 3)) return;
    var text = String(value || '').slice(0, GOAL_MAX);
    var write = function () {
      var g = obj(extras().goals);
      g['g' + i] = { t: text, ts: Date.now() };
      setExtras('goals', g);
      status('prep-goal-status', t('saved'));
    };
    if (e && e.type === 'change') now('goal' + i, write); else later('goal' + i, write);
  });
  RS.act('prep.duas', function (value, el, e) {
    var text = String(value || '').slice(0, TEXT_MAX);
    var write = function () {
      setExtras('duas', { t: text, ts: Date.now() });
      status('prep-duas-status', t('saved'));
    };
    if (e && e.type === 'change') now('duas', write); else later('duas', write);
  });
  RS.act('prep.qada', function (arg) {
    var m = /^(owed|done):(-?1)$/.exec(arg || '');
    if (!m) return;
    var k = m[1], stored = obj(extras().qada);
    var cur = Math.max(0, parseInt(stored[k], 10) || 0), next;
    if (m[2] === '-1') next = Math.max(0, cur - 1);
    else { if (cur >= QADA_MAX) return; next = cur + 1; }
    if (next === cur) return;
    var q = Object.assign({ owed: 0, done: 0 }, stored);    // the other count is kept exactly as stored
    q[k] = next;
    q.ts = Date.now();
    setExtras('qada', q);
    RS.buzz(6);
    RS.refresh();
  });

  RS.act('prep.restart', function () {
    if (inRamadan()) return;
    // In Sha'ban the plan follows the calendar, so it carries on from today's day rather than from day 1.
    var body = month() === 8 ? t('restart.bodyShaban', { n: num(planDay(state())) }) : t('restart.body');
    RS.confirm({ title: t('restart.title'), body: body, ok: t('restart.ok'), danger: true }).then(function (ok) {
      if (!ok) return;
      var s = state(), at = Date.now();
      // Ticks made before `since` no longer count (they stay stored, so nothing is lost if another device syncs).
      s.since = { ts: at, hy: targetYear() };
      s.completedAt = null;
      save(s);
      RS.toast(t('restart.done', { n: num(planDay(s)) }), { tone: 'success' });
      RS.refresh();
    });
  });

  /* ------------------------------------------------------------------ public hooks (CONTRACT §8) */
  function guard(fn, fallback) {
    return function () {
      try { return fn.apply(null, arguments); } catch (e) { console.error('[RS] prep hook failed', e); return fallback; }
    };
  }
  RS.prep = {
    // mode 'prep', settings.showPrep, or a programme started for the coming Ramadan (and Ramadan not yet begun)
    active: guard(function () {
      if (RS.appMode() === 'prep' || RS.settings.showPrep) return true;
      return isOn(state()) && !inRamadan();
    }, false),
    todayHeroHtml: guard(function () { return heroHtml('today'); }, ''),
    // Today tab (tracker.js composes it): the check-ins (once the programme runs, or in Sha'ban to invite it; v7's
    // showPrep alone means the planner card, which the tracker draws) and, once started, today's prompts and any
    // focus days to catch up on. The tracker shows its own intentions / dua list / make-up fasts card after these.
    todayCardsHtml: guard(function () {
      if (inRamadan()) return '';            // Ramadan has its own checklist; the plan is closed
      var s = state(), on = isOn(s);
      if (!on && RS.appMode() !== 'prep') return '';
      var h = [salahCard(s), quranCard(s)];
      if (!on) return h.join('');
      var n = planDay(s), day = dayByN(n), r = round(s);
      if (!days().length) h.push(RS.ui.card({ body: RS.ui.empty({ icon: 'sprout', title: t('empty.title'), body: t('empty.body') }) }));
      else if (waiting(s)) h.push(RS.ui.card({ kicker: { icon: 'calendar-days', text: t('kicker') }, title: t('wait.title', { total: num(totalDays()) }), cls: 'prep-wait', body: '<p>' + esc(paceText(s)) + '</p>' }));
      else if (day) {
        h.push(promptsCard(s, day, {
          kicker: t('day.kicker', { n: num(n), total: num(totalDays()) }),
          title: RS.t('prep.day.' + n + '.theme'),
          after: '<div class="mt-3">' + RS.ui.btn(t('today.openDay'), { act: 'nav.go', arg: 'prep/day?n=' + n, variant: 'secondary', block: true, icon: 'notebook-pen' }) + '</div>'
        }));
      }
      var cu = days().length ? catchUp(s, r) : [];
      if (cu.length) {
        h.push(RS.ui.card({ cls: 'is-tight prep-catch-today', body: RS.ui.list([RS.ui.row({
          icon: 'target', title: t('catch.title'), sub: tn('catch.days', cu.length, { day: num(cu[0].day.n) }),
          act: 'nav.go', arg: 'prep/day?n=' + cu[0].day.n, chevron: true
        })]) }));
      }
      return h.join('');
    }, ''),
    readiness: guard(function () { return readiness(); }, 0),
    daysUntilRamadan: guard(daysUntilRamadan, null),
    // extra read-only helpers for other modules (optional)
    planDay: guard(function () { return planDay(state()); }, 1),
    started: guard(function () { return isOn(state()); }, false)
  };
  // CONTRACT §3 lists the Today hooks as renderTodayHero()/renderTodayCards(); both names return the same HTML.
  RS.prep.renderTodayHero = RS.prep.todayHeroHtml;
  RS.prep.renderTodayCards = RS.prep.todayCardsHtml;

  // Reflections stored as plain text by earlier builds become {t, ts: 0} in storage before cloud sync reads it (the
  // sync compares timestamps, and a bare string would always win over an edit made on another device). Written
  // without a 'data' event: nothing the person sees changes.
  function migrateReflections() {
    var raw = obj(RS.store.get(KEY, null)), m = obj(raw.reflections), moved = false;
    Object.keys(m).forEach(function (k) { if (typeof m[k] === 'string') { m[k] = reflOf(m[k]); moved = true; } });
    if (moved) { raw.reflections = m; RS.store.set(KEY, raw); }
    return moved;
  }
  // Keeps each stored salah array in step with its per-prayer ticks. A sync merge takes the array from one device
  // and the newest tick of every prayer from both (pray), so the array can lag behind until it is rebuilt here.
  function repairCheckins() {
    var raw = obj(RS.store.get(KEY, null)), ci = obj(raw.checkins), fixed = false;
    Object.keys(ci).forEach(function (k) {
      var c = ci[k];
      if (!c || typeof c !== 'object' || !Object.keys(obj(c.pray)).length) return;
      var want = salahOf({ checkins: ci }, k);
      if (!Array.isArray(c.salah) || c.salah.length !== 5 || c.salah.some(function (v, i) { return v !== want[i]; })) { c.salah = want; fixed = true; }
    });
    if (fixed) { raw.checkins = ci; RS.store.set(KEY, raw); }
    return fixed;
  }

  RS.on('boot', function () {
    try {
      migrateReflections();
      repairCheckins();
      migratePages();
      var s = state();
      if (s.autoShow && isStale(s) && autoHide(s)) save(s);    // the Ramadan this prep was for has ended
    } catch (e) { console.error('[RS] prep boot step failed', e); }
    // After a sync: plain-text reflections from an older build become {t, ts}, and salah arrays are rebuilt from the
    // merged per-prayer ticks. A rebuilt array is sent back once (a 'data' event), so the cloud copy matches too.
    RS.on('sync', function () {
      try {
        migrateReflections();
        if (repairCheckins()) RS.emit('data', { source: 'prep' });
      } catch (e) { console.error('[RS] prep sync step failed', e); }
    });
    // Cloud feature flags arrive after boot: re-render the prep home once they are known (the reminder row),
    // unless someone is typing.
    if (RS.cloud && RS.cloud.ready && typeof RS.cloud.ready.then === 'function') {
      RS.cloud.ready.then(function () {
        if (!(RS.cloud.feat && RS.cloud.feat.push) || !pushSupported()) return;
        var c = RS.router.current(), a = document.activeElement, view = document.getElementById('view');
        if (!c || c.route !== 'prep') return;
        if (a && view && view.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
        RS.refresh();
      }, function () {});
    }
  });
})();
