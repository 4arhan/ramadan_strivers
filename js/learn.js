/* =====================================================================================================
   Ramadan Strivers v8 — learn.js (learn module). The Learn tab and its sessions:
     #/learn                    home: Today's 5 hero, then your mistakes, flashcard decks (above the quiz while any
                                cards are due), quiz topics (one list: True or false | Multiple choice), stats
     #/learn/quiz?cat=<id|all>  10 shuffled true/false statements
     #/learn/mcq?cat=<id|all>   10 multiple-choice questions (four options, radio semantics)
     #/learn/flash?deck=<id>    spaced repetition: Leitner boxes 1-5, next review after 0/1/3/7/16 days; due cards
                                first, then up to 10 new cards per deck per day. &cram=1 practises reviewed cards
                                ahead of schedule: there only "Again" changes a card's schedule, and no new cards
     #/learn/daily              Today's 5: 2 true/false + 2 multiple choice + 1 flashcard, once a day, with a streak
     #/learn/review             questions answered wrongly (?ids=tf:<id>,mcq:<id> reviews one round's mistakes)
   Navigation: a round belongs to its history entry (history.state.lrn = round id). Back, Forward or a reload onto
     that entry shows the round as it was, finished or not (rounds are kept in memory and in sessionStorage
     'rs-learn-session'); a new navigation (a row on the Learn home, a typed link) starts a new round, and so does
     "Play again". Every "Back to Learn" goes back in history (RS.router.back('learn')). Moving on from a finished
     session to the next one (review mistakes, review due cards, practise anyway) replaces it in history, so Back
     from any session lands on Learn.
   Storage (CONTRACT §5) — v7 keys keep their exact shape:
     rs-quiz-stats {ans, cor}      every true/false and multiple-choice answer
     rs-quiz-best  {cat: pct}      best true/false round per topic ('all' = mixed)
     rs-learn      {srs: {cardId: {box, due}}, daily: {date, done, streak, best, ts, today}, mcqBest: {cat: pct},
                    mistakes: ['tf:<id>' | 'mcq:<id>'] (newest first, max 50), newDay: {date, d: {deckId: n}}}
                   daily.date = last day Today's 5 was completed · daily.done = completed sessions in total ·
                   daily.today = {date, items:[key], n, cor, ok:[bool]} = today's set and progress
     sessionStorage rs-learn-session {qt: 'tf'|'mcq' (home quiz list), rounds: {id: round}} (this tab only)
   Public hooks: RS.learn.summary() → {streak, bestStreak, dueCards, accuracy (0-100), answered, correct, mastered,
     dailyDone, dailyProgress} · RS.learn.dueCount() · RS.learn.dailyDone().
   Every save is followed by RS.emit('data', {source: 'learn'}) (cloud sync listens).
   Home hero metrics: Accuracy · Best streak · Due cards. CONTRACT §2 lists "Streak": the current daily streak is
     already the huge number, so the metric shows the best streak (cards mastered moved to the stats card).
   AI levels: when RS.cloud.aiAvailable() and the reading level is 'kids' or the quiz level 'advanced', the
     true/false statements of a session go through RS.cloud.quizTransform(cards); answers never change.
     Multiple-choice questions are not sent: /api/ai/quiz rewrites true/false cards ({q, a, x, r}) only, and a
     reworded stem would no longer match its four fixed options.
   ===================================================================================================== */
(function () {
  'use strict';
  var RS = window.RS;
  if (!RS || !RS.router) return;

  var KEY = 'rs-learn';
  var SS_KEY = 'rs-learn-session';
  var ROUND = 10;                 // questions per quiz round
  var DAILY = 5;                  // items in Today's 5
  var NEW_PER_DAY = 10;           // new flashcards per deck per day
  var MISTAKES_MAX = 50;
  var REQUEUE_MAX = 2;            // an "Again" card comes back at most twice in one session
  var ROUNDS_MAX = 6;             // rounds kept for Back/Forward and reloads
  var TAP_MS = 400;               // double-tap guard, see tooSoon()
  var IV = [0, 1, 3, 7, 16];      // days until the next review, by Leitner box 1..5
  var GRADES = ['again', 'hard', 'good', 'easy'];
  var KINDS = ['quiz', 'mcq', 'flash', 'daily', 'review'];
  var esc = RS.esc;
  var hasOwn = Object.prototype.hasOwnProperty;

  function L(k, v) { return RS.t('learn.' + k, v); }
  function LN(k, n, v) { return RS.tn('learn.' + k, n, v); }
  function txt(key) { return RS.has(key) ? RS.t(key) : ''; }
  function num(n) { return RS.fmt.n(n); }
  function frac(a, b) { return num(a) + '/' + num(b); }          // a score such as 7/10 is notation in every language
  function int(x) { var n = parseInt(x, 10); return isFinite(n) && n > 0 ? n : 0; }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function isISO(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function today() { return RS.todayISO(); }
  function parseISO(iso) {
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
  }
  function addDays(iso, n) { var d = parseISO(iso); d.setDate(d.getDate() + n); return RS.todayISO(d); }
  function daysUntil(iso) { return Math.round((parseISO(iso) - parseISO(today())) / 86400000); }
  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }
  function findBy(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function countOk(res) { var n = 0; res.forEach(function (r) { if (r.ok) n++; }); return n; }
  function srOnly(s) { return '<span class="sr-only">' + esc(s) + '</span>'; }
  function changed() { RS.emit('data', { source: 'learn' }); }
  function routeArg(route, params) { return RS.router.href(route, params).slice(2); }    // 'learn/flash?deck=duas'
  // Every learn screen's one hero object; 'lrn-hero' scopes the module's hero tokens and tweaks in css/learn.css.
  function hero(o) { o.cls = 'lrn-hero' + (o.cls ? ' ' + o.cls : ''); return RS.ui.hero(o); }
  // While a language has no translation of a content string, RS.t falls back to English. Such text is marked
  // lang="en" dir="ltr" so it keeps its reading order inside a right-to-left page and screen readers switch voice.
  function fb(key) {
    var lang = RS.lang(), d = RS.I18N && RS.I18N[lang];
    if (!key || lang === 'en' || (d && hasOwn.call(d, key))) return '';
    return ' lang="en" dir="ltr"';
  }

  /* ------------------------------------------------------------------ content (read live, never cached) */
  function C() { return RS.content || {}; }
  function tfAll() { return arr(C().tf).filter(function (q) { return q && q.id; }); }
  function mcqAll() { return arr(C().mcq).filter(function (q) { return q && q.id; }); }
  function cardMap() { var m = C().cards; return m && typeof m === 'object' ? m : {}; }
  function decksAll() { return arr(C().decks).filter(function (d) { return d && d.id; }); }
  function cats() { return arr(C().quizCats).filter(function (c) { return c && c.id; }); }
  function tfById(id) { return findBy(tfAll(), id); }
  function mcqById(id) { return findBy(mcqAll(), id); }
  function deckById(id) { return findBy(decksAll(), id); }
  function deckIds(d) { var m = cardMap(); return arr(d && d.cards).filter(function (id) { return hasOwn.call(m, id); }); }
  function catIcon(id) { var c = findBy(cats(), id); return c && c.icon ? c.icon : (id === 'all' ? 'shuffle' : 'circle-help'); }
  function knownCat(id) { return id === 'all' || !!findBy(cats(), id) || RS.has('cat.' + id); }
  // An unknown topic or deck id is never shown: the quiz type's (or Flashcards') title stands in for it.
  function catName(id, kind) {
    if (!id || id === 'all') return L('cat.all');
    if (RS.has('cat.' + id)) return RS.t('cat.' + id);
    return L(kind === 'mcq' ? 'mcq.title' : 'tf.title');
  }
  function deckName(id) { return id && RS.has('deck.' + id + '.name') ? RS.t('deck.' + id + '.name') : L('fc.title'); }
  function deckIcon(id) { var d = deckById(id); return d && d.icon ? d.icon : 'layers'; }
  function mcqOpts(id) {
    var out = [];
    for (var i = 0; i < 4; i++) { if (!RS.has('mcq.' + id + '.o' + i)) break; out.push(RS.t('mcq.' + id + '.o' + i)); }
    return out;
  }

  // Item keys: 'tf:<id>' · 'mcq:<id>' · 'fc:<cardId>'
  function splitKey(k) {
    var s = String(k == null ? '' : k), i = s.indexOf(':');
    return i > 0 ? { t: s.slice(0, i), id: s.slice(i + 1) } : null;
  }
  function keyOk(k) {
    var p = splitKey(k);
    if (!p) return false;
    if (p.t === 'tf') return !!tfById(p.id);
    if (p.t === 'mcq') return !!mcqById(p.id);
    if (p.t === 'fc') return hasOwn.call(cardMap(), p.id);
    return false;
  }
  function itemsFrom(keys) {
    var seen = {};
    return keys.filter(function (k) { if (seen[k] || !keyOk(k)) return false; seen[k] = 1; return true; }).map(function (k) {
      var p = splitKey(k), it = { t: p.t, id: p.id, key: k };
      if (p.t === 'fc') it.deck = cardMap()[p.id].deck;
      return it;
    });
  }

  /* ------------------------------------------------------------------ storage (v7-compatible + rs-learn) */
  function cleanPct(o) {
    var out = {};
    if (isObj(o)) Object.keys(o).forEach(function (k) {
      var v = Number(o[k]);
      if (o[k] !== null && o[k] !== '' && isFinite(v)) out[k] = RS.clamp(Math.round(v), 0, 100);
    });
    return out;
  }
  function cleanToday(t) {
    if (!t || typeof t !== 'object' || !isISO(t.date)) return null;
    var items = arr(t.items).filter(function (k) { return typeof k === 'string'; }).slice(0, 10);
    var ok = arr(t.ok).slice(0, items.length).map(function (x) { return !!x; });
    return { date: t.date, items: items, n: Math.min(int(t.n), items.length), cor: Math.min(int(t.cor), items.length), ok: ok };
  }
  function getL() {
    var raw = RS.store.get(KEY, null);
    var o = isObj(raw) ? raw : {};
    var out = {};
    Object.keys(o).forEach(function (k) { out[k] = o[k]; });          // keep fields a newer version may add
    var srs = {};
    if (o.srs && typeof o.srs === 'object') Object.keys(o.srs).forEach(function (id) {
      var s = o.srs[id], b = s && typeof s === 'object' ? parseInt(s.box, 10) : 0;
      if (b >= 1 && b <= 5 && isISO(s.due)) srs[id] = { box: b, due: s.due };
    });
    out.srs = srs;
    var d = o.daily && typeof o.daily === 'object' ? o.daily : {};
    out.daily = { date: isISO(d.date) ? d.date : '', done: int(d.done), streak: int(d.streak), best: int(d.best), ts: int(d.ts), today: cleanToday(d.today) };
    if (out.daily.best < out.daily.streak) out.daily.best = out.daily.streak;
    out.mcqBest = cleanPct(o.mcqBest);
    out.mistakes = arr(o.mistakes).filter(function (k) { return typeof k === 'string' && /^(tf|mcq):./.test(k); }).slice(0, MISTAKES_MAX);
    var nd = o.newDay && typeof o.newDay === 'object' ? o.newDay : {};
    var nmap = {};
    if (nd.d && typeof nd.d === 'object') Object.keys(nd.d).forEach(function (k) { nmap[k] = int(nd.d[k]); });
    out.newDay = { date: isISO(nd.date) ? nd.date : '', d: nmap };
    return out;
  }
  function putL(o) { RS.store.set(KEY, o); }
  function getStats() {
    var s = RS.store.get('rs-quiz-stats', null);
    s = s && typeof s === 'object' ? s : {};
    var ans = int(s.ans);
    return { ans: ans, cor: Math.min(int(s.cor), ans) };
  }
  function putStats(s) { RS.store.set('rs-quiz-stats', { ans: s.ans, cor: s.cor }); }
  function getTfBest() { return cleanPct(RS.store.get('rs-quiz-best', null)); }
  function accuracyText(st) { return st.ans > 0 ? RS.fmt.pct(st.cor / st.ans * 100) : '–'; }

  // This tab's session data (sessionStorage; a memory copy when storage is blocked or full).
  var ssMem = {};
  function ssRead() {
    try {
      var v = JSON.parse(window.sessionStorage.getItem(SS_KEY) || 'null');
      return isObj(v) ? v : {};
    } catch (e) { return ssMem; }
  }
  function ssWrite(v) {
    ssMem = v;
    try { window.sessionStorage.setItem(SS_KEY, JSON.stringify(v)); } catch (e) { /* private mode or full: memory only */ }
  }

  /* ------------------------------------------------------------------ spaced repetition (Leitner) */
  function nextBox(box, g) {
    box = box || 1;
    if (g === 'again') return 1;
    if (g === 'hard') return box;
    if (g === 'good') return Math.min(5, box + 1);
    return Math.min(5, box + 2);
  }
  function ivText(d) { return d <= 0 ? L('iv.today') : LN('iv.days', d); }
  function newToday(o, deckId) { return o.newDay.date === today() ? int(o.newDay.d[deckId]) : 0; }
  function deckStats(o, d) {
    var t = today(), due = 0, fresh = 0, mastered = 0, next = '';
    var ids = deckIds(d);
    ids.forEach(function (id) {
      var s = o.srs[id];
      if (!s) { fresh++; return; }
      if (s.box >= 5) mastered++;
      if (s.due <= t) due++;
      else if (!next || s.due < next) next = s.due;
    });
    return { total: ids.length, due: due, fresh: fresh, mastered: mastered, next: next,
      newLeft: Math.min(fresh, Math.max(0, NEW_PER_DAY - newToday(o, d.id))) };
  }
  function hasReviewed(o, d) { return deckIds(d).some(function (id) { return !!o.srs[id]; }); }
  function liveSrs(o, fn) {
    var m = cardMap();
    Object.keys(o.srs).forEach(function (id) { if (hasOwn.call(m, id)) fn(id, o.srs[id]); });
  }
  function dueAll(o) { var t = today(), n = 0; liveSrs(o, function (id, s) { if (s.due <= t) n++; }); return n; }
  function masteredAll(o) { var n = 0; liveSrs(o, function (id, s) { if (s.box >= 5) n++; }); return n; }
  function mostDueDeck(o, except) {
    var best = null, bestN = 0;
    decksAll().forEach(function (d) {
      if (d.id === except) return;
      var n = deckStats(o, d).due;
      if (n > bestN) { best = d.id; bestN = n; }
    });
    return best;
  }
  function byDue(o) {
    return function (a, b) {
      var x = o.srs[a], y = o.srs[b];
      return x.due < y.due ? -1 : x.due > y.due ? 1 : x.box - y.box;
    };
  }
  // Due cards first, then today's new cards. With nothing left and cram on: reviewed cards ahead of schedule
  // (soonest due first). New cards are never crammed: they stay within the daily limit.
  function flashQueue(o, d, cram) {
    var t = today(), ids = deckIds(d);
    var due = ids.filter(function (id) { return o.srs[id] && o.srs[id].due <= t; }).sort(byDue(o));
    var fresh = ids.filter(function (id) { return !o.srs[id]; });
    var q = due.concat(fresh.slice(0, deckStats(o, d).newLeft)).map(function (id) { return { t: 'fc', id: id, key: 'fc:' + id, deck: d.id }; });
    if (!q.length && cram) {
      q = ids.filter(function (id) { return !!o.srs[id]; }).sort(byDue(o)).slice(0, ROUND)
        .map(function (id) { return { t: 'fc', id: id, key: 'fc:' + id, deck: d.id, cram: true }; });
    }
    return q;
  }
  function applyGrade(o, id, deck, g) {
    var cur = o.srs[id], isNew = !cur;
    var box = nextBox(cur ? cur.box : 1, g);
    o.srs[id] = { box: box, due: addDays(today(), IV[box - 1]) };
    if (isNew) {
      if (o.newDay.date !== today()) o.newDay = { date: today(), d: {} };
      o.newDay.d[deck] = int(o.newDay.d[deck]) + 1;
    }
    return isNew;
  }

  /* ------------------------------------------------------------------ Today's 5 */
  function dailyView(o) {
    var t = today(), d = o.daily;
    var doneToday = d.date === t;
    var streak = doneToday || d.date === addDays(t, -1) ? d.streak : 0;
    var td = d.today && d.today.date === t ? d.today : null;
    var total = td && td.items.length ? td.items.length : DAILY;
    var n = doneToday ? total : (td ? td.n : 0);
    return { streak: streak, best: Math.max(d.best, streak), doneToday: doneToday, n: Math.min(n, total), total: total, td: td };
  }
  function dailyCard(o) {
    var t = today(), best = null;
    decksAll().forEach(function (d) {
      deckIds(d).forEach(function (id) {
        var s = o.srs[id];
        if (s && s.due <= t && (!best || s.due < best.due || (s.due === best.due && s.box < best.box))) best = { id: id, due: s.due, box: s.box };
      });
    });
    if (best) return best.id;
    var fresh = [];
    decksAll().forEach(function (d) {
      if (deckStats(o, d).newLeft <= 0) return;
      var ids = deckIds(d).filter(function (id) { return !o.srs[id]; });
      if (ids.length) fresh.push(ids[0]);
    });
    return fresh.length ? fresh[Math.floor(Math.random() * fresh.length)] : null;
  }
  // Today's set is chosen once and kept in rs-learn.daily.today, so leaving half-way resumes the same 5.
  function ensureDaily(o) {
    var t = today(), td = o.daily.today;
    if (td && td.date === t && td.items.length && td.items.every(keyOk)) return td;
    var tf = shuffle(tfAll()), mcq = shuffle(mcqAll()), ti = 0;
    function takeTf() { var q = tf[ti++]; return q ? 'tf:' + q.id : null; }
    var keys = [takeTf(), mcq[0] ? 'mcq:' + mcq[0].id : takeTf(), takeTf(), mcq[1] ? 'mcq:' + mcq[1].id : takeTf()];
    var fc = dailyCard(o);
    keys.push(fc ? 'fc:' + fc : takeTf());
    td = { date: t, items: keys.filter(Boolean), n: 0, cor: 0, ok: [] };
    o.daily.today = td;
    return td;
  }
  function completeDaily(o) {
    var t = today(), d = o.daily;
    if (d.date === t) return false;
    d.streak = d.date === addDays(t, -1) ? d.streak + 1 : 1;
    d.best = Math.max(d.best, d.streak);
    d.date = t;
    d.done += 1;
    d.ts = Date.now();
    return true;
  }

  /* ------------------------------------------------------------------ mistakes */
  function noteResult(o, key, ok) {
    var i = o.mistakes.indexOf(key);
    if (i >= 0) o.mistakes.splice(i, 1);
    if (!ok) {
      o.mistakes.unshift(key);
      if (o.mistakes.length > MISTAKES_MAX) o.mistakes.length = MISTAKES_MAX;
    }
  }
  function liveMistakes(o) { return o.mistakes.filter(function (k) { var p = splitKey(k); return p && p.t !== 'fc' && keyOk(k); }); }

  /* ------------------------------------------------------------------ AI levels (true/false statements only) */
  function aiWanted() {
    var c = RS.cloud, s = RS.settings;
    if (!c || typeof c.aiAvailable !== 'function' || typeof c.quizTransform !== 'function') return false;
    if (s.level !== 'kids' && s.quizLevel !== 'advanced') return false;
    try { return !!c.aiAvailable(); } catch (e) { return false; }
  }
  function tfText(it) {
    var ai = it.ai && it.ai.lang === RS.lang() ? it.ai : null;
    return { q: ai ? ai.q : RS.t('tf.' + it.id + '.q'), x: ai && ai.x ? ai.x : txt('tf.' + it.id + '.x'), ai: !!ai };
  }
  function aiStart(s) {
    if (!aiWanted()) return;
    var targets = [];
    s.items.forEach(function (it, i) { if (it.t === 'tf' && i >= s.i && !it.ai) targets.push({ it: it, i: i }); });
    if (!targets.length) return;
    var lang = RS.lang();
    var cards = targets.map(function (t) {
      var q = tfById(t.it.id) || {};
      return { id: t.it.id, q: RS.t('tf.' + t.it.id + '.q'), a: !!q.a, x: txt('tf.' + t.it.id + '.x'), r: q.ref || '' };
    });
    var p;
    try { p = RS.cloud.quizTransform(cards); } catch (e) { p = null; }
    if (!p || typeof p.then !== 'function') return;
    s.ai = 'pending';
    p.then(function (out) {
      s.ai = 'done';
      if (Array.isArray(out) && out.length === cards.length) {
        out.forEach(function (c, j) {
          var t = targets[j];
          if (t.i < s.i || (t.i === s.i && s.phase !== 'q') || t.it.ai) return;   // already answered: keep what was read
          if (!c || typeof c.q !== 'string' || !c.q.trim() || c.q === cards[j].q) return;
          t.it.ai = { q: c.q.trim(), x: typeof c.x === 'string' ? c.x.trim() : '', lang: lang };
        });
      }
      aiSettled(s);
    }, function () { s.ai = 'off'; aiSettled(s); });
  }
  // The rewrites reach the round even while it is off screen (it may come back with Back/Forward); on screen the
  // current card is repainted only while it is still unanswered (never under the reader's eyes).
  function aiSettled(s) {
    if (S === s) aiRepaint(s);
    else if (mem[s.id] === s) keep(s);
  }
  function aiRepaint(s) {
    if (S !== s || s.done || s.empty || s.phase !== 'q') { keep(s); return; }
    var it = s.items[s.i];
    if (!it || it.t !== 'tf' || !document.getElementById('lrn-stmt')) { keep(s); return; }
    var a = document.activeElement, keepArg = a && a.getAttribute ? a.getAttribute('data-arg') : null;
    paint(null);
    if (keepArg) { var b = document.querySelector('#view [data-act="learn.tf"][data-arg="' + keepArg + '"]'); if (b) focusEl(b); }
  }

  /* ------------------------------------------------------------------ rounds: history entries, memory, reloads */
  var S = null;       // the round on screen
  var mem = {};       // id → round, for Back/Forward without a reload

  function sessionKey(kind, p) { return [kind, p.cat || '', p.deck || '', p.ids || '', p.cram || ''].join('|'); }
  // The round id stored on the current history entry (Back, Forward and reloads keep history.state).
  function entryRound() {
    try { var st = history.state; return st && typeof st.lrn === 'string' ? st.lrn : null; } catch (e) { return null; }
  }
  function tagEntry(s) {
    if (!s || !s.id) return;
    try {
      var st = history.state;
      if (st && (st.rsOverlay || st.lrn === s.id)) return;         // an open sheet's entry belongs to core
      var next = {};
      if (isObj(st)) Object.keys(st).forEach(function (k) { next[k] = st[k]; });
      next.lrn = s.id;
      history.replaceState(next, '', location.href);
    } catch (e) { /* no history API: rounds still work, only Back/Forward cannot bring them back */ }
  }
  function keep(s) {
    if (!s || !s.id || s.empty) return;
    s.ts = Date.now();
    mem[s.id] = s;
    var all = ssRead(), rounds = isObj(all.rounds) ? all.rounds : {};
    rounds[s.id] = s;
    var ids = Object.keys(rounds).sort(function (a, b) { return int(rounds[b] && rounds[b].ts) - int(rounds[a] && rounds[a].ts); });
    ids.slice(ROUNDS_MAX).forEach(function (id) { delete rounds[id]; });
    Object.keys(mem).forEach(function (id) { if (!rounds[id]) delete mem[id]; });
    all.rounds = rounds;
    ssWrite(all);
  }
  function drop(s) {
    if (!s || !s.id) return;
    delete mem[s.id];
    var all = ssRead();
    if (isObj(all.rounds) && all.rounds[s.id]) { delete all.rounds[s.id]; ssWrite(all); }
  }
  // A round saved before a reload, if it still fits this route and today's content.
  function revive(r, key) {
    if (!isObj(r) || r.key !== key || KINDS.indexOf(r.kind) < 0 || !isObj(r.params) || typeof r.id !== 'string') return null;
    var items = arr(r.items), res = arr(r.res);
    if (!items.length || !items.every(function (it) { return isObj(it) && keyOk(it.key); })) return null;
    var i = int(r.i);
    if (i > items.length || res.length > items.length) return null;
    var s = {};
    Object.keys(r).forEach(function (k) { s[k] = r[k]; });
    s.items = items;
    s.res = res;
    s.i = i;
    s.empty = null;
    s.done = !!r.done || i >= items.length;
    s.phase = !s.done && r.phase === 'a' && res.length ? 'a' : 'q';
    s.flipped = !s.done && !!r.flipped;
    s.requeue = isObj(r.requeue) ? r.requeue : {};
    if (s.done && !isObj(s.sum)) return null;
    if (r.ai === 'pending') { s.ai = 'off'; s.aiRetry = !s.done; }
    return s;
  }
  // Today's 5 lives in rs-learn: a kept round is shown again only while it still matches the saved progress.
  function dailyCurrent(s) {
    var dv = dailyView(getL());
    if (s.date !== today()) return false;
    if (s.done) return dv.doneToday;
    var td = dv.td;
    return !s.detached && !!td && td.items.join('|') === s.set && td.n === s.i + (s.phase === 'a' ? 1 : 0);
  }
  function roundFor(kind, p) {
    var key = sessionKey(kind, p), id = entryRound(), s = null;
    if (id) {
      s = mem[id] && mem[id].key === key ? mem[id] : null;
      if (!s) {
        var all = ssRead();
        s = revive(isObj(all.rounds) ? all.rounds[id] : null, key);
        if (s) mem[id] = s;
      }
      if (s && kind === 'daily' && !dailyCurrent(s)) s = null;
    }
    if (!s) return startSession(kind, p);
    if (s.aiRetry) { delete s.aiRetry; aiStart(s); }
    return s;
  }

  function startSession(kind, params) {
    var p = {};
    Object.keys(params || {}).forEach(function (k) { if (params[k] != null) p[k] = String(params[k]); });
    var s = { id: RS.uid('lr'), kind: kind, params: p, key: sessionKey(kind, p), items: [], i: 0, res: [], phase: 'q', flipped: false,
      done: false, empty: null, ai: 'off', requeue: {}, sum: null, ts: Date.now() };
    var o = getL();
    if (kind === 'quiz' || kind === 'mcq') {
      var type = kind === 'quiz' ? 'tf' : 'mcq';
      s.cat = p.cat || 'all';
      var pool = (type === 'tf' ? tfAll() : mcqAll()).filter(function (q) { return s.cat === 'all' || q.cat === s.cat; });
      s.items = shuffle(pool).slice(0, ROUND).map(function (q) { return { t: type, id: q.id, key: type + ':' + q.id }; });
      if (!s.items.length) s.empty = knownCat(s.cat) ? type : 'nocat';
    } else if (kind === 'flash') {
      var d = deckById(p.deck);
      s.deck = d ? d.id : String(p.deck || '');
      if (!d) s.empty = 'nodeck';
      else if (!deckIds(d).length) s.empty = 'deck';
      else {
        s.items = flashQueue(o, d, p.cram === '1');
        if (!s.items.length) s.empty = 'caught';
      }
    } else if (kind === 'daily') {
      s.date = today();
      var dv = dailyView(o);
      if (dv.doneToday) {
        s.done = true;
        if (dv.td && dv.td.items.length && dv.td.items.every(keyOk)) {
          s.items = itemsFrom(dv.td.items);
          s.res = s.items.map(function (it, i) { return { t: it.t, id: it.id, key: it.key, ok: !!dv.td.ok[i], prior: true }; });
        }
        s.sum = { cor: dv.td ? dv.td.cor : null, total: dv.td ? dv.td.items.length : null };
      } else {
        var td = ensureDaily(o);
        putL(o);
        s.items = itemsFrom(td.items);
        if (s.items.length !== td.items.length) { o.daily.today = null; td = ensureDaily(o); putL(o); s.items = itemsFrom(td.items); }
        s.set = td.items.join('|');
        if (!s.items.length) s.empty = 'daily';
        s.i = Math.min(td.n, s.items.length);
        s.res = s.items.slice(0, s.i).map(function (it, i) { return { t: it.t, id: it.id, key: it.key, ok: !!td.ok[i], prior: true }; });
        if (s.items.length && s.i >= s.items.length) { s.done = true; s.sum = { cor: td.cor, total: td.items.length }; }
      }
    } else if (kind === 'review') {
      var keys = p.ids ? String(p.ids).split(',') : liveMistakes(o);
      s.items = itemsFrom(keys.filter(function (k) { return /^(tf|mcq):/.test(k); })).slice(0, ROUND);
      if (!s.items.length) s.empty = 'review';
    }
    if (!s.empty && !s.done) aiStart(s);
    return s;
  }
  function curItem() { return S && !S.done && !S.empty ? S.items[S.i] : null; }

  // Records a true/false or multiple-choice answer: v7 stats, mistakes, Today's 5 progress, round best.
  function commit(s, it, choice, ok) {
    var o = getL(), st = getStats();
    st.ans += 1;
    if (ok) st.cor += 1;
    putStats(st);
    noteResult(o, it.key, ok);
    s.res.push({ t: it.t, id: it.id, key: it.key, ok: ok, choice: choice, ai: it.ai || null });
    if (s.kind === 'daily') dailyStep(o, s, ok);
    if (s.i + 1 >= s.items.length) finalize(s, o);
    putL(o);
    changed();
    s.phase = 'a';
  }
  function gradeCard(s, it, g) {
    var o = getL(), isNew = false;
    if (it.cram) {
      // practising ahead of schedule never moves a card on; forgetting it still sends it back to box 1
      if (g === 'again') o.srs[it.id] = { box: 1, due: today() };
    } else {
      isNew = applyGrade(o, it.id, it.deck, g);
    }
    var ok = g !== 'again';
    s.res.push({ t: 'fc', id: it.id, key: it.key, ok: ok, grade: g, isNew: isNew });
    if (s.kind === 'flash' && g === 'again' && (s.requeue[it.id] || 0) < REQUEUE_MAX) {
      s.requeue[it.id] = (s.requeue[it.id] || 0) + 1;
      s.items.push({ t: 'fc', id: it.id, key: it.key, deck: it.deck, again: true });     // due today now: graded as usual
    }
    if (s.kind === 'daily') dailyStep(o, s, ok);
    if (s.i + 1 >= s.items.length) finalize(s, o);
    putL(o);
    changed();
    advance(s);
  }
  function dailyStep(o, s, ok) {
    var td = o.daily.today;
    if (!td || td.date !== today()) return;             // the date changed mid-session: leave the new day's set alone
    if (s.detached || td.items.join('|') !== s.set) {
      // Cloud sync brought another device's set for today: never write this session's answers into its slots.
      // This device still finishes its own five, and that completes today's 5.
      s.detached = true;
      if (s.i + 1 >= s.items.length) completeDaily(o);
      return;
    }
    td.ok[s.i] = ok;
    td.n = Math.max(td.n, s.i + 1);
    td.cor = countOk(td.ok.map(function (x) { return { ok: x }; }));
    if (td.n >= td.items.length) completeDaily(o);
  }
  // Runs when the last item is answered, so leaving before "See results" still saves the round.
  function finalize(s, o) {
    if (s.sum) return;
    var cor = countOk(s.res), total = s.res.length, pct = total ? Math.round(cor / total * 100) : 0;
    if (s.kind === 'quiz' || s.kind === 'mcq') {
      var best = s.kind === 'quiz' ? getTfBest() : o.mcqBest;
      var prev = hasOwn.call(best, s.cat) ? best[s.cat] : null;
      var isNew = prev == null || pct > prev;
      if (isNew) best[s.cat] = pct;
      if (s.kind === 'quiz' && isNew) RS.store.set('rs-quiz-best', best);
      s.sum = { cor: cor, total: total, pct: pct, best: best[s.cat], newBest: isNew && pct > 0 && prev != null };
    } else if (s.kind === 'flash') {
      var seen = {}, fresh = 0;
      s.res.forEach(function (r) { if (!seen[r.id]) { seen[r.id] = 1; if (r.isNew) fresh++; } });
      s.sum = { cor: cor, total: total, pct: pct, cards: Object.keys(seen).length, fresh: fresh };
    } else if (s.kind === 'daily') {
      var td = !s.detached && o.daily.today && o.daily.today.date === today() ? o.daily.today : null;
      s.sum = { cor: td ? td.cor : cor, total: td ? td.items.length : total };
    } else {
      s.sum = { cor: cor, total: total, pct: pct };
    }
  }
  function advance(s) {
    s.i += 1;
    s.phase = 'q';
    s.flipped = false;
    if (s.i >= s.items.length) { s.done = true; if (!s.sum) finalize(s, getL()); }
  }
  // The questions this round got wrong (a question asked twice counts by its last answer), still in the content.
  function wrongKeys(s) {
    var last = {}, order = [];
    s.res.forEach(function (r) { if (!hasOwn.call(last, r.key)) order.push(r.key); last[r.key] = r; });
    return order.filter(function (k) { return !last[k].ok && /^(tf|mcq):/.test(k) && keyOk(k); });
  }
  // After a review round: what "review again" asks next. A round-scoped review (?ids) keeps only the questions
  // missed again; the full review continues with the whole mistakes list.
  function reviewLeft(s) { return s.params.ids ? wrongKeys(s) : liveMistakes(getL()); }

  /* ------------------------------------------------------------------ painting + focus */
  function focusEl(el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }
  function smooth() { return RS.reducedMotion() ? 'auto' : 'smooth'; }
  // Keeps the revealed answer and the Next button in view without hiding the answer under the topbar.
  function bringIntoView(topEl, bottomEl) {
    if (!topEl) return;
    var top = topEl.getBoundingClientRect().top, bottom = (bottomEl || topEl).getBoundingClientRect().bottom;
    var bar = document.getElementById('topbar'), barH = bar ? bar.getBoundingClientRect().bottom : 64;
    var delta = 0;
    if (bottom > window.innerHeight - 16) delta = bottom - (window.innerHeight - 16);
    if (top - delta < barH + 12) delta = top - (barH + 12);
    if (delta > 0) window.scrollBy({ top: delta, behavior: smooth() });
  }
  // focus: 'top' (a new screen), 'reveal' (an answer) or null (the same screen, e.g. AI rewrites arrived)
  function paint(focus) {
    var view = document.getElementById('view');
    if (!view || !S) return;
    if (focus) tap.paint = Date.now();
    keep(S);
    topbarFor(S);
    view.innerHTML = sessionHtml(S);
    if (focus === 'top') {
      window.scrollTo(0, 0);
      var it = curItem();
      focusEl(S.done || S.empty ? 'lrn-h' : (it && it.t === 'fc' ? 'lrn-front' : 'lrn-stmt'));
    } else if (focus === 'reveal') {
      var r = document.getElementById('lrn-reveal');
      focusEl(r);
      bringIntoView(r, document.getElementById('lrn-next'));
    }
  }
  function setHidden(el, on) {
    if (!el) return;
    if (on) { el.setAttribute('aria-hidden', 'true'); el.setAttribute('inert', ''); }
    else { el.removeAttribute('aria-hidden'); el.removeAttribute('inert'); }
    try { el.inert = !!on; } catch (e) { /* older browsers */ }
  }

  /* ------------------------------------------------------------------ topbar */
  function titleFor(kind, p) {
    p = p || {};
    if (kind === 'quiz' || kind === 'mcq') return catName(p.cat || 'all', kind);
    if (kind === 'flash') return deckById(p.deck) ? deckName(p.deck) : L('fc.title');
    if (kind === 'daily') return L('d.title');
    return L('rv.title');
  }
  function topbarFor(s) {
    var sub = { quiz: L('tf.title'), mcq: L('mcq.title'), flash: L('fc.title'), daily: L('d.sub'), review: L('rv.sub') }[s.kind];
    var title = titleFor(s.kind, s.params);
    RS.topbar({ title: title, sub: sub === title ? '' : sub, back: 'learn' });
  }

  /* ------------------------------------------------------------------ session markup */
  function keysHint(it) {
    // The keys themselves are fixed (they work on every keyboard layout, see keyLetter): never translated.
    if (it.t === 'tf') return L('keys.tf', { t: 'T', f: 'F' });
    if (it.t === 'mcq') return L('keys.mcq', { first: num(1), last: num(Math.max(1, mcqOpts(it.id).length)) });
    return L('keys.fc', { first: num(1), last: num(GRADES.length) });
  }
  function sessionHtml(s) {
    if (s.empty) return emptyHtml(s);
    if (s.done) return resultHtml(s);
    var it = s.items[s.i];
    var body = it.t === 'tf' ? tfHtml(s, it) : (it.t === 'mcq' ? mcqHtml(s, it) : fcHtml(s, it));
    return progressHtml(s) + body + '<p class="lrn-keys">' + esc(keysHint(it)) + '</p>';
  }
  // sr: the screen-reader form ("Question 2 of 10.") that starts the question's focus target
  function posLabel(s, sr) {
    var v = { i: num(s.i + 1), n: num(s.items.length) };
    return L((s.kind === 'flash' ? 's.cardOf' : 's.qOf') + (sr ? 'Sr' : ''), v);
  }
  function progressHtml(s) {
    var done = s.i + (s.phase === 'a' ? 1 : 0);
    var right = s.kind === 'flash' ? '' : '<span class="lrn-prog-score">' + esc(LN('s.correct', countOk(s.res))) + '</span>';
    return '<div class="lrn-prog"><div class="lrn-prog-row"><span>' + esc(posLabel(s)) + '</span>' + right + '</div>' +
      RS.ui.bar(done / Math.max(1, s.items.length) * 100) + '</div>';
  }
  // The focus target wraps the position (for screen readers) and the statement, which takes its own direction.
  function stmtHtml(s, text, key) {
    return '<div class="lrn-stmt-w lrn-focus" id="lrn-stmt" tabindex="-1">' + srOnly(posLabel(s, true)) +
      '<p class="lrn-stmt"' + fb(key) + '>' + esc(text) + '</p></div>';
  }
  function aiNote(s, isAi) {
    if (isAi) return '<p class="lrn-ai">' + RS.icon('brain', { size: 15 }) + '<span>' + esc(L('ai.done')) + '</span></p>';
    if (s.ai === 'pending' && s.phase === 'q') return '<p class="lrn-ai" role="status"><span class="spinner" aria-hidden="true"></span><span>' + esc(L('ai.pending')) + '</span></p>';
    return '';
  }
  function revealHtml(ok, line, x, src, xKey) {
    return '<div class="lrn-reveal lrn-focus" id="lrn-reveal" tabindex="-1">' +
      '<p class="lrn-verdict ' + (ok ? 'is-ok' : 'is-no') + '">' + RS.icon(ok ? 'circle-check' : 'circle-x', { size: 22 }) +
      '<span>' + esc(L(ok ? 'v.ok' : 'v.no')) + '</span></p>' +
      (line ? '<p class="lrn-ans">' + esc(line) + '</p>' : '') +
      (x ? '<p class="lrn-x"' + fb(xKey) + '>' + esc(x) + '</p>' : '') +
      (src && (src.ref || src.grade) ? '<p class="lrn-src">' + RS.ui.ref({ ref: src.ref, url: src.url, grade: src.grade }) + '</p>' : '') +
      '</div>';
  }
  function nextCta(s) {
    var left = s.items.length - s.i - 1;
    return RS.ui.cta({ id: 'lrn-next', act: 'learn.next', eyebrow: left > 0 ? LN('s.left', left) : L('s.last'), text: left > 0 ? L('next') : L('results') });
  }
  // Screen-reader marks after an option once it is answered: "(correct answer)", "(your answer)" or both.
  function markText(right, mine) {
    var k = right && mine ? 'sr.rightMine' : right ? 'sr.right' : mine ? 'sr.mine' : '';
    return k ? srOnly(' ' + L(k)) : '';
  }

  function tfPill(val, q, r) {
    var cls = 'lrn-pill', icon = '', mark = '';
    if (r) {
      var right = val === !!q.a, mine = val === r.choice;
      if (right) { cls += ' is-correct'; icon = RS.icon('check', { size: 18 }); }
      else if (mine) { cls += ' is-wrong'; icon = RS.icon('x', { size: 18 }); }
      else cls += ' is-dim';
      mark = markText(right, mine);
    }
    return '<button type="button" class="' + cls + '" data-act="learn.tf" data-arg="' + (val ? 't' : 'f') + '"' + (r ? ' disabled' : '') + '>' +
      icon + '<span>' + esc(L(val ? 'tf.true' : 'tf.false')) + '</span>' + mark + '</button>';
  }
  function tfHtml(s, it) {
    var q = tfById(it.id) || {};
    var r = s.phase === 'a' ? s.res[s.res.length - 1] : null;
    var tx = tfText(it);
    var body = stmtHtml(s, tx.q, tx.ai ? null : 'tf.' + it.id + '.q') + aiNote(s, tx.ai) +
      '<div class="lrn-tf" role="group" aria-label="' + esc(L('tf.group')) + '">' + tfPill(true, q, r) + tfPill(false, q, r) + '</div>';
    if (r) body += revealHtml(r.ok, L(q.a ? 'tf.isTrue' : 'tf.isFalse'), tx.x, q, tx.ai ? null : 'tf.' + it.id + '.x') + nextCta(s);
    return hero({ cls: 'lrn-q', kicker: { icon: catIcon(q.cat), text: catName(q.cat, 'tf') }, extra: body });
  }

  function optHtml(i, text, q, r, id) {
    var cls = 'lrn-opt', mark = '', sr = '';
    if (r) {
      var right = i === q.correct, mine = i === r.choice;
      if (right) { cls += ' is-correct'; mark = RS.icon('circle-check', { size: 20, cls: 'lrn-opt-mark' }); }
      else if (mine) { cls += ' is-wrong'; mark = RS.icon('circle-x', { size: 20, cls: 'lrn-opt-mark' }); }
      else cls += ' is-dim';
      sr = markText(right, mine);
    }
    var checked = r ? r.choice === i : false;
    return '<div class="lrn-opt-w"><button type="button" role="radio" aria-checked="' + checked + '" class="' + cls + '" data-act="learn.mcq" data-arg="' + i + '"' +
      ' tabindex="' + (i === 0 ? '0' : '-1') + '"' + (r ? ' disabled' : '') + '>' +
      '<span class="lrn-opt-k" aria-hidden="true">' + esc(L('opt.' + i)) + '</span>' +
      '<span class="lrn-opt-t"><span class="lrn-bidi"' + fb('mcq.' + id + '.o' + i) + '>' + esc(text) + '</span>' + sr + '</span>' + mark + '</button></div>';
  }
  function mcqHtml(s, it) {
    var q = mcqById(it.id) || {};
    var r = s.phase === 'a' ? s.res[s.res.length - 1] : null;
    var opts = mcqOpts(it.id);
    var body = stmtHtml(s, RS.t('mcq.' + it.id + '.q'), 'mcq.' + it.id + '.q') +
      '<div class="lrn-opts" role="radiogroup" aria-labelledby="lrn-stmt">' + opts.map(function (o, i) { return optHtml(i, o, q, r, it.id); }).join('') + '</div>';
    if (r) {
      var c = q.correct;
      body += revealHtml(r.ok, L('mcq.is', { key: L('opt.' + c), text: opts[c] || '' }), txt('mcq.' + it.id + '.x'), q, 'mcq.' + it.id + '.x') + nextCta(s);
    }
    return hero({ cls: 'lrn-q', kicker: { icon: catIcon(q.cat), text: catName(q.cat, 'mcq') }, extra: body });
  }

  function gradeBtns(it) {
    var cur = getL().srs[it.id], box = cur ? cur.box : 1;
    return GRADES.map(function (g) {
      // each button says when the card comes back; ahead of schedule only "Again" changes that
      var when = it.cram && cur && g !== 'again' ? ivText(daysUntil(cur.due)) : ivText(IV[nextBox(box, g) - 1]);
      var label = L('g.' + g);
      return '<button type="button" class="lrn-grade' + (g === 'good' ? ' is-good' : '') + '" data-act="learn.grade" data-arg="' + g + '"' +
        ' aria-label="' + esc(L('g.name', { grade: label, when: when })) + '">' +
        '<span class="lrn-grade-l">' + esc(label) + '</span><span class="lrn-grade-s">' + esc(when) + '</span></button>';
    }).join('');
  }
  function fcHtml(s, it) {
    var c = cardMap()[it.id] || {};
    var front = txt('fc.' + it.id + '.f'), back = txt('fc.' + it.id + '.b');
    var ar = String(c.arabic || '').trim(), tr = String(c.translit || '').trim();
    var showTr = tr && tr.toLowerCase() !== front.trim().toLowerCase();
    var size = ar.length > 0 && ar.length <= 24 && front.length <= 40 ? ' is-short' : (ar.length > 140 ? ' is-long' : '');
    var fl = s.flipped;
    var frontHtml = '<div class="lrn-face is-front' + size + '" data-act="learn.flip"' + (fl ? ' aria-hidden="true" inert' : '') + '>' +
      RS.ui.kicker(deckIcon(it.deck), deckName(it.deck)) +
      '<div class="lrn-face-bd lrn-focus" id="lrn-front" tabindex="-1">' + srOnly(posLabel(s, true)) +
      (ar ? RS.ui.arabic(ar, { cls: 'lrn-ar' }) : '') +
      (showTr ? '<p class="lrn-translit" lang="ar-Latn" dir="ltr">' + esc(tr) + '</p>' : '') +
      (front ? '<p class="lrn-front"' + fb('fc.' + it.id + '.f') + '>' + esc(front) + '</p>' : '') + '</div>' +
      '<div class="lrn-face-ft">' + RS.ui.cta({ act: 'learn.flip', id: 'lrn-flip', eyebrow: L('fc.showEyebrow'), text: L('fc.show') }) + '</div></div>';
    var backHtml = '<div class="lrn-face is-back"' + (fl ? '' : ' aria-hidden="true" inert') + '>' +
      RS.ui.kicker(deckIcon(it.deck), L('fc.answer')) +
      '<div class="lrn-face-bd lrn-focus" id="lrn-back" tabindex="-1"><p class="lrn-back"' + fb('fc.' + it.id + '.b') + '>' + esc(back) + '</p>' +
      (c.ref || c.grade ? '<p class="lrn-src">' + RS.ui.ref({ ref: c.ref, url: c.url, grade: c.grade }) + '</p>' : '') + '</div>' +
      '<div class="lrn-face-ft"><p class="lrn-rate" id="lrn-rate">' + esc(L('fc.rate')) + '</p>' +
      '<div class="lrn-grades" role="group" aria-labelledby="lrn-rate">' + gradeBtns(it) + '</div></div></div>';
    return hero({ cls: 'lrn-flash', extra: '<div class="lrn-flip' + (fl ? ' is-flipped' : '') + '">' + frontHtml + backHtml + '</div>' });
  }

  /* ------------------------------------------------------------------ results */
  function resultMsg(pct) {
    return pct === 100 ? L('r.perfect') : pct >= 70 ? L('r.great') : pct >= 40 ? L('r.good') : L('r.try');
  }
  function resRow(r) {
    var mark = '<span class="lrn-mark ' + (r.ok ? 'is-ok' : 'is-no') + '">' + RS.icon(r.ok ? 'circle-check' : 'circle-x', { size: 22, label: L(r.ok ? 'r.ok' : 'r.no') }) + '</span>';
    var title = '', key = '', sub = '';
    if (r.t === 'tf') {
      var q = tfById(r.id) || {}, tx = tfText(r);
      title = tx.q;
      key = tx.ai ? '' : 'tf.' + r.id + '.q';
      sub = L('r.answer', { answer: L(q.a ? 'tf.true' : 'tf.false') });
    } else if (r.t === 'mcq') {
      var m = mcqById(r.id) || {}, opts = mcqOpts(r.id);
      title = RS.t('mcq.' + r.id + '.q');
      key = 'mcq.' + r.id + '.q';
      sub = L('r.answerOpt', { key: L('opt.' + m.correct), text: opts[m.correct] || '' });
    } else {
      title = txt('fc.' + r.id + '.f');
      key = 'fc.' + r.id + '.f';
      sub = r.grade ? L('g.' + r.grade) : '';
    }
    return RS.ui.row({ lead: mark, titleHtml: '<span class="lrn-bidi"' + fb(key) + '>' + esc(title) + '</span>',
      subHtml: sub ? '<span class="lrn-bidi">' + esc(sub) + '</span>' : '', cls: 'lrn-res-row' });
  }
  function roundCard(res) {
    if (!res.length) return '';
    var last = {}, order = [];
    res.forEach(function (r) { if (!hasOwn.call(last, r.key)) order.push(r.key); last[r.key] = r; });   // a card graded twice: final result
    return RS.ui.card({ kicker: { icon: 'list-checks', text: L('r.list') }, body: RS.ui.list(order.map(function (k) { return resRow(last[k]); })) });
  }
  // "Back to Learn" goes back in history (to Learn, or replaces this screen with Learn after a deep link).
  function backRow(extraBtn) {
    return '<div class="btn-row lrn-after">' + (extraBtn || '') +
      RS.ui.btn(L('r.back'), { act: 'learn.back', variant: 'secondary', icon: 'arrow-left' }) + '</div>';
  }
  function backCta(eyebrow) { return { eyebrow: eyebrow || L('e.backEyebrow'), text: L('e.back'), act: 'learn.back' }; }
  function heading(text) { return '<h2 class="sr-only lrn-focus" id="lrn-h" tabindex="-1">' + esc(text) + '</h2>'; }
  function scoreRing(pct) { return { pct: pct, text: RS.fmt.pct(pct), label: L('ring.score', { pct: RS.fmt.pct(pct) }) }; }

  function resultHtml(s) {
    var sm = s.sum || {};
    if (s.kind === 'flash') return flashResult(s, sm);
    if (s.kind === 'daily') return dailyResult(s, sm);
    // "Correct" is this round; the accuracy next to it is the lifetime figure, so it says "Overall accuracy".
    var metrics = [
      { label: L('m.correct'), value: frac(sm.cor, sm.total) },
      { label: L('m.overall'), value: accuracyText(getStats()) }
    ];
    var cta, extraBtn = '', back = true;
    if (s.kind === 'review') {
      // the count on the button, the "Still to review" metric and the next round always describe the same questions
      var left = reviewLeft(s);
      metrics.push({ label: L('m.left'), value: num(left.length) });
      if (left.length) {
        cta = { eyebrow: left.length > ROUND ? LN('n.nextOf', left.length, { k: num(ROUND) }) : LN('n.toReview', left.length),
          text: L(s.params.ids ? 'r.reviewAgain' : 'r.keepReviewing'), act: 'learn.retry' };
      } else {
        cta = backCta(L('r.allClear'));
        back = false;
      }
    } else {
      metrics.push({ label: L('m.best'), value: sm.best != null ? RS.fmt.pct(sm.best) : '–' });
      var wrong = wrongKeys(s);
      if (wrong.length) {
        cta = { eyebrow: LN('n.toReview', wrong.length), text: L('r.review'), act: 'learn.review' };
        extraBtn = RS.ui.btn(L('r.retry'), { act: 'learn.retry', variant: 'secondary', icon: 'rotate-ccw' });
      } else {
        cta = { eyebrow: L('r.retryEyebrow'), text: L('r.retry'), act: 'learn.retry' };
      }
    }
    var kick = s.kind === 'review' ? { icon: 'rotate-ccw', text: L('rv.title') } : { icon: catIcon(s.cat), text: catName(s.cat, s.kind) };
    return heading(L('r.done', { n: num(sm.cor), total: num(sm.total) })) +
      hero({
        cls: 'lrn-frac', kicker: kick, number: num(sm.cor), unit: '/' + num(sm.total),
        label: sm.newBest ? L('r.newBestMsg', { msg: resultMsg(sm.pct) }) : resultMsg(sm.pct),
        ring: scoreRing(sm.pct), metrics: metrics, cta: cta
      }) + roundCard(s.res) + (back ? backRow(extraBtn) : '');
  }
  function whenText(iso) {
    if (!iso) return '–';
    var d = daysUntil(iso);
    if (d <= 0) return L('when.today');
    if (d === 1) return L('when.tomorrow');
    return LN('when.days', d);
  }
  // Somewhere useful after a deck: another deck with due cards, else Today's 5 while it is not done.
  function nextStep(o, exceptDeck) {
    var due = mostDueDeck(o, exceptDeck);
    if (due) {
      return { eyebrow: LN('n.due', deckStats(o, deckById(due)).due), text: L('fs.reviewDeck', { deck: deckName(due) }),
        act: 'learn.go', arg: routeArg('learn/flash', { deck: due }) };
    }
    var dv = dailyView(o);
    if (dv.doneToday) return null;
    return dv.n > 0 ? { eyebrow: L('cta.contEyebrow', { n: num(dv.n), total: num(dv.total) }), text: L('cta.cont'), act: 'learn.go', arg: 'learn/daily' }
      : { eyebrow: L('cta.startEyebrow'), text: L('cta.start'), act: 'learn.go', arg: 'learn/daily' };
  }
  function flashResult(s, sm) {
    var o = getL(), d = deckById(s.deck), k = d ? deckStats(o, d) : { due: 0, next: '' };
    var cta = k.due > 0 ? { eyebrow: L('fs.moreEyebrow'), text: L('fs.more'), act: 'learn.retry' } : nextStep(o, s.deck);
    var back = !!cta;
    if (!cta) cta = backCta(L('fs.backEyebrow'));          // the CTA already goes back: no second "Back to Learn"
    return heading(LN('fs.done', sm.cards)) +
      hero({
        kicker: { icon: deckIcon(s.deck), text: deckName(s.deck) }, number: num(sm.cards), unit: LN('unit.cards', sm.cards), label: L('fs.label'),
        ring: { pct: sm.pct, text: RS.fmt.pct(sm.pct), sub: L('fs.recall'), label: L('ring.recall', { pct: RS.fmt.pct(sm.pct) }) },
        metrics: [{ label: L('m.new'), value: num(sm.fresh) }, { label: L('m.recalled'), value: frac(sm.cor, sm.total) },
          { label: L('m.next'), value: whenText(k.due > 0 ? today() : k.next) }],
        cta: cta
      }) + roundCard(s.res) + (back ? backRow('') : '');
  }
  function dailyResult(s, sm) {
    var o = getL(), dv = dailyView(o), due = mostDueDeck(o);
    var cta = due ? { eyebrow: L('cta.doneEyebrow'), text: L('cta.review'), act: 'learn.go', arg: routeArg('learn/flash', { deck: due }) }
      : { eyebrow: L('cta.doneEyebrow'), text: L('cta.more'), act: 'learn.go', arg: routeArg('learn/quiz', { cat: 'all' }) };
    var known = sm.cor != null && sm.total;
    return heading(known ? L('d.done', { n: num(sm.cor), total: num(sm.total) }) : L('d.doneLabel')) +
      hero({
        kicker: { icon: 'target', text: L('hero.kicker') }, number: num(dv.streak), unit: LN('unit.days', dv.streak), label: L('d.doneLabel'),
        ring: { pct: 100, text: frac(dv.total, dv.total), sub: L('ring.today'), label: L('ring.goal', { n: num(dv.total), total: num(dv.total) }) },
        metrics: [{ label: L('m.correct'), value: known ? frac(sm.cor, sm.total) : '–' },
          { label: L('m.overall'), value: accuracyText(getStats()) }, { label: L('m.bestStreak'), value: num(dv.best) }],
        cta: cta
      }) + roundCard(s.res) + backRow('');
  }

  /* ------------------------------------------------------------------ empty states (still one hero) */
  function emptyHtml(s) {
    var e = s.empty;
    if (e === 'caught') {
      var o = getL(), d = deckById(s.deck), k = deckStats(o, d), pct = k.total ? k.mastered / k.total * 100 : 0;
      var cram = hasReviewed(o, d);                       // nothing reviewed yet: nothing to practise ahead
      return heading(L('fe.label', { when: whenText(k.next) })) + hero({
        cls: 'lrn-frac', kicker: { icon: deckIcon(s.deck), text: deckName(s.deck) }, number: num(k.mastered), unit: '/' + num(k.total),
        label: LN('fe.mastered', k.total),
        ring: { pct: pct, text: RS.fmt.pct(pct), label: L('ring.mastered', { pct: RS.fmt.pct(pct) }) },
        metrics: [{ label: L('m.due'), value: num(k.due) }, { label: L('m.new'), value: num(k.newLeft) }, { label: L('m.next'), value: whenText(k.next) }],
        cta: cram ? { eyebrow: L('fe.cramEyebrow'), text: L('fe.cram'), act: 'learn.go', arg: routeArg('learn/flash', { deck: s.deck, cram: '1' }) } : backCta()
      }) + (cram ? backRow('') : '');
    }
    var type = s.kind === 'mcq' ? 'mcq' : 'tf';
    var map = {
      tf: { icon: catIcon(s.cat), kicker: catName(s.cat, 'tf'), title: L('e.tfTitle'), body: L('e.tf') },
      mcq: { icon: catIcon(s.cat), kicker: catName(s.cat, 'mcq'), title: L('e.tfTitle'), body: L('e.mcq') },
      nocat: { icon: 'circle-help', kicker: L(type + '.title'), title: L('e.notFoundTitle'), body: L('e.noTopic') },
      deck: { icon: deckIcon(s.deck), kicker: deckName(s.deck), title: L('e.deckTitle'), body: L('e.deck') },
      nodeck: { icon: 'layers', kicker: L('fc.title'), title: L('e.notFoundTitle'), body: L('e.noDeck') },
      daily: { icon: 'target', kicker: L('hero.kicker'), title: L('e.tfTitle'), body: L('e.daily') },
      review: { icon: 'rotate-ccw', kicker: L('rv.title'), title: L('r.allClear'), body: L('e.review') }
    }[e] || { icon: 'circle-help', kicker: L('fc.title'), title: L('e.tfTitle'), body: L('e.tf') };
    return heading(map.title) + hero({ cls: 'lrn-empty', kicker: { icon: map.icon, text: map.kicker }, text: map.body, cta: backCta() });
  }

  /* ------------------------------------------------------------------ actions */
  // Double-tap guard. The second tap of a quick double tap lands on whatever replaced the first target: the grade
  // row under "Show answer", the next card under a grade, the next question under "Next", the results under
  // "See results". Pointer taps within TAP_MS of a flip, an answer or a new screen are ignored. Keyboard input
  // (no event, or a click with detail 0) is never held up.
  var tap = { paint: 0, flip: 0, answer: 0 };
  function tooSoon(e, since) { return !!e && e.type === 'click' && e.detail > 0 && Date.now() - since < TAP_MS; }

  function answer(type, choice, e) {
    var it = curItem();
    if (!it || S.phase !== 'q' || it.t !== type || tooSoon(e, tap.paint)) return;
    var ok;
    if (type === 'tf') {
      var q = tfById(it.id);
      if (!q) return;
      ok = choice === !!q.a;
    } else {
      var m = mcqById(it.id);
      if (!m || !(choice >= 0 && choice < mcqOpts(it.id).length)) return;
      ok = choice === m.correct;
    }
    commit(S, it, choice, ok);
    tap.answer = Date.now();
    RS.buzz(ok ? 8 : 18);
    paint('reveal');
  }
  RS.act('learn.tf', function (arg, el, e) { answer('tf', arg === 't', e); });
  RS.act('learn.mcq', function (arg, el, e) { answer('mcq', parseInt(arg, 10), e); });
  RS.act('learn.next', function (arg, el, e) {
    if (!S || S.done || S.phase !== 'a' || tooSoon(e, tap.answer)) return;
    advance(S);
    paint('top');
  });
  RS.act('learn.flip', function (arg, el, e) {
    var it = curItem();
    if (!it || it.t !== 'fc' || S.flipped || tooSoon(e, tap.paint)) return;
    S.flipped = true;
    tap.flip = Date.now();
    keep(S);
    var flip = document.querySelector('#view .lrn-flip');
    if (!flip) { paint('top'); return; }
    flip.classList.add('is-flipped');
    setHidden(flip.querySelector('.is-front'), true);
    setHidden(flip.querySelector('.is-back'), false);
    focusEl('lrn-back');
    if (document.activeElement && document.activeElement.id !== 'lrn-back') {
      requestAnimationFrame(function () { if (S && S.flipped) focusEl('lrn-back'); });
    }
    RS.buzz(8);
    setTimeout(function () {
      if (!S || !S.flipped) return;
      var g = document.querySelector('#view .lrn-grades');
      if (g) bringIntoView(document.getElementById('lrn-back'), g);
    }, RS.reducedMotion() ? 0 : 260);
  });
  RS.act('learn.grade', function (g, el, e) {
    var it = curItem();
    if (!it || it.t !== 'fc' || !S.flipped || GRADES.indexOf(g) < 0 || tooSoon(e, tap.flip)) return;
    gradeCard(S, it, g);
    RS.buzz(8);
    paint('top');
  });
  // A new round on the same history entry ("Play again", "Keep reviewing"): the finished one is gone for good.
  function startOver(kind, params) {
    drop(S);
    S = startSession(kind, params);
    tagEntry(S);
    paint('top');
  }
  RS.act('learn.retry', function (arg, el, e) {
    if (!S || tooSoon(e, tap.paint)) return;
    if (S.kind === 'review' && S.params.ids) {
      var ids = reviewLeft(S).join(',');
      if (ids && ids !== S.params.ids) { RS.router.go('learn/review', { ids: ids }, { replace: true }); return; }
    }
    startOver(S.kind, S.params);
  });
  // This round's mistakes, in place of the round in history (Back from the review returns to Learn).
  RS.act('learn.review', function (arg, el, e) {
    if (!S || !S.done || tooSoon(e, tap.paint)) return;
    var ids = wrongKeys(S);
    if (ids.length) RS.router.go('learn/review', { ids: ids.join(',') }, { replace: true });
  });
  // Back to Learn: RS.router.back('learn') (core's nav.back), behind the double-tap guard.
  RS.act('learn.back', function (arg, el, e) {
    if (tooSoon(e, tap.paint)) return;
    RS.router.back('learn');
  });
  // From a finished session to the next one ('learn/flash?deck=duas'), likewise in its place.
  RS.act('learn.go', function (arg, el, e) {
    if (!arg || tooSoon(e, tap.paint)) return;
    RS.router.go(String(arg), null, { replace: true });
  });
  RS.act('learn.qt', function (v) {
    if (v !== 'tf' && v !== 'mcq') return;
    var all = ssRead();
    all.qt = v;
    ssWrite(all);
    RS.refresh();
  });

  /* ------------------------------------------------------------------ keyboard: T/F, 1-4/A-D, Space, Enter, arrows */
  // Latin layouts use the letter on the key (AZERTY's A is A); other layouts (Arabic, Urdu, Russian, Hindi, Bengali)
  // use the key's position, so the hints' T/F, A-D and 1-4 work everywhere. Native digits count as digits.
  var DIGIT0 = [0x30, 0x660, 0x6F0, 0x966, 0x9E6];
  function keyDigit(e) {
    var k = e.key || '';
    if (k.length === 1) {
      var c = k.charCodeAt(0);
      for (var i = 0; i < DIGIT0.length; i++) if (c >= DIGIT0[i] && c <= DIGIT0[i] + 9) return c - DIGIT0[i];
      if (/[a-z]/i.test(k)) return -1;
    }
    var m = /^(?:Digit|Numpad)(\d)$/.exec(e.code || '');
    return m ? +m[1] : -1;
  }
  function keyLetter(e) {
    var k = e.key || '';
    if (k.length === 1 && /[a-z]/i.test(k)) return k.toLowerCase();
    var m = /^Key([A-Z])$/.exec(e.code || '');
    return m ? m[1].toLowerCase() : '';
  }
  function moveRadio(target, dir) {
    var radios = RS.$$('#view .lrn-opt:not(:disabled)');
    var i = radios.indexOf(target);
    if (i < 0 || !radios.length) return;
    var j = dir === 'first' ? 0 : dir === 'last' ? radios.length - 1 : (i + dir + radios.length) % radios.length;
    radios.forEach(function (b, k) { b.setAttribute('tabindex', k === j ? '0' : '-1'); });
    focusEl(radios[j]);
  }
  document.addEventListener('keydown', function (e) {
    var it = curItem();
    if (!it || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (RS.router.current().route.indexOf('learn/') !== 0) return;
    if ((RS.sheet && RS.sheet.isOpen && RS.sheet.isOpen()) || document.querySelector('#dialog-root.is-open')) return;
    var tg = e.target, tag = tg && tg.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (tg && tg.isContentEditable)) return;
    var onControl = !!(tg && tg.closest && tg.closest('a[href], button, [role="radio"], [role="button"]'));
    var k = e.key || '';
    function run(name, arg) { e.preventDefault(); if (!e.repeat) RS.runAct(name, arg); }    // a held key acts once
    if (it.t !== 'fc' && S.phase === 'a') {
      if (k === 'Enter' && !onControl) run('learn.next');
      return;
    }
    if (it.t === 'tf') {
      var l = keyLetter(e);
      if (l === 't' || l === 'f') run('learn.tf', l);
    } else if (it.t === 'mcq') {
      var idx = keyDigit(e) - 1;
      if (idx < 0) { var lt = keyLetter(e); idx = lt ? 'abcd'.indexOf(lt) : -1; }
      if (idx >= 0 && idx < mcqOpts(it.id).length) { run('learn.mcq', String(idx)); return; }
      if (tg && tg.classList && tg.classList.contains('lrn-opt')) {
        var rtl = RS.isRTL(), step = null;
        if (k === 'ArrowDown' || k === (rtl ? 'ArrowLeft' : 'ArrowRight')) step = 1;
        else if (k === 'ArrowUp' || k === (rtl ? 'ArrowRight' : 'ArrowLeft')) step = -1;
        else if (k === 'Home') step = 'first';
        else if (k === 'End') step = 'last';
        if (step !== null) { e.preventDefault(); moveRadio(tg, step); }
      }
    } else if (it.t === 'fc') {
      if (!S.flipped) {
        if ((k === ' ' || k === 'Enter') && !onControl) run('learn.flip');
      } else {
        var gi = keyDigit(e) - 1;
        if (gi >= 0 && gi < GRADES.length) run('learn.grade', GRADES[gi]);
      }
    }
  });

  /* ------------------------------------------------------------------ Learn home */
  function streakLabel(dv) {
    if (dv.doneToday) return L('hero.streakDone');
    if (dv.streak > 0) return L('hero.streakKeep');
    if (dv.best > 0) return L('hero.streakLost');
    return L('hero.streakNew');
  }
  function heroCta(dv, o) {
    if (!dv.doneToday) {
      return dv.n > 0 ? { eyebrow: L('cta.contEyebrow', { n: num(dv.n), total: num(dv.total) }), text: L('cta.cont'), href: '#/learn/daily' }
        : { eyebrow: L('cta.startEyebrow'), text: L('cta.start'), href: '#/learn/daily' };
    }
    var due = mostDueDeck(o);
    return due ? { eyebrow: L('cta.doneEyebrow'), text: L('cta.review'), href: RS.router.href('learn/flash', { deck: due }) }
      : { eyebrow: L('cta.doneEyebrow'), text: L('cta.more'), href: RS.router.href('learn/quiz', { cat: 'all' }) };
  }
  function introP(key) { return '<p class="lrn-intro">' + esc(L(key)) + '</p>'; }
  // A topic or deck the content team has announced but not filled yet shows as a plain "Coming soon" row.
  function soonRow(icon, title) { return RS.ui.row({ icon: icon, title: title, sub: L('soon'), cls: 'lrn-soon' }); }
  function topicRows(pool, best, type) {
    var route = type === 'tf' ? 'learn/quiz' : 'learn/mcq';
    var list = cats(), rows = [];
    if (!findBy(list, 'all')) list = [{ id: 'all', icon: 'shuffle' }].concat(list);
    list.forEach(function (c) {
      var n = c.id === 'all' ? pool.length : pool.filter(function (q) { return q.cat === c.id; }).length;
      var icon = c.icon || catIcon(c.id), name = catName(c.id, type);
      if (!n) { if (c.id !== 'all') rows.push(soonRow(icon, name)); return; }
      rows.push(RS.ui.row({
        icon: icon, title: name, sub: LN('n.questions', n),
        value: hasOwn.call(best, c.id) ? L('bestPct', { pct: RS.fmt.pct(best[c.id]) }) : '',
        href: RS.router.href(route, { cat: c.id }), chevron: true
      }));
    });
    return rows;
  }
  function quizType() { return ssRead().qt === 'mcq' ? 'mcq' : 'tf'; }
  // True or false and multiple choice share the topics, so one list with a switch instead of two long cards.
  function quizCard(o) {
    var tf = tfAll(), mcq = mcqAll();
    var head = { kicker: { icon: 'circle-help', text: L('quiz.kicker') }, title: L('quiz.title') };
    if (!tf.length && !mcq.length) {
      head.body = RS.ui.empty({ icon: 'circle-help', title: L('e.tfTitle'), body: L('e.quizAll') });
      return RS.ui.card(head);
    }
    var type = quizType(), pool = type === 'tf' ? tf : mcq;
    var seg = RS.ui.seg([{ value: 'tf', text: L('tf.title') }, { value: 'mcq', text: L('mcq.title') }], type, { act: 'learn.qt', label: L('quiz.type'), cls: 'lrn-qt' });
    head.body = seg + (pool.length ? introP(type + '.intro') + RS.ui.list(topicRows(pool, type === 'tf' ? getTfBest() : o.mcqBest, type))
      : RS.ui.empty({ icon: 'circle-help', title: L('e.tfTitle'), body: L(type === 'tf' ? 'e.tfAll' : 'e.mcqAll') }));
    return RS.ui.card(head);
  }
  function flashCard(o) {
    var head = { kicker: { icon: 'layers', text: L('fc.kicker') }, title: L('fc.title') };
    var decks = decksAll();
    if (!decks.some(function (d) { return deckIds(d).length; })) {
      head.body = RS.ui.empty({ icon: 'layers', title: L('e.deckTitle'), body: L('e.decks') });
      return RS.ui.card(head);
    }
    head.body = introP('fc.intro') + RS.ui.list(decks.map(function (d) {
      var k = deckStats(o, d);
      if (!k.total) return soonRow(d.icon || 'layers', deckName(d.id));
      var parts = [];
      if (k.due) parts.push(LN('n.due', k.due));
      if (k.newLeft) parts.push(LN('n.new', k.newLeft));
      if (!parts.length) parts.push(L('fc.caughtUp'));
      parts.push(LN('n.cards', k.total));
      return RS.ui.row({
        icon: d.icon || 'layers', title: deckName(d.id), subHtml: RS.ui.meta(parts.map(esc)),
        href: RS.router.href('learn/flash', { deck: d.id }), chevron: true
      });
    }));
    return RS.ui.card(head);
  }
  function mistakesCard(n) {
    return RS.ui.card({
      kicker: { icon: 'rotate-ccw', text: L('mis.kicker') }, title: L('mis.title'),
      body: RS.ui.list([RS.ui.row({ icon: 'circle-alert', title: L('mis.row'), sub: LN('n.toReview', n), href: '#/learn/review', chevron: true })])
    });
  }
  function statsCard(st, o) {
    return RS.ui.card({
      kicker: { icon: 'chart-column', text: L('stats.kicker') },
      body: RS.ui.metrics([{ label: L('m.answered'), value: num(st.ans) }, { label: L('m.correct'), value: num(st.cor) },
        { label: L('m.mastered'), value: num(masteredAll(o)) }])
    });
  }
  var homeDate = '';
  function renderHome(view) {
    RS.topbar({ title: RS.t('nav.learn'), sub: L('home.sub') });
    homeDate = today();
    var o = getL(), st = getStats(), dv = dailyView(o), due = dueAll(o), mis = liveMistakes(o).length;
    var h = [hero({
      id: 'lrn-hero',
      kicker: { icon: 'target', text: L('hero.kicker') },
      number: num(dv.streak), unit: LN('unit.days', dv.streak), label: streakLabel(dv),
      ring: { pct: dv.n / Math.max(1, dv.total) * 100, text: frac(dv.n, dv.total), sub: L('ring.today'), label: L('ring.goal', { n: num(dv.n), total: num(dv.total) }) },
      metrics: [{ label: L('m.accuracy'), value: accuracyText(st) }, { label: L('m.bestStreak'), value: num(dv.best) },
        { label: L('m.due'), value: num(due) }],
      cta: heroCta(dv, o)
    })];
    // what needs doing comes first: mistakes to review and decks with due cards sit right under the hero
    if (mis) h.push(mistakesCard(mis));
    if (due) h.push(flashCard(o));
    h.push(quizCard(o));
    if (!due) h.push(flashCard(o));
    h.push(statsCard(st, o));
    view.innerHTML = h.join('');
  }

  /* ------------------------------------------------------------------ routes */
  RS.router.register('learn', { title: function () { return RS.t('nav.learn'); }, render: renderHome });
  KINDS.forEach(function (kind) {
    RS.router.register('learn/' + kind, {
      tab: 'learn',
      nav: false,
      parent: 'learn',
      title: function (p) { return titleFor(kind, p || {}); },
      render: function (view, params) {
        var p = params || {};
        if (!S || S.key !== sessionKey(kind, p)) S = roundFor(kind, p);
        tagEntry(S);
        keep(S);
        tap.paint = Date.now();
        topbarFor(S);
        view.innerHTML = sessionHtml(S);
      },
      onHide: function () { if (S) keep(S); S = null; }
    });
  });

  // Cloud sync can replace rs-learn / rs-quiz-*; a new day changes Today's 5 and due cards.
  RS.on('sync', function () { if (RS.router.current().route === 'learn') RS.refresh(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && homeDate && homeDate !== today() && RS.router.current().route === 'learn') RS.refresh();
  });

  /* ------------------------------------------------------------------ public hooks (CONTRACT §8) */
  RS.learn = {
    summary: function () {
      var o = getL(), st = getStats(), dv = dailyView(o);
      return {
        streak: dv.streak, bestStreak: dv.best, dueCards: dueAll(o),
        accuracy: st.ans ? Math.round(st.cor / st.ans * 100) : 0, answered: st.ans, correct: st.cor,
        mastered: masteredAll(o), dailyDone: dv.doneToday, dailyProgress: dv.n
      };
    },
    dueCount: function () { return dueAll(getL()); },
    dailyDone: function () { return dailyView(getL()).doneToday; }
  };
})();
