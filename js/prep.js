/* =====================================================================================================
   Ramadan Strivers v8 — prep.js (prep module): the Ramadan Prep programme.
   A readiness check (one question per screen), a 30-day plan of three small prompts a day with a reflection,
   daily SALAH and QURAN check-ins, week milestones, a readiness score, a completion moment on day 30, and the
   v7 "Prepare for Ramadan" planner (three intentions, dua list, make-up fasts) kept in its v7 storage format.

   Routes   prep (intro until started, then the prep home) · prep/assess?q= · prep/result · prep/day?n= · prep/plan
   Hooks    RS.prep.active() · todayHeroHtml() · todayCardsHtml() · readiness() · daysUntilRamadan()   (CONTRACT §8)
   Storage  rs-prep  {v, started (ms), hy (Hijri year of the Ramadan prepared for), startDay, answers {qid: option},
                      assessment {qid: score}, assessedAt, done {promptId: ms}, reflections {n: text},
                      checkins {'YYYY-MM-DD': {salah: [bool x5], quran: {pages, minutes}}}, qunit, completedAt, past}
            rs-extras goals {g1..g3: {t, ts}} · duas {t, ts} · qada {owed, done, ts}   (v7 format; read-modify-write of
                      these three sections only — the tracker module keeps its journal in the same object)
   Text     UI strings: prep.ui.* (i18n-src/en/prep.json). Programme text: prep.* content keys (CONTRACT §4).
   Every persisted change emits RS.emit('data', {source: 'prep'}).
   ===================================================================================================== */
(function () {
  'use strict';
  var RS = window.RS;
  if (!RS || !RS.router) return;

  var KEY = 'rs-prep';
  var EXTRAS = 'rs-extras';
  var PRAYERS = [
    { id: 'fajr', icon: 'sunrise' }, { id: 'dhuhr', icon: 'sun' }, { id: 'asr', icon: 'sun' },
    { id: 'maghrib', icon: 'sunset' }, { id: 'isha', icon: 'moon' }
  ];
  // Quran check-in: a gentle daily target that grows week by week toward 20 pages (about 40 minutes) a day.
  var Q_UNITS = ['pages', 'minutes'];
  var Q_TARGET = { pages: [2, 5, 10, 15, 20], minutes: [5, 10, 20, 30, 40] };
  var Q_STEP = { pages: 1, minutes: 5 };
  var Q_MAX = { pages: 604, minutes: 1440 };
  // The generated content has no track on assessment questions (CONTRACT §4). A `track` on a question wins;
  // otherwise these ids map to tracks; other questions count toward the score but not toward a focus area.
  var Q_TRACK = { a1: 'salah', a2: 'salah', a3: 'quran', a4: 'quran', a5: 'fasting', a6: 'habits', a7: 'charity' };
  // Readiness smoothing: the baseline counts as this many prompts / one day of prayers, so the score starts at
  // the readiness-check result and then moves gradually with what the person actually does.
  var PRIOR_PROMPTS = 3;
  var PRIOR_PRAYERS = 5;
  var SALAH_WINDOW = 7;
  var TEXT_MAX = 2000;
  var GOAL_MAX = 120;

  var esc = RS.esc;
  function t(k, v) { return RS.t('prep.ui.' + k, v); }
  function tn(k, n, v) { return RS.tn('prep.ui.' + k, n, v); }
  function num(n) { return RS.fmt.n(n, { maximumFractionDigits: 0 }); }
  function frac(a, b) { return num(a) + '/' + num(b); }
  function obj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
  function safeId(s) { return String(s).replace(/[^A-Za-z0-9_-]/g, '_'); }
  function ctext(key) { return RS.has(key) ? RS.t(key) : ''; }      // optional content text (no raw key on screen)

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
  function todayKey() { return RS.todayISO(); }

  // Days until 1 Ramadan, walking forward with RS.hijri (settings.hijriOff applies). 0 during Ramadan.
  var duCache = { k: null, v: null };
  function daysUntilRamadan() {
    var base = noon();
    var k = RS.todayISO(base) + '|' + (parseInt(RS.settings.hijriOff, 10) || 0);
    if (duCache.k === k) return duCache.v;
    var v = null;
    try {
      if (RS.hijri(base).month === 9) v = 0;
      else {
        for (var i = 1; i <= 400; i++) {
          var h = RS.hijri(addDays(base, i));
          if (h.month === 9) { v = i; break; }      // the first Ramadan date reached is 1 Ramadan
        }
      }
    } catch (e) { v = null; }
    duCache = { k: k, v: v };
    return v;
  }
  // The Hijri year of the Ramadan a date prepares for (the current one until it ends, then the next).
  function targetYear(d) { var h = RS.hijri(noon(d)); return h.month <= 9 ? h.year : h.year + 1; }

  /* ------------------------------------------------------------------ state */
  function state() {
    var s = RS.store.get(KEY, null);
    s = obj(s);
    s.answers = obj(s.answers);
    s.assessment = obj(s.assessment);
    s.done = obj(s.done);
    s.reflections = obj(s.reflections);
    s.checkins = obj(s.checkins);
    if (typeof s.started === 'string') s.started = Date.parse(s.started) || null;
    if (typeof s.started !== 'number' || !isFinite(s.started) || s.started <= 0) s.started = null;
    if (Q_UNITS.indexOf(s.qunit) < 0) s.qunit = 'pages';
    return s;
  }
  function save(s) {
    s.v = 1;
    RS.store.set(KEY, s);
    RS.emit('data', { source: 'prep' });
  }
  // A programme started for an earlier Ramadan is kept (in rs-prep.past once a new one starts) but no longer runs.
  function isStale(s) { return !!s.started && (s.hy || targetYear(s.started)) !== targetYear(); }
  function isOn(s) { return !!s.started && !isStale(s); }

  // Plan day. In Sha'ban the plan follows the Hijri date (day 30 is the eve of Ramadan, also when Sha'ban has 29 days);
  // otherwise it counts days since the start (cap 30). Someone who started before Sha'ban keeps their own count when it
  // is ahead of the Hijri day, so the plan never jumps backwards.
  function planDay(s) {
    var total = totalDays(), base = noon(), h = RS.hijri(base);
    if (h.month === 9) return total;
    var d = isOn(s) ? dayDiff(new Date(s.started), base) + 1 : 1;
    if (h.month === 8) d = Math.max(d, daysUntilRamadan() === 1 ? total : h.day);
    return RS.clamp(d, 1, total);
  }
  function startDay(s) { var n = parseInt(s.startDay, 10); return n >= 1 ? n : 1; }
  function canTick(s, n) { return isOn(s) && n <= planDay(s); }
  function isComplete(s) {
    if (!isOn(s)) return false;
    var last = dayByN(totalDays());
    var ps = prompts(last);
    return !!ps.length && ps.every(function (p) { return !!s.done[p.id]; });
  }
  function dayDone(s, day) { return prompts(day).filter(function (p) { return !!s.done[p.id]; }).length; }
  function doneCount(s) { return days().reduce(function (a, d) { return a + dayDone(s, d); }, 0); }

  /* ------------------------------------------------------------------ assessment + readiness */
  function answerIndex(s, q) {
    var k = parseInt(s.answers[q.id], 10);
    return k >= 0 && k < q.scores.length ? k : -1;
  }
  function scoreOf(s, q) {
    var k = answerIndex(s, q);
    if (k >= 0) return Number(q.scores[k]) || 0;
    var v = Number(s.assessment[q.id]);
    return isFinite(v) && s.assessment[q.id] != null ? v : null;
  }
  function qMax(q) { return Math.max.apply(null, q.scores.map(function (x) { return Number(x) || 0; })) || 1; }
  function answeredCount(s) { return questions().filter(function (q) { return scoreOf(s, q) != null; }).length; }
  function firstUnanswered(s) {
    var qs = questions();
    for (var i = 0; i < qs.length; i++) if (answerIndex(s, qs[i]) < 0) return i;
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
  function trackOfQuestion(q) {
    if (q.track && trackById(q.track)) return q.track;
    return Q_TRACK[q.id] && trackById(Q_TRACK[q.id]) ? Q_TRACK[q.id] : null;
  }
  function trackScores(s) {
    var acc = {};
    questions().forEach(function (q) {
      var tr = trackOfQuestion(q), v = scoreOf(s, q);
      if (!tr || v == null) return;
      acc[tr] = acc[tr] || { got: 0, max: 0 };
      acc[tr].got += v; acc[tr].max += qMax(q);
    });
    var out = {};
    Object.keys(acc).forEach(function (k) { out[k] = Math.round(100 * acc[k].got / acc[k].max); });
    return out;
  }
  // The two weakest tracks from the readiness check (ties keep the content order: salah and Quran come first).
  function focusTracks(s) {
    var sc = trackScores(s);
    return tracks().map(function (tr, i) { return { id: tr.id, i: i, pct: sc[tr.id] }; })
      .filter(function (x) { return x.pct != null; })
      .sort(function (a, b) { return a.pct - b.pct || a.i - b.i; })
      .slice(0, 2).map(function (x) { return x.id; });
  }
  // Prompts due so far: the days from the start day up to yesterday, plus anything already ticked (today, catch-up).
  function promptStats(s) {
    var cur = planDay(s), from = startDay(s), due = 0, done = 0;
    days().forEach(function (d) {
      prompts(d).forEach(function (p) {
        var isDone = !!s.done[p.id];
        if (d.n < cur && d.n >= from) { due += 1; if (isDone) done += 1; }
        else if (isDone) { due += 1; done += 1; }
      });
    });
    return { due: due, done: done };
  }
  // Salah check-ins over the last 7 days of the programme (days with a check-in only).
  function salahStats(s) {
    var base = noon(), on = 0, of = 0;
    for (var i = 0; i < SALAH_WINDOW; i++) {
      var d = addDays(base, -i);
      if (s.started && dayDiff(new Date(s.started), d) < 0) break;
      var c = s.checkins[RS.todayISO(d)];
      if (c && Array.isArray(c.salah)) {
        of += 5;
        on += c.salah.slice(0, 5).filter(Boolean).length;
      }
    }
    return { on: on, of: of };
  }
  // readiness = 40% readiness check + 40% prompts done so far + 20% recent salah check-ins (0..100).
  function readiness(s) {
    s = s || state();
    var A = assessPct(s);
    if (!isOn(s)) return A == null ? 0 : A;
    var base = A == null ? 50 : A;
    var p = promptStats(s), q = salahStats(s);
    var P = 100 * (p.done + PRIOR_PROMPTS * base / 100) / (p.due + PRIOR_PROMPTS);
    var S = 100 * (q.on + PRIOR_PRAYERS * base / 100) / (q.of + PRIOR_PRAYERS);
    var r = A == null ? (2 * P + S) / 3 : 0.4 * A + 0.4 * P + 0.2 * S;
    return Math.round(RS.clamp(r, 0, 100));
  }

  /* ------------------------------------------------------------------ check-ins */
  function checkin(s, key) {
    var c = obj(s.checkins[key || todayKey()]);
    var salah = Array.isArray(c.salah) ? c.salah.slice(0, 5) : [];
    while (salah.length < 5) salah.push(false);
    c.salah = salah.map(Boolean);
    c.quran = obj(c.quran);
    return c;
  }
  function salahToday(s) { return checkin(s).salah.filter(Boolean).length; }
  function quranOn(s, key, unit) { var v = Number(checkin(s, key).quran[unit]); return isFinite(v) && v > 0 ? v : 0; }
  function quranTarget(n, unit) {
    var i = n <= 7 ? 0 : n <= 14 ? 1 : n <= 21 ? 2 : n <= 25 ? 3 : 4;
    return Q_TARGET[unit][i];
  }
  function lastDays(count) {
    var base = noon(), out = [];
    for (var i = count - 1; i >= 0; i--) out.push(addDays(base, -i));
    return out;
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
    return left > 0 ? tn('qada.left', left) : t('qada.clear');
  }

  /* ------------------------------------------------------------------ deferred text saves */
  var pending = {};
  function later(key, fn, ms) {
    if (pending[key]) clearTimeout(pending[key].timer);
    pending[key] = { fn: fn, timer: setTimeout(function () { var p = pending[key]; delete pending[key]; if (p) p.fn(); }, ms || 450) };
  }
  function flush() {
    Object.keys(pending).forEach(function (k) { var p = pending[k]; clearTimeout(p.timer); delete pending[k]; p.fn(); });
  }
  function status(id, text) { var el = document.getElementById(id); if (el && el.textContent !== text) el.textContent = text; }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);

  /* ------------------------------------------------------------------ shared pieces */
  var openTips = {};
  var celebrate = false;

  function tag(text, cls) { return '<span class="prep-tag' + (cls ? ' ' + cls : '') + '">' + esc(text) + '</span>'; }
  function trackTags(trackId, focus) {
    var out = '';
    if (trackId && trackById(trackId)) out += tag(trackName(trackId));
    if (trackId && focus.indexOf(trackId) >= 0) out += tag(t('focus'), 'is-focus');
    return out;
  }
  function promptRows(s, day, locked) {
    var focus = focusTracks(s);
    return prompts(day).map(function (p) {
      var tipKey = 'prep.p.' + p.id + '.tip';
      var tip = ctext(tipKey);
      var tipId = 'prep-tip-' + safeId(p.id);
      var open = !!openTips[p.id];
      var extra = '<span class="prep-tags">' + trackTags(p.track, focus) + '</span>' + (tip ?
        '<button type="button" class="link-btn prep-tip-btn" data-act="prep.tip" data-arg="' + esc(p.id) + '" aria-expanded="' + open + '" aria-controls="' + tipId + '">' +
        esc(t('tip')) + RS.icon('chevron-down', { size: 16 }) + '</button><p class="prep-tip" id="' + tipId + '"' + (open ? '' : ' hidden') + '>' + esc(tip) + '</p>' : '');
      return RS.ui.row({ check: { on: !!s.done[p.id], act: 'prep.done', arg: p.id }, title: RS.t('prep.p.' + p.id + '.text'), disabled: locked, cls: 'prep-prompt', extra: extra });
    });
  }
  function promptsCard(s, day, o) {
    o = o || {};
    var n = day.n, cur = planDay(s), locked = !canTick(s, n);
    var note = '';
    if (!isOn(s)) note = RS.ui.note(t('day.notStarted'), { icon: 'lock', tone: 'plain' });
    else if (n > cur) note = RS.ui.note(tn('day.opensIn', n - cur, { day: n }), { icon: 'lock', tone: 'plain' });
    return RS.ui.card({
      kicker: { icon: 'list-checks', text: o.kicker || t('day.steps') },
      title: o.title || null,
      action: o.action || null,
      cls: 'prep-prompts',
      body: (prompts(day).length ? RS.ui.list(promptRows(s, day, locked), { label: t('day.steps') }) : RS.ui.empty({ icon: 'sprout', title: t('empty.dayTitle'), body: t('empty.dayBody') })) +
        (note ? '<div class="mt-3">' + note + '</div>' : '') + (o.after || '')
    });
  }

  function salahCard(s) {
    var c = checkin(s);
    var count = c.salah.filter(Boolean).length;
    var grid = '<div class="prep-salah" role="group" aria-labelledby="prep-salah-title">' + PRAYERS.map(function (p, i) {
      var on = !!c.salah[i];
      return '<button type="button" class="prep-pray' + (on ? ' is-on' : '') + '" role="checkbox" aria-checked="' + on + '" data-act="prep.salah" data-arg="' + i + '">' +
        '<span class="prep-pray-dot" aria-hidden="true">' + RS.icon(on ? 'check' : p.icon, { size: on ? 20 : 19 }) + '</span>' +
        '<span class="prep-pray-name">' + esc(t('salah.' + p.id)) + '</span></button>';
    }).join('') + '</div>';
    var week = lastDays(7);
    var vals = week.map(function (d) { var k = RS.todayISO(d); var x = s.checkins[k]; return x && Array.isArray(x.salah) ? x.salah.slice(0, 5).filter(Boolean).length : 0; });
    var weekOn = vals.reduce(function (a, b) { return a + b; }, 0);
    var chart = '<div class="prep-week"><div class="spread small"><span class="muted">' + esc(t('salah.week')) + '</span><span class="strong">' +
      esc(t('salah.weekCount', { n: num(weekOn), total: num(35) })) + '</span></div>' +
      RS.ui.bars(vals, { max: 5, highlight: 6, height: 40, labels: week.map(function (d) { return RS.fmt.date(d, { weekday: 'narrow' }); }),
        label: t('salah.chartLabel', { n: num(weekOn), total: num(35) }) }) + '</div>';
    return RS.ui.card({
      kicker: { icon: 'clock', text: t('salah.kicker') },
      title: t('salah.title'), titleId: 'prep-salah-title',
      cls: 'prep-salah-card',
      body: grid + '<p class="prep-status' + (count === 5 ? ' accent' : '') + '" aria-live="polite">' + esc(count === 5 ? t('salah.all') : t('salah.count', { n: num(count), total: num(5) })) + '</p>' + chart
    });
  }

  function quranCard(s) {
    var unit = s.qunit, n = planDay(s), key = todayKey();
    var v = quranOn(s, key, unit), target = quranTarget(n, unit), step = Q_STEP[unit];
    var unitKey = unit === 'minutes' ? 'quran.minutes' : 'quran.pages';
    var pct = Math.min(100, Math.round(100 * v / target));
    var left = Math.max(0, target - v);
    var stepBtn = function (sign, icon, label, disabled) {
      return '<button type="button" class="prep-step" data-act="prep.q" data-arg="' + sign + '" aria-label="' + esc(label) + '"' + (disabled ? ' disabled' : '') + '>' + RS.icon(icon, { size: 22 }) + '</button>';
    };
    var week = lastDays(7);
    var vals = week.map(function (d) { return quranOn(s, RS.todayISO(d), unit); });
    var body = '<div class="prep-qc">' +
      stepBtn('-', 'minus', tn(unit === 'minutes' ? 'quran.lessMinutes' : 'quran.lessPages', step), v <= 0) +
      '<p class="prep-qc-val" aria-live="polite"><span class="display">' + esc(num(v)) + '</span><span class="display-unit">' + esc(tn(unitKey, v)) + '</span></p>' +
      stepBtn('+', 'plus', tn(unit === 'minutes' ? 'quran.moreMinutes' : 'quran.morePages', step), v >= Q_MAX[unit]) + '</div>' +
      '<div class="stack-sm mt-3"><div class="spread small"><span class="muted">' + esc(tn(unit === 'minutes' ? 'quran.targetMinutes' : 'quran.targetPages', target)) + '</span>' +
      '<span class="strong' + (left ? '' : ' accent') + '">' + esc(left ? tn(unit === 'minutes' ? 'quran.leftMinutes' : 'quran.leftPages', left) : t('quran.reached')) + '</span></div>' +
      RS.ui.bar(pct, { label: t('quran.barLabel') }) + '</div>' +
      '<div class="prep-week">' + RS.ui.bars(vals, { max: Math.max(target, Math.max.apply(null, vals)), highlight: 6, height: 40,
        labels: week.map(function (d) { return RS.fmt.date(d, { weekday: 'narrow' }); }), label: t('quran.chartLabel') }) + '</div>' +
      '<div class="mt-3">' + RS.ui.seg([{ value: 'pages', text: t('quran.unitPages') }, { value: 'minutes', text: t('quran.unitMinutes') }], unit, { act: 'prep.qunit', label: t('quran.unitLabel') }) + '</div>' +
      '<p class="caption mt-3">' + esc(t(unit === 'minutes' ? 'quran.growMinutes' : 'quran.growPages')) + '</p>';
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

  /* ------------------------------------------------------------------ hero (prep home and Today) */
  function heroHtml(where) {
    var s = state(), total = totalDays(), n = planDay(s), du = daysUntilRamadan(), h = RS.hijri();
    var on = isOn(s), kick = { icon: 'sprout', text: t('kicker') };
    var big = du != null && du > 0 ? { number: num(du), label: tn('daysUntil', du) } : { number: num(n), unit: '/' + num(total), label: t('planDayLabel') };
    var cls = 'prep-hero' + (celebrate ? ' prep-celebrate' : '');
    if (h.month === 9 || du === 0) {
      return RS.ui.hero({
        cls: cls, kicker: kick, text: t('begun.body'),
        number: num(h.day), label: t('begun.label', { month: RS.hijriMonth(9) }),
        metrics: on ? [{ label: t('m.prompts'), value: frac(doneCount(s), allPromptCount()) }, { label: t('m.readiness'), value: RS.fmt.pct(readiness(s)) }] : null,
        cta: where === 'today' ? null : { eyebrow: t('begun.eyebrow'), text: t('begun.cta'), act: 'nav.go', arg: 'today' }
      });
    }
    if (!on) {
      var partial = answeredCount(s) > 0 && firstUnanswered(s) >= 0;
      return RS.ui.hero({
        cls: cls, kicker: kick, number: big.number, unit: big.unit, label: big.label, text: t('invite'),
        metrics: [{ label: t('m.plan'), value: tn('m.days', total) }, { label: t('m.daily'), value: tn('m.steps', 3) }],
        cta: { eyebrow: partial ? t('cta.continueEyebrow') : t('cta.startEyebrow'), text: partial ? t('cta.continue') : t('cta.start'), act: 'prep.start' }
      });
    }
    var r = readiness(s), done = isComplete(s), day = dayByN(n);
    var cta;
    if (!days().length) cta = where === 'today' ? { eyebrow: t('kicker'), text: t('cta.home'), act: 'nav.go', arg: 'prep' } : null;
    else if (done) cta = { eyebrow: t('complete.eyebrow'), text: t('complete.cta'), act: 'nav.go', arg: 'prep/day?n=' + total };
    else cta = { eyebrow: t('cta.dayEyebrow', { n: num(n), total: num(total) }), text: t('cta.today', { theme: day ? RS.t('prep.day.' + n + '.theme') : '' }), act: 'nav.go', arg: 'prep/day?n=' + n };
    return RS.ui.hero({
      cls: cls + (done ? ' is-complete' : ''),
      kicker: done ? { icon: 'badge-check', text: t('complete.kicker') } : kick,
      number: big.number, unit: big.unit, label: big.label,
      ring: { pct: r, text: RS.fmt.pct(r), sub: t('ring.sub'), label: t('ring.label', { pct: RS.fmt.pct(r) }) },
      metrics: [
        { label: t('m.day'), value: frac(n, total) },
        { label: t('m.prompts'), value: frac(doneCount(s), allPromptCount()) },
        { label: t('m.salah'), value: frac(salahToday(s), 5) }
      ],
      cta: cta
    });
  }

  /* ------------------------------------------------------------------ prep home */
  function milestoneCard(s, n) {
    var w = weekOf(n), m = milestone(w), r = weekRange(w), got = 0, all = 0;
    days().forEach(function (d) { if (d.n >= r.from && d.n <= r.to) { all += prompts(d).length; got += dayDone(s, d); } });
    var title = m ? ctext('prep.ms.' + w + '.title') : '';
    var goal = m ? ctext('prep.ms.' + w + '.goal') : '';
    return RS.ui.card({
      kicker: { icon: 'mountain', text: t('ms.kicker', { n: num(w) }) },
      title: title || t('ms.fallback', { n: num(w) }),
      cls: 'prep-ms',
      body: (goal ? '<p>' + esc(goal) + '</p>' : '') +
        '<div class="stack-sm mt-3"><div class="spread small"><span class="muted">' + esc(t('ms.days', { from: num(r.from), to: num(r.to) })) + '</span>' +
        '<span class="strong">' + esc(t('ms.progress', { n: num(got), total: num(all) })) + '</span></div>' +
        RS.ui.bar(all ? 100 * got / all : 0, { label: t('ms.barLabel', { n: num(w) }) }) + '</div>'
    });
  }

  function dayRow(s, d, cur) {
    var ps = prompts(d), got = dayDone(s, d), all = ps.length;
    var isToday = d.n === cur, future = d.n > cur, full = all && got === all;
    var lead = '<span class="prep-dn' + (full ? ' is-done' : '') + (isToday ? ' is-today' : '') + (future ? ' is-future' : '') + '" aria-hidden="true">' +
      (full ? RS.icon('check', { size: 16 }) : esc(num(d.n))) + '</span>';
    var sub = [d.track && trackById(d.track) ? trackName(d.track) : '', isToday ? t('list.today') : ''].filter(Boolean).join(' · ');
    return RS.ui.row({
      lead: lead,
      titleHtml: '<span class="sr-only">' + esc(t('list.day', { n: num(d.n) })) + ' </span>' + esc(RS.t('prep.day.' + d.n + '.theme')),
      sub: sub,
      trail: '<span class="row-val" aria-hidden="true">' + esc(frac(got, all)) + '</span><span class="sr-only">' + esc(t('list.doneOf', { n: num(got), total: num(all) })) + '</span>',
      act: 'nav.go', arg: 'prep/day?n=' + d.n,
      cls: 'prep-day' + (isToday ? ' is-today' : '') + (future ? ' is-future' : ''),
      attrs: isToday ? { 'aria-current': 'date' } : null
    });
  }
  function daysCard(s, cur) {
    var blocks = [];
    for (var w = 1; w <= weekCount(); w++) {
      var r = weekRange(w);
      var list = days().filter(function (d) { return d.n >= r.from && d.n <= r.to; });
      if (!list.length) continue;
      var title = ctext('prep.ms.' + w + '.title');
      var hid = 'prep-wk-' + w;
      blocks.push('<h3 class="prep-wk" id="' + hid + '"><span>' + esc(t('list.week', { n: num(w) })) + '</span>' + (title ? '<span class="prep-wk-t">' + esc(title) + '</span>' : '') + '</h3>' +
        '<ul class="list" aria-labelledby="' + hid + '">' + list.map(function (d) { return '<li class="li">' + dayRow(s, d, cur) + '</li>'; }).join('') + '</ul>');
    }
    return RS.ui.card({ kicker: { icon: 'calendar-days', text: t('list.kicker') }, title: tn('list.title', totalDays()), cls: 'prep-days', body: blocks.join('') });
  }

  function tracksCard(s) {
    var focus = focusTracks(s);
    var rows = tracks().map(function (tr) {
      var all = 0, got = 0;
      days().forEach(function (d) { prompts(d).forEach(function (p) { if (p.track === tr.id) { all += 1; if (s.done[p.id]) got += 1; } }); });
      var pct = all ? Math.round(100 * got / all) : 0;
      return RS.ui.row({
        icon: tr.icon,
        titleHtml: esc(trackName(tr.id)) + (focus.indexOf(tr.id) >= 0 ? ' ' + tag(t('focus'), 'is-focus') : ''),
        sub: tn('tracks.sub', all, { done: num(got) }),
        value: RS.fmt.pct(pct),
        extra: RS.ui.bar(pct),
        cls: 'prep-track'
      });
    });
    if (!rows.length) return '';
    return RS.ui.card({ kicker: { icon: 'compass', text: t('tracks.kicker') }, title: t('tracks.title'), body: RS.ui.list(rows), cls: 'prep-tracks' });
  }

  function completeCard(s) {
    var refl = Object.keys(s.reflections).filter(function (k) { return String(s.reflections[k] || '').trim(); }).length;
    return RS.ui.card({
      cls: 'prep-complete',
      body: '<div class="prep-complete-in"><span class="prep-complete-ic" aria-hidden="true">' + RS.icon('badge-check', { size: 26 }) + '</span>' +
        '<div class="stack-sm"><h2 class="card-title">' + esc(t('complete.title')) + '</h2><p>' + esc(t('complete.body')) + '</p></div></div>' +
        '<div class="mt-4">' + RS.ui.metrics([
          { label: t('m.prompts'), value: frac(doneCount(s), allPromptCount()) },
          { label: t('m.reflections'), value: num(refl) },
          { label: t('m.readiness'), value: RS.fmt.pct(readiness(s)) }
        ]) + '</div>'
    });
  }

  function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function settingsCard() {
    var rows = [];
    if (RS.cloud && RS.cloud.feat && RS.cloud.feat.push && pushSupported()) {
      rows.push(RS.ui.row({ icon: 'bell', title: t('settings.reminder'), sub: t('settings.reminderSub'), toggle: { on: !!RS.store.raw('rs-push'), act: 'push.toggle' } }));
    }
    if (questions().length) rows.push(RS.ui.row({ icon: 'list-checks', title: t('settings.retake'), sub: t('settings.retakeSub'), act: 'prep.retake', chevron: true }));
    rows.push(RS.ui.row({ icon: 'rotate-ccw', title: t('settings.restart'), sub: t('settings.restartSub'), act: 'prep.restart', cls: 'prep-danger' }));
    return RS.ui.card({
      kicker: { icon: 'settings', text: t('settings.kicker') },
      body: RS.ui.list(rows) + '<p class="caption mt-3">' + esc(t('settings.how')) + '</p>'
    });
  }

  function homeView(view, s) {
    var n = planDay(s), h = [];
    h.push(heroHtml('home'));
    if (isComplete(s)) h.push(completeCard(s));
    h.push(salahCard(s));
    h.push(quranCard(s));
    if (days().length) {
      if (milestones().length) h.push(milestoneCard(s, n));
      h.push(daysCard(s, n));
    } else {
      h.push(RS.ui.card({ body: RS.ui.empty({ icon: 'sprout', title: t('empty.title'), body: t('empty.body') }) }));
    }
    h.push(tracksCard(s));
    h.push(RS.ui.card({ kicker: { icon: 'target', text: t('plan.kicker') }, title: t('plan.cardTitle'), body: RS.ui.list(planRows()) }));
    h.push(settingsCard());
    view.innerHTML = h.join('');
    celebrate = false;
  }

  /* ------------------------------------------------------------------ intro (not started) */
  function introView(view, s) {
    var h = [];
    var nq = questions().length;
    h.push(heroHtml('home'));
    if (isStale(s)) h.push(RS.ui.note(t('intro.stale'), { icon: 'rotate-ccw', tone: 'plain' }));
    h.push(RS.ui.card({
      kicker: { icon: 'sprout', text: t('intro.kicker') },
      title: ctext('prep.intro.title') || t('title'),
      body: ctext('prep.intro.body') ? '<p>' + esc(RS.t('prep.intro.body')) + '</p>' : ''
    }));
    h.push(RS.ui.card({
      kicker: { icon: 'route', text: t('how.kicker') },
      body: RS.ui.list([
        nq ? RS.ui.row({ icon: 'list-checks', title: t('how.check'), sub: tn('how.checkSub', nq) }) : '',
        RS.ui.row({ icon: 'calendar-days', title: t('how.daily'), sub: t('how.dailySub') }),
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
    h.push(RS.ui.card({ kicker: { icon: 'target', text: t('plan.kicker') }, title: t('plan.cardTitle'), body: RS.ui.list(planRows()) }));
    var partial = answeredCount(s) > 0 && firstUnanswered(s) >= 0;
    h.push(RS.ui.btn(partial ? t('cta.continue') : t('cta.start'), { act: 'prep.start', block: true, icon: 'arrow-right', cls: 'prep-start' }));
    view.innerHTML = h.join('');
  }

  /* ------------------------------------------------------------------ assessment */
  function assessView(view, params) {
    var s = state(), qs = questions();
    if (!qs.length) {
      view.innerHTML = RS.ui.hero({ kicker: { icon: 'list-checks', text: t('assess.title') }, text: t('assess.none'), cta: { text: t('cta.home'), act: 'nav.go', arg: 'prep' } });
      return;
    }
    var i = parseInt(params.q, 10);
    if (!(i >= 0 && i < qs.length)) { i = firstUnanswered(s); if (i < 0) i = 0; }
    var q = qs[i], sel = answerIndex(s, q), last = i === qs.length - 1;
    RS.topbar({ title: t('assess.title'), sub: t('assess.progress', { n: num(i + 1), total: num(qs.length) }), back: 'prep' });
    var hero = RS.ui.hero({
      kicker: { icon: 'list-checks', text: t('assess.kicker') },
      cls: 'prep-q-hero',
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
    var card = RS.ui.card({
      cls: 'prep-opts-card',
      body: '<fieldset class="prep-opts" data-act-change="prep.answer" data-arg="' + i + '"><legend class="sr-only">' + esc(RS.t('prep.a.' + q.id + '.q')) + '</legend>' +
        '<ul class="list">' + opts + '</ul></fieldset>'
    });
    var nav = '<div class="btn-row prep-q-nav">' +
      (i > 0 ? RS.ui.btn(t('assess.back'), { act: 'prep.qnav', arg: 'back', variant: 'secondary', icon: 'arrow-left' }) : '') +
      RS.ui.btn(last ? t('assess.finish') : t('assess.next'), { act: 'prep.qnav', arg: 'next', disabled: sel < 0, id: 'prep-next' }) + '</div>' +
      '<p class="caption t-center">' + esc(t('assess.hint')) + '</p>';
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
    var focus = focusTracks(s), sc = trackScores(s), n = planDay(s), total = totalDays(), day = dayByN(n);
    var metrics = focus.map(function (id) { return { label: t('result.focusLabel'), value: trackName(id) }; });
    metrics.push({ label: t('result.startLabel'), value: t('result.startValue', { n: num(n) }) });
    var h = [];
    h.push(RS.ui.hero({
      kicker: { icon: 'list-checks', text: t('assess.kicker') },
      number: num(A), unit: '%', label: t('result.label'),
      ring: { pct: A, label: t('ring.label', { pct: RS.fmt.pct(A) }) },
      metrics: metrics,
      cta: day ? { eyebrow: t('result.ctaEyebrow'), text: t('cta.today', { theme: RS.t('prep.day.' + n + '.theme') }), act: 'prep.begin', arg: n } :
        { eyebrow: t('kicker'), text: t('cta.home'), act: 'prep.begin', arg: 0 }
    }));
    if (focus.length) {
      h.push(RS.ui.card({
        kicker: { icon: 'target', text: t('result.focusKicker') },
        title: t('result.focusTitle'),
        body: RS.ui.list(focus.map(function (id) {
          var tr = trackById(id);
          return RS.ui.row({ icon: tr.icon, title: trackName(id), sub: ctext('prep.track.' + id + '.desc'), value: RS.fmt.pct(sc[id]) });
        })) + '<p class="caption mt-3">' + esc(t('result.focusBody')) + '</p>'
      }));
    }
    var scored = tracks().filter(function (tr) { return sc[tr.id] != null; });
    if (scored.length) {
      h.push(RS.ui.card({
        kicker: { icon: 'compass', text: t('result.areasKicker') },
        body: RS.ui.list(scored.map(function (tr) {
          return RS.ui.row({ icon: tr.icon, title: trackName(tr.id), value: RS.fmt.pct(sc[tr.id]), extra: RS.ui.bar(sc[tr.id]), cls: 'prep-track' });
        }))
      }));
    }
    if (milestones().length) {
      h.push(RS.ui.card({
        kicker: { icon: 'calendar-days', text: t('result.planKicker') },
        title: tn('result.planTitle', total),
        body: RS.ui.list(milestones().map(function (m) {
          var r = weekRange(m.week);
          return RS.ui.row({ lead: '<span class="prep-dn" aria-hidden="true">' + esc(num(m.week)) + '</span>', title: ctext('prep.ms.' + m.week + '.title') || t('ms.fallback', { n: num(m.week) }),
            sub: t('ms.days', { from: num(r.from), to: num(r.to) }) });
        }))
      }));
    }
    h.push('<div class="btn-row">' + RS.ui.btn(t('result.home'), { act: 'prep.begin', arg: 0, variant: 'secondary', block: true }) + '</div>');
    view.innerHTML = h.join('');
  }

  /* ------------------------------------------------------------------ day */
  function dayView(view, params) {
    var s = state(), total = totalDays();
    var n = RS.clamp(parseInt(params.n, 10) || planDay(s), 1, total);
    var day = dayByN(n), cur = planDay(s);
    RS.topbar({ title: t('day.title', { n: num(n) }), sub: t('title'), back: 'prep' });
    var stepper = RS.ui.stepper({
      title: t('day.title', { n: num(n) }),
      sub: n === cur && isOn(s) ? t('list.today') : t('day.of', { total: num(total) }),
      prev: { act: 'prep.dayStep', arg: '-1', label: t('day.prev'), disabled: n <= 1 },
      next: { act: 'prep.dayStep', arg: '+1', label: t('day.next'), disabled: n >= total }
    });
    if (!day) {
      view.innerHTML = stepper + RS.ui.hero({ kicker: { icon: 'sprout', text: t('kicker') }, text: t('empty.body'), cta: { text: t('cta.home'), act: 'nav.go', arg: 'prep' } });
      return;
    }
    var got = dayDone(s, day), all = prompts(day).length, track = day.track && trackById(day.track);
    var refl = String(s.reflections[n] || '');
    var kickText = t('day.kicker', { n: num(n), total: num(total) }) + (track ? ' · ' + trackName(day.track) : '');
    var h = [stepper];
    h.push(RS.ui.hero({
      cls: 'prep-day-hero' + (celebrate ? ' prep-celebrate' : ''),
      kicker: { icon: track ? track.icon : 'sprout', text: kickText },
      number: num(got), unit: '/' + num(all), label: RS.t('prep.day.' + n + '.theme'),
      ring: { pct: all ? 100 * got / all : 0, text: frac(got, all), sub: t('ring.done'), label: t('day.ringLabel', { n: num(got), total: num(all) }) },
      metrics: [
        { label: t('m.week'), value: num(weekOf(n)) },
        { label: t('m.area'), value: track ? trackName(day.track) : '–' },
        { label: t('m.reflection'), value: refl.trim() ? t('day.written') : t('day.notYet') }
      ]
    }));
    if (n === total && isComplete(s)) h.push(completeCard(s));
    h.push(promptsCard(s, day, { kicker: n === cur && isOn(s) ? t('day.stepsToday') : t('day.steps') }));
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
    h.push('<div class="btn-row prep-day-nav">' +
      (n > 1 ? RS.ui.btn(t('day.title', { n: num(n - 1) }), { act: 'prep.dayStep', arg: 'prev', variant: 'secondary', icon: 'arrow-left', label: t('day.prev') }) : '') +
      (n < total ? RS.ui.btn(t('day.title', { n: num(n + 1) }), { act: 'prep.dayStep', arg: 'next', variant: 'secondary', icon: 'arrow-right', cls: 'prep-next', label: t('day.next') }) : '') + '</div>');
    view.innerHTML = h.join('');
    celebrate = false;
  }

  /* ------------------------------------------------------------------ plan (v7 intentions, dua list, make-up fasts) */
  function planView(view) {
    RS.topbar({ title: t('plan.title'), sub: t('title'), back: 'prep' });
    var g = goals(), q = qada(), dc = duaCount();
    var written = g.filter(function (x) { return x.trim(); }).length;
    var h = [];
    h.push(RS.ui.hero({
      kicker: { icon: 'target', text: t('plan.kicker') },
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
    var stepper = function (k, label, value) {
      var lid = 'prep-qada-' + k;
      return '<div class="spread prep-counter" role="group" aria-labelledby="' + lid + '"><span class="strong" id="' + lid + '">' + esc(label) + '</span>' +
        '<span class="prep-counter-ctl"><button type="button" class="prep-step" data-act="prep.qada" data-arg="' + k + ':-1" aria-label="' + esc(t('plan.less', { what: label })) + '"' + (value <= 0 ? ' disabled' : '') + '>' + RS.icon('minus', { size: 20 }) + '</button>' +
        '<span class="prep-counter-val" aria-live="polite">' + esc(num(value)) + '</span>' +
        '<button type="button" class="prep-step" data-act="prep.qada" data-arg="' + k + ':1" aria-label="' + esc(t('plan.more', { what: label })) + '"' + (value >= 60 ? ' disabled' : '') + '>' + RS.icon('plus', { size: 20 }) + '</button></span></div>';
    };
    h.push(RS.ui.card({
      kicker: { icon: 'calendar-check', text: t('plan.qada') },
      title: t('plan.qadaTitle'),
      body: '<div class="stack">' + stepper('owed', t('plan.owed'), q.owed) + stepper('done', t('plan.madeUp'), q.done) + '</div>' +
        '<p class="prep-status' + (q.owed && q.done >= q.owed ? ' accent' : '') + '">' + esc(qadaLine(q)) + '</p>'
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

  /* ------------------------------------------------------------------ actions */
  function startProgram(s) {
    s.started = Date.now();
    s.hy = targetYear();
    s.startDay = null;
    s.completedAt = null;
    s.startDay = planDay(s);
  }
  function archive(s) {
    if (!s.started) return;
    var past = obj(s.past);
    past[String(s.hy || targetYear(s.started))] = { started: s.started, startDay: s.startDay || 1, answers: s.answers, assessment: s.assessment,
      done: s.done, reflections: s.reflections, completedAt: s.completedAt || null };
    s.past = past;
    s.started = null; s.hy = null; s.startDay = null; s.completedAt = null; s.assessedAt = null;
    s.answers = {}; s.assessment = {}; s.done = {}; s.reflections = {};
  }

  RS.act('prep.start', function () {
    var s = state();
    if (isStale(s)) { archive(s); save(s); }
    if (!questions().length) {
      if (!isOn(s)) { startProgram(s); save(s); }
      RS.router.go('prep', null, { replace: RS.router.current().route === 'prep' });
      RS.refresh();
      return;
    }
    var i = firstUnanswered(s);
    RS.router.go('prep/assess', { q: i < 0 ? 0 : i });
  });
  RS.act('prep.retake', function () { RS.router.go('prep/assess', { q: 0 }); });

  RS.act('prep.answer', function (value, el) {
    var i = parseInt(el && el.getAttribute('data-arg'), 10), q = questions()[i];
    var k = parseInt(value, 10);
    if (!q || !(k >= 0 && k < q.scores.length)) return;
    var s = state();
    s.answers[q.id] = k;
    s.assessment[q.id] = Number(q.scores[k]) || 0;
    save(s);
    RS.buzz(6);
    RS.refresh();
  });
  RS.act('prep.qnav', function (dir) {
    var s = state(), qs = questions(), cur = RS.router.current();
    var i = RS.clamp(parseInt(cur.params && cur.params.q, 10) || 0, 0, Math.max(0, qs.length - 1));
    if (dir === 'back') { RS.router.go('prep/assess', { q: Math.max(0, i - 1) }, { replace: true }); return; }
    if (!qs[i] || answerIndex(s, qs[i]) < 0) return;
    if (i < qs.length - 1) { RS.router.go('prep/assess', { q: i + 1 }, { replace: true }); return; }
    var miss = firstUnanswered(s);
    if (miss >= 0) { RS.router.go('prep/assess', { q: miss }, { replace: true }); return; }
    s.assessedAt = Date.now();
    if (!isOn(s)) startProgram(s);
    save(s);
    RS.router.go('prep/result', null, { replace: true });
  });
  RS.act('prep.begin', function (n) {
    n = parseInt(n, 10);
    if (n >= 1) RS.router.go('prep/day', { n: n }, { replace: true });
    else RS.router.back('prep');
  });

  RS.act('prep.salah', function (i) {
    i = parseInt(i, 10);
    if (!(i >= 0 && i < 5)) return;
    var s = state(), key = todayKey(), c = checkin(s, key);
    c.salah[i] = !c.salah[i];
    s.checkins[key] = c;
    save(s);
    RS.buzz(8);
    if (c.salah[i] && c.salah.every(Boolean)) RS.toast(t('toast.allSalah'), { tone: 'success' });
    RS.refresh();
  });
  RS.act('prep.q', function (sign) {
    var s = state(), key = todayKey(), c = checkin(s, key), unit = s.qunit;
    var before = Number(c.quran[unit]) || 0;
    var v = RS.clamp(before + (sign === '-' ? -Q_STEP[unit] : Q_STEP[unit]), 0, Q_MAX[unit]);
    if (v === before) return;
    if (v) c.quran[unit] = v; else delete c.quran[unit];
    s.checkins[key] = c;
    save(s);
    RS.buzz(6);
    var target = quranTarget(planDay(s), unit);
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
    var s = state(), day = null, list = days();
    for (var i = 0; i < list.length && !day; i++) if (prompts(list[i]).some(function (p) { return p.id === id; })) day = list[i];
    if (!day) return;
    if (!canTick(s, day.n)) {
      RS.toast(isOn(s) ? tn('day.opensIn', day.n - planDay(s), { day: day.n }) : t('day.notStarted'));
      return;
    }
    var wasComplete = isComplete(s);
    if (s.done[id]) delete s.done[id]; else s.done[id] = Date.now();
    var nowDone = !!s.done[id];
    if (!wasComplete && isComplete(s) && !s.completedAt) {
      s.completedAt = Date.now();
      celebrate = true;
    }
    save(s);
    RS.buzz(nowDone ? 10 : 6);
    if (celebrate) RS.toast(t('toast.complete'), { tone: 'success', ms: 5000 });
    else if (nowDone && dayDone(s, day) === prompts(day).length) RS.toast(t('toast.dayDone', { n: num(day.n) }), { tone: 'success' });
    RS.refresh();
  });
  RS.act('prep.tip', function (id, el) {
    openTips[id] = !openTips[id];
    if (!el) return;
    el.setAttribute('aria-expanded', String(!!openTips[id]));
    var p = document.getElementById(el.getAttribute('aria-controls'));
    if (p) p.hidden = !openTips[id];
  });
  RS.act('prep.dayStep', function (d) {
    var cur = RS.router.current(), n = parseInt(cur.params && cur.params.n, 10) || planDay(state());
    var step = d === 'prev' || d === '-1' ? -1 : 1;
    var to = RS.clamp(n + step, 1, totalDays());
    if (to !== n) RS.router.go('prep/day', { n: to }, { replace: true });
  });

  RS.act('prep.reflect', function (value, el, e) {
    var n = parseInt(el && el.getAttribute('data-arg'), 10);
    if (!(n >= 1)) return;
    var text = String(value || '').slice(0, TEXT_MAX);
    var write = function () {
      var s = state();
      if (text.trim()) s.reflections[n] = text; else delete s.reflections[n];
      save(s);
      status('prep-refl-status', t('saved'));
    };
    if (e && e.type === 'change') { if (pending['refl' + n]) clearTimeout(pending['refl' + n].timer); delete pending['refl' + n]; write(); }
    else later('refl' + n, write);
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
    if (e && e.type === 'change') { if (pending['goal' + i]) clearTimeout(pending['goal' + i].timer); delete pending['goal' + i]; write(); }
    else later('goal' + i, write);
  });
  RS.act('prep.duas', function (value, el, e) {
    var text = String(value || '').slice(0, TEXT_MAX);
    var write = function () {
      setExtras('duas', { t: text, ts: Date.now() });
      status('prep-duas-status', t('saved'));
    };
    if (e && e.type === 'change') { if (pending.duas) clearTimeout(pending.duas.timer); delete pending.duas; write(); }
    else later('duas', write);
  });
  RS.act('prep.qada', function (arg) {
    var m = /^(owed|done):(-?1)$/.exec(arg || '');
    if (!m) return;
    var q = Object.assign({ owed: 0, done: 0 }, obj(extras().qada));
    q.owed = Math.max(0, parseInt(q.owed, 10) || 0);
    q.done = Math.max(0, parseInt(q.done, 10) || 0);
    q[m[1]] = RS.clamp(q[m[1]] + parseInt(m[2], 10), 0, 60);
    q.ts = Date.now();
    setExtras('qada', q);
    RS.buzz(6);
    RS.refresh();
  });

  RS.act('prep.restart', function () {
    RS.confirm({ title: t('restart.title'), body: t('restart.body'), ok: t('restart.ok'), danger: true }).then(function (ok) {
      if (!ok) return;
      var s = state();
      s.done = {};
      s.completedAt = null;
      startProgram(s);
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
      return isOn(state()) && RS.hijri().month !== 9;
    }, false),
    todayHeroHtml: guard(function () { return heroHtml('today'); }, ''),
    todayCardsHtml: guard(function () {
      var s = state(), h = [salahCard(s), quranCard(s)];
      var n = planDay(s), day = dayByN(n);
      if (isOn(s) && day) {
        h.push(promptsCard(s, day, {
          kicker: t('day.kicker', { n: num(n), total: num(totalDays()) }),
          title: RS.t('prep.day.' + n + '.theme'),
          action: { text: t('day.open'), act: 'nav.go', arg: 'prep/day?n=' + n, icon: 'chevron-right' }
        }));
      } else if (isOn(s) && !days().length) {
        h.push(RS.ui.card({ body: RS.ui.empty({ icon: 'sprout', title: t('empty.title'), body: t('empty.body') }) }));
      }
      var rows = [RS.ui.row({ icon: 'sprout', title: t('today.open'), sub: isOn(s) ? t('today.openSub', { n: num(n), total: num(totalDays()) }) : t('today.openSubNew'),
        act: 'nav.go', arg: 'prep', chevron: true })].concat(planRows());
      h.push(RS.ui.card({ kicker: { icon: 'target', text: t('plan.kicker') }, body: RS.ui.list(rows) }));
      return h.join('');
    }, ''),
    readiness: guard(function () { return readiness(); }, 0),
    daysUntilRamadan: guard(daysUntilRamadan, null),
    // extra read-only helpers for other modules (optional)
    planDay: guard(function () { return planDay(state()); }, 1),
    started: guard(function () { return isOn(state()); }, false)
  };

  // Cloud feature flags arrive after boot: re-render a prep screen once they are known (the reminder row).
  RS.on('boot', function () {
    if (RS.cloud && RS.cloud.ready && typeof RS.cloud.ready.then === 'function') {
      RS.cloud.ready.then(function () {
        var c = RS.router.current();
        if (c && /^prep(\/|$)/.test(c.route || '')) RS.refresh();
      }, function () {});
    }
  });
})();
