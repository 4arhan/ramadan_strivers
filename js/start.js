/* =====================================================================================================
   Ramadan Strivers v8 — start.js. "Start here": the basics for people who are new to Islam (and older children).
   - My first Ramadan: short chapters (what Ramadan is, who fasts, what breaks the fast, fasting among non-Muslim
     family, a first visit to a mosque ...). Chapters read are remembered on this device.
   - How to pray: wudu and the prayer step by step, with a drawn picture of a man in each position.
   - Words explained: the Arabic terms the app uses; a term can also be opened from a deed in the checklist.
   - Ask a question: the server's AI helper for basics, when the server has it; never a ruling.
   Structure (ids, icons, references, Arabic) is in js/start-data.js (RS.startData), generated with the English text
   (i18n-src/en/start.json) by scripts/build-start.js from content/start.json.
   Routes   learn/start · learn/start/guide · learn/start/read?c=<id> · learn/start/pray · learn/start/words
   Actions  st.term (arg termId) · st.read (arg chapterId) · st.ask · st.askSend · st.filter
   API      RS.start = {hubRowHtml(), todayCardHtml(), termFor(deedId), termLinkHtml(deedId)}
   Storage  rs-start {read: {chapterId: 1}} (this device)
   ===================================================================================================== */
(function () {
  'use strict';
  var RS = window.RS;
  if (!RS || !RS.router) return;
  var ui = RS.ui, t = RS.t, tn = RS.tn, esc = RS.esc;
  function D() { return RS.startData || { guide: [], pray: { intro: 0, wudu: [], wuduRefs: [], steps: [], refs: [] }, terms: [] }; }
  function nf(n) { return RS.fmt.n(n, { maximumFractionDigits: 0 }); }
  function state() { var s = RS.store.get('rs-start', null); return s && typeof s === 'object' && s.read && typeof s.read === 'object' ? s : { read: {} }; }
  function refsHtml(refs) {
    refs = (refs || []).filter(function (r) { return r && r.ref; });
    return refs.length ? '<div class="st-refs">' + ui.meta(refs.map(function (r) { return ui.ref({ ref: r.ref, url: r.url, grade: r.grade || '' }); })) + '</div>' : '';
  }
  function paras(prefix, n) { var h = ''; for (var i = 1; i <= n; i++) if (RS.has(prefix + i)) h += '<p class="st-p">' + esc(t(prefix + i)) + '</p>'; return h; }
  function aiOn() { return (!RS.org || RS.org.flag('ask')) && !!(RS.cloud && typeof RS.cloud.aiAvailable === 'function' && RS.cloud.aiAvailable()); }

  /* ------------------------------------------------------------------ terms */
  // Deeds whose name is (or contains) a term from the list.
  var DEED_TERM = { tarawih: 'tarawih', witr: 'witr', tahajjud: 'tahajjud', duha: 'duha', istighfar: 'istighfar', 'istighfar-sleep': 'istighfar', salawat: 'salawat',
    'morning-adhkar': 'adhkar', 'evening-adhkar': 'adhkar', 'night-adhkar': 'adhkar', 'quran-reflection': 'tadabbur', intention: 'ikhlas', riya: 'riya', 'no-riya': 'riya',
    accountability: 'muhasaba', 'no-backbiting': 'gheebah', 'laylat-qadr': 'laylatul-qadr', 'extra-dua': 'laylatul-qadr', itikaf: 'itikaf', 'long-sujood': 'sujood',
    'night-charity': 'sadaqah', 'charity-given': 'sadaqah', 'dua-iftar': 'iftar', 'fed-fasting': 'iftar', fajr: 'fajr', dhuhr: 'dhuhr', asr: 'asr', maghrib: 'maghrib', isha: 'isha',
    'fajr-sunnah': 'sunnah', 'dhuhr-sunnah-before': 'sunnah', 'dhuhr-sunnah-after': 'sunnah', 'maghrib-sunnah': 'sunnah', 'isha-sunnah': 'sunnah', 'dua-night': 'dua', 'dua-others': 'dua', 'dua-absence': 'dua' };
  function hasTerm(id) { return !!id && D().terms.indexOf(id) >= 0 && RS.has('st.term.' + id + '.d'); }
  function termFor(deedId) { var id = DEED_TERM[deedId]; return hasTerm(id) ? id : ''; }
  function termLinkHtml(deedId) {
    var id = termFor(deedId);
    return id ? ui.linkAction({ text: t('st.whatIs', { term: t('st.term.' + id + '.n') }), act: 'st.term', arg: id, icon: 'circle-help' }) : '';
  }
  RS.act('st.term', function (id) {
    if (!hasTerm(id)) return;
    RS.sheet.open({ title: t('st.term.' + id + '.n'), body: '<p class="st-p">' + esc(t('st.term.' + id + '.d')) + '</p>' +
      '<div class="mt-4">' + ui.btn(t('st.words.all'), { act: 'nav.go', arg: 'learn/start/words', variant: 'secondary', block: true, icon: 'book-open' }) + '</div>' });
  });

  /* ------------------------------------------------------------------ hub */
  function hubRows() {
    var d = D(), read = Object.keys(state().read).filter(function (k) { return d.guide.some(function (g) { return g.id === k; }); }).length;
    var rows = [];
    if (d.guide.length) rows.push(ui.row({ icon: 'moon', title: t('st.guide.title'), sub: t('st.guide.sub', { read: nf(read), total: nf(d.guide.length) }), href: RS.router.href('learn/start/guide'), chevron: true }));
    if (d.pray.steps.length) rows.push(ui.row({ icon: 'footprints', title: t('st.pray.title'), sub: t('st.pray.sub'), href: RS.router.href('learn/start/pray'), chevron: true }));
    if (d.terms.length) rows.push(ui.row({ icon: 'book-open', title: t('st.words.title'), sub: tn('st.words.sub', d.terms.length), href: RS.router.href('learn/start/words'), chevron: true }));
    if (aiOn()) rows.push(ui.row({ icon: 'message-circle', title: t('st.ask.title'), sub: t('st.ask.sub'), act: 'st.ask', chevron: true }));
    return rows;
  }
  function renderHub(view) {
    RS.topbar({ title: t('st.title'), back: 'learn' });
    view.innerHTML = ui.hero({ kicker: { icon: 'sprout', text: t('st.kicker') }, title: t('st.heroTitle'), text: t('st.heroText') }) +
      ui.card({ body: ui.list(hubRows(), { label: t('st.title') }) }) + ui.note(t('st.disclaimer'), { icon: 'info', tone: 'plain' });
  }
  // A row for the Learn screen (everyone) and a card for Today (level "new" only).
  function hubRowHtml() {
    if (!D().guide.length) return '';
    return ui.card({ cls: 'is-tight', id: 'st-row', body: ui.list([ui.row({ icon: 'sprout', title: t('st.title'), sub: t('st.rowSub'), href: RS.router.href('learn/start'), chevron: true })]) });
  }
  function todayCardHtml() {
    if (RS.settings.level !== 'new' || !D().guide.length) return '';
    var d = D(), st = state(), next = d.guide.filter(function (g) { return !st.read[g.id]; })[0];
    return ui.card({ kicker: { icon: 'sprout', text: t('st.kicker') }, cls: 'st-today', id: 'st-today',
      body: ui.list([next ? ui.row({ icon: next.icon || 'book-open', title: t('st.g.' + next.id + '.t'), sub: t('st.today.next'), href: RS.router.href('learn/start/read', { c: next.id }), chevron: true })
        : ui.row({ icon: 'book-check', title: t('st.today.done'), sub: t('st.rowSub'), href: RS.router.href('learn/start'), chevron: true }),
        ui.row({ icon: 'footprints', title: t('st.pray.title'), sub: t('st.pray.sub'), href: RS.router.href('learn/start/pray'), chevron: true })]) });
  }

  /* ------------------------------------------------------------------ my first Ramadan */
  function renderGuide(view) {
    RS.topbar({ title: t('st.guide.title'), back: 'learn/start' });
    var st = state();
    view.innerHTML = ui.card({ body: '<p class="st-p">' + esc(t('st.guide.intro')) + '</p>' + ui.list(D().guide.map(function (g, i) {
      return ui.row({ lead: ui.check(!!st.read[g.id]), title: t('st.g.' + g.id + '.t'), sub: t('st.guide.chapter', { n: nf(i + 1) }), href: RS.router.href('learn/start/read', { c: g.id }), chevron: true });
    }), { label: t('st.guide.title') }) });
  }
  function renderRead(view, params) {
    var d = D(), i = -1;
    d.guide.forEach(function (g, k) { if (g.id === (params && params.c)) i = k; });
    if (i < 0) { RS.router.go('learn/start/guide'); return; }
    var g = d.guide[i], next = d.guide[i + 1];
    RS.topbar({ title: t('st.guide.title'), sub: t('st.guide.chapter', { n: nf(i + 1) }), back: 'learn/start/guide' });
    view.innerHTML = '<article class="card st-read"><h2 class="st-h">' + esc(t('st.g.' + g.id + '.t')) + '</h2>' + paras('st.g.' + g.id + '.p', g.n) + refsHtml(g.refs) + '</article>' +
      ui.note(t('st.disclaimer'), { icon: 'info', tone: 'plain' }) +
      '<div class="btn-row mt-4">' + (next ? ui.btn(t('st.guide.next'), { act: 'st.read', arg: g.id + '>' + next.id, icon: 'arrow-right', block: true })
        : ui.btn(t('st.guide.finish'), { act: 'st.read', arg: g.id + '>', icon: 'check', block: true })) + '</div>';
    var st = state();
    if (!st.read[g.id]) { st.read[g.id] = 1; RS.store.set('rs-start', st); }
  }
  RS.act('st.read', function (arg) {
    var p = String(arg || '').split('>');
    if (p[1]) RS.router.go('learn/start/read', { c: p[1] }); else RS.router.go('learn/start');
  });

  /* ------------------------------------------------------------------ how to pray */
  // The pictures: a man in a thobe and cap in each position of the prayer, drawn as plain shapes. No face is drawn.
  // Each shape takes its colour from a class that css/tools.css sets: r thobe · arm sleeve · f fold · s skin ·
  // fin finger · h hair and beard · c cap · m mat · m2 its stripe · sh shadow · a movement.
  // He is drawn on a 120 by 120 field with the ground at y = 97 (pose() then enlarges the scene to fill the tile)
  // and keeps one size in every picture: head 8.4 in radius, shoulder to hip 26, hip to knee 16, knee to ankle 15.
  // In the side views he faces right, so the side we see is his right: the hand that points in the tashahhud is
  // his right hand, and in the salam his head is turned to his right. For that reason the pictures are never
  // mirrored, in right-to-left languages either.
  var ART = (function () {
    function shadow(cx, rx) { return '<ellipse class="sh" cx="' + cx + '" cy="97.3" rx="' + rx + '" ry="2.2"/>'; }
    function hand(x, y) { return '<circle class="s" cx="' + x + '" cy="' + y + '" r="3.4"/>'; }
    function arm(d) { return '<path class="arm" d="' + d + '"/>'; }
    var CAP = '<path class="c" d="M-8.9-2.4a8.9 8.5 0 0 1 17.8 0z"/></g>';
    // the head from the front: the beard round the chin, the cap on top
    function front(cx, cy) {
      return '<g transform="translate(' + cx + ' ' + cy + ')"><circle class="s" r="8.4"/><path class="h" d="M-8.3.8c.5 5.5 4 9.3 8.3 9.3s7.8-3.8 8.3-9.3c-2 3-4.8 4.4-8.3 4.4s-6.3-1.4-8.3-4.4z"/>' + CAP;
    }
    // the head from the side, looking right: the beard under the chin and the hair at the
    // nape tell which way. turn is in degrees clockwise (90 looks at the ground), flip looks left
    function side(cx, cy, turn, flip) {
      return '<g transform="translate(' + cx + ' ' + cy + ')' + (flip ? ' scale(-1 1)' : '') + (turn ? ' rotate(' + turn + ')' : '') + '"><circle class="s" r="8.4"/>' +
        '<path class="h" d="M-8.3-1.6c-.6 3.8.5 7 2.9 8.9c-.8-3.2-.7-6.2.3-8.9z"/><path class="h" d="M-1.8 2c.2 4.9 3 8 6.7 7.7c3.1-.3 4.7-3.6 3.4-7.9c-2.7 2.4-6.7 2.7-10.1.2z"/>' + CAP;
    }
    // standing, from the front: feet, neck, thobe and its placket
    var FRONT = '<path class="s" d="M49 97.4c0-3.3 2-5.4 4.9-5.4s4.9 2.1 4.9 5.4zM61.2 97.4c0-3.3 2-5.4 4.9-5.4s4.9 2.1 4.9 5.4z"/><path class="s" d="M56.6 29h6.8v8h-6.8z"/>' +
      '<path class="r" d="M55.4 34.6c-5.8.5-10.2 3.1-11.4 7.9l1.7 50.5h28.6l1.7-50.5c-1.2-4.8-5.6-7.4-11.4-7.9c-1 2-2.6 3-4.6 3s-3.6-1-4.6-3z"/><path class="f" d="M60 40.5v14"/>';
    // standing, from the side
    var SIDE = '<path class="s" d="M51.4 97.4c0-3.2 1.8-5.2 4.7-5.2h4.4c4 0 7.3 2.2 7.3 5.2z"/><path class="s" d="M55.3 29h6.6v8h-6.6z"/>' +
      '<path class="r" d="M50 93V44.4c0-5 3.5-8.8 8.1-8.8s8 3.8 8 8.8l.5 48.6z"/>';
    // sitting on the heels, from the side: the right foot stays upright behind him
    var SIT = '<path class="s" d="M36.6 97.4c-1.5-3.4-1.2-7.2.8-9.9l4.8 1.6c-1.2 2.9-1 5.7.4 8.3z"/><path class="s" d="M52.7 50.8h6.6v8h-6.6z"/>' +
      '<path class="r" d="M43.8 97.4c-2.8-5-1.9-11.2 2.8-15.3V66.4c0-5 3.5-8.8 8.1-8.8s8 3.8 8 8.8l.4 13.4l9.7 4.7c4 1.8 5.9 6 5.4 12.9z"/>';
    var LAP = arm('M55 64.5l2.6 12.5l8.4 7.4');
    return {
      // standing and facing the qibla, arms at the sides
      stand: shadow(60, 16) + FRONT + arm('M46.3 43c-2.3 6.2-3.4 13.2-3.7 21') + arm('M73.7 43c2.3 6.2 3.4 13.2 3.7 21') + hand(42.4, 68.2) + hand(77.6, 68.2) + front(60, 22.6),
      // the opening takbir: both hands raised beside the head, palms to the front
      hands: shadow(60, 16) + FRONT + arm('M46.3 43l-8.5 7.2l1.6-13.6') + arm('M73.7 43l8.5 7.2l-1.6-13.6') +
        '<rect class="s" x="36.2" y="23.6" width="6.4" height="9.6" rx="3.2"/><rect class="s" x="77.4" y="23.6" width="6.4" height="9.6" rx="3.2"/><path class="fin" d="M42.2 31.4l3-2.8M77.8 31.4l-3-2.8"/>' + front(60, 22.6),
      // standing for the recitation, the right hand over the left
      recite: shadow(60, 16) + FRONT + arm('M73.7 43l3 14.8L58.5 60.4') + arm('M46.3 43l-3 14.8L60.6 59.6') + hand(63.8, 59.4) + front(60, 22.6),
      // bowing: the back level, the hands on the knees
      ruku: shadow(47, 13) + '<path class="s" d="M39.2 97.4c0-3.2 1.8-5.2 4.7-5.2h4.4c4 0 7.3 2.2 7.3 5.2z"/><path class="s" d="M73 59.4h8v6.4h-8z"/>' +
        '<path class="r" d="M38.4 93V63.2c0-5.2 3.9-9.2 9.2-9.2h22.2c4.7 0 8.2 3.6 8.2 8.2s-3.5 8.2-8.2 8.2H55.2c-1 0-1.6.6-1.6 1.6L53.4 93z"/>' +
        arm('M69.5 63.4L53.2 77.4') + hand(50.6, 79.6) + side(85, 62.6, 78),
      // standing up straight again after bowing
      rise: shadow(59, 12) + SIDE + arm('M58.2 43.5l.5 20.5') + hand(58.8, 68.2) + side(58.8, 22.6, 8),
      // prostrating: forehead and nose, both palms, both knees and the toes on the ground
      sujood: shadow(58, 34) + '<path class="s" d="M27.6 97.4c-1.8-3.8-1.5-8 .7-11l5.2 1.8c-1.4 3.2-1.2 6.3.5 9.2z"/><path class="s" d="M72 84.8l8 1.4l-1 6.6l-8-1.4z"/>' +
        '<path class="r" d="M32.8 97.4c-.9-9.4 2-21.4 9.7-25.9c3.5-2 7.9-1.8 11 .2l19 9.3c4 2 5.5 6 4 9.5c-.7 1.7-2 2.9-3.9 3.3l-13.6-6.3l-1.4 9.9z"/>' +
        arm('M70 87.4l-3.2 4.8l4.2 2.6') + '<ellipse class="s" cx="73.4" cy="95.6" rx="3.6" ry="2"/>' + side(87, 89, 100),
      // sitting between the two prostrations, hands on the thighs
      sit: shadow(60, 22) + SIT + LAP + hand(68.6, 86.4) + side(56.2, 44.4, 8),
      // sitting for the tashahhud, the right forefinger pointing
      tashahhud: shadow(60, 22) + SIT + LAP + '<path class="fin" d="M70 85.8l6.2-2.8"/>' + hand(68.6, 86.4) + side(56.2, 44.4, 8),
      // the salam: the head turned to the right, then to the left
      salam: shadow(60, 30) + '<path class="s" d="M56.6 50.8h6.8v8h-6.8z"/>' +
        '<path class="r" d="M55.4 56.4c-5.8.5-10.2 3.1-11.4 7.9l-2.3 16.2c-5.7 3.3-8.8 9.3-8.4 16.9h53.4c.4-7.6-2.7-13.6-8.4-16.9l-2.3-16.2c-1.2-4.8-5.6-7.4-11.4-7.9c-1 2-2.6 3-4.6 3s-3.6-1-4.6-3z"/>' +
        '<path class="f" d="M60 84v13"/>' + arm('M46.3 64.8l-3.7 13.7l5.2 8.3') + arm('M73.7 64.8l3.7 13.7l-5.2 8.3') + hand(49.2, 89.4) + hand(70.8, 89.4) + side(60, 44.4, 0, true) +
        '<path class="a" d="M43.5 31.5a18.5 18.5 0 0 1 33 0M42.7 26.3l.8 5.2l5-1.6M77.3 26.3l-.8 5.2l-5-1.6"/>'
    };
  })();
  function pose(k) {
    return '<svg class="st-art" viewBox="0 0 120 120" aria-hidden="true" focusable="false"><g transform="matrix(1.16 0 0 1.16 -9.6 -7.5)">' +
      '<rect class="m" x="15" y="97" width="90" height="7" rx="3.5"/><path class="m2" d="M22 100.5h76"/>' + (ART[k] || ART.stand) + '</g></svg>';
  }
  function renderPray(view) {
    RS.topbar({ title: t('st.pray.title'), back: 'learn/start' });
    var p = D().pray, h = [];
    h.push(ui.card({ kicker: { icon: 'footprints', text: t('st.pray.kicker') }, body: paras('st.pr.i', p.intro) }));
    h.push(ui.card({ kicker: { icon: 'droplets', text: t('st.pray.wudu') }, body: '<ol class="st-steps">' + p.wudu.map(function (id, i) {
      return '<li class="st-step"><span class="st-step-n" aria-hidden="true">' + esc(nf(i + 1)) + '</span><div><h3 class="st-step-t">' + esc(t('st.w.' + id + '.t')) + '</h3><p class="st-p">' + esc(t('st.w.' + id + '.x')) + '</p></div></li>';
    }).join('') + '</ol>' + refsHtml(p.wuduRefs) }));
    h.push(ui.card({ kicker: { icon: 'clock', text: t('st.pray.steps') }, body: '<ol class="st-steps">' + p.steps.map(function (s) {
      var words = '';
      if (s.arabic) words += ui.arabic(s.arabic, { cls: 'st-ar' });
      if (s.translit) words += '<p class="st-tr" lang="ar-Latn" dir="ltr">' + esc(s.translit) + '</p>';
      if (RS.has('st.p.' + s.id + '.m') && t('st.p.' + s.id + '.m')) words += '<p class="st-mean">' + esc(t('st.p.' + s.id + '.m')) + '</p>';
      // the picture beside what to do; what to say gets the full width underneath
      return '<li class="st-step is-pose">' + pose(s.pose) + '<div><h3 class="st-step-t">' + esc(t('st.p.' + s.id + '.t')) + '</h3><p class="st-p">' + esc(t('st.p.' + s.id + '.x')) + '</p></div>' +
        (words ? '<div class="st-say">' + words + '</div>' : '') + '</li>';
    }).join('') + '</ol>' + refsHtml(p.refs) }));
    h.push(ui.note(t('st.pr.note'), { icon: 'info', tone: 'plain' }));
    view.innerHTML = h.join('');
  }

  /* ------------------------------------------------------------------ words explained */
  function wordsList(q) {
    q = String(q || '').trim().toLowerCase();
    var ids = D().terms.filter(function (id) { return RS.has('st.term.' + id + '.n'); }).filter(function (id) {
      return !q || t('st.term.' + id + '.n').toLowerCase().indexOf(q) >= 0 || t('st.term.' + id + '.d').toLowerCase().indexOf(q) >= 0 || id.indexOf(q) >= 0;
    });
    if (!ids.length) return '<p class="caption mt-3">' + esc(t('st.words.none')) + '</p>';
    return '<dl class="st-words">' + ids.map(function (id) { return '<div class="st-word"><dt>' + esc(t('st.term.' + id + '.n')) + '</dt><dd>' + esc(t('st.term.' + id + '.d')) + '</dd></div>'; }).join('') + '</dl>';
  }
  function renderWords(view) {
    RS.topbar({ title: t('st.words.title'), back: 'learn/start' });
    view.innerHTML = ui.card({ body: ui.field({ id: 'st-q', type: 'search', label: t('st.words.search'), placeholder: t('st.words.ph'), actInput: 'st.filter', autocomplete: 'off', maxlength: 40 }) +
      '<div id="st-words" aria-live="polite">' + wordsList('') + '</div>' });
  }
  RS.act('st.filter', function (v) { var el = document.getElementById('st-words'); if (el) el.innerHTML = wordsList(v); });

  /* ------------------------------------------------------------------ ask a question (server AI, basics only) */
  function openAsk() {
    if (!aiOn()) { RS.toast(t('ai.off'), { tone: 'error' }); return; }
    RS.sheet.open({ title: t('st.ask.title'), cls: 'st-ask-sheet',
      body: '<p class="st-p">' + esc(t('st.ask.body')) + '</p><form id="st-ask-form" data-act-submit="st.askSend" novalidate>' +
        ui.textarea({ id: 'st-ask-q', label: t('st.ask.label'), placeholder: t('st.ask.ph'), maxlength: 300, rows: 3 }) + '</form>' +
        '<div id="st-ask-a" class="mt-3" aria-live="polite"></div>' + ui.note(t('ai.note'), { icon: 'info', tone: 'plain', cls: 'mt-3' }),
      actions: [{ text: t('core.cancel'), act: 'sheet.close' }, { text: t('st.ask.send'), variant: 'primary', type: 'submit', attrs: { form: 'st-ask-form' } }] });
  }
  var askSeq = 0;
  RS.act('st.ask', openAsk);
  RS.act('st.askSend', function () {
    var q = document.getElementById('st-ask-q'), out = document.getElementById('st-ask-a'), text = q ? String(q.value || '').trim() : '';
    if (!out || text.length < 5) { if (q) q.focus(); return; }
    var seq = ++askSeq;
    out.innerHTML = ui.loading(t('ai.thinking'));
    var API = String(window.RS_API_BASE || '').replace(/\/+$/, '');
    fetch(API + '/api/ai/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: text.slice(0, 300), lang: RS.lang(), level: RS.settings.level === 'kids' ? 'kids' : 'new' }) })
      .then(function (r) { if (!r.ok) throw new Error('ask'); return r.json(); })
      .then(function (j) {
        if (seq !== askSeq) return;
        var parts = String((j && j.text) || '').split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean);
        out.innerHTML = parts.length ? parts.map(function (x) { return '<p class="st-p">' + esc(x) + '</p>'; }).join('') : '<p class="caption">' + esc(t('ai.off')) + '</p>';
      }, function () { if (seq === askSeq) out.innerHTML = '<p class="caption">' + esc(t('ai.off')) + '</p>'; });
  });

  var title = function (k) { return function () { return t(k); }; };
  RS.router.register('learn/start', { tab: 'learn', parent: 'learn', title: title('st.title'), render: renderHub });
  RS.router.register('learn/start/guide', { tab: 'learn', parent: 'learn/start', title: title('st.guide.title'), render: renderGuide });
  RS.router.register('learn/start/read', { tab: 'learn', parent: 'learn/start/guide', title: title('st.guide.title'), render: renderRead });
  RS.router.register('learn/start/pray', { tab: 'learn', parent: 'learn/start', title: title('st.pray.title'), render: renderPray });
  RS.router.register('learn/start/words', { tab: 'learn', parent: 'learn/start', title: title('st.words.title'), render: renderWords });

  RS.start = { hubRowHtml: hubRowHtml, todayCardHtml: todayCardHtml, termFor: termFor, termLinkHtml: termLinkHtml };
})();
