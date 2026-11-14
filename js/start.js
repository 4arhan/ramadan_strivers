/* =====================================================================================================
   Ramadan Strivers v8 — start.js. "Start here": the basics for people who are new to Islam (and older children).
   - My first Ramadan: short chapters (what Ramadan is, who fasts, what breaks the fast, fasting among non-Muslim
     family, a first visit to a mosque ...). Chapters read are remembered on this device.
   - How to pray: wudu and the prayer step by step, with a pictogram of each position.
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
  function aiOn() { return !!(RS.cloud && typeof RS.cloud.aiAvailable === 'function' && RS.cloud.aiAvailable()); }

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
  var POSE = {
    stand: '<circle cx="32" cy="10" r="5"/><path d="M32 15v25M32 40l-5 18M32 40l5 18M25 27h14"/>',
    hands: '<circle cx="32" cy="10" r="5"/><path d="M32 15v25M32 40l-5 18M32 40l5 18M32 21l-9-9M32 21l9-9"/>',
    ruku: '<circle cx="15" cy="27" r="5"/><path d="M20 29h21M41 29v29M27 29v15"/>',
    rise: '<circle cx="32" cy="10" r="5"/><path d="M32 15v25M32 40l-5 18M32 40l5 18M32 21l-6 15M32 21l6 15"/>',
    sujood: '<circle cx="13" cy="50" r="5"/><path d="M18 48l19-12M37 36l4 19M41 55l14 2M21 47l-4 10"/><path d="M6 58h52" opacity=".35"/>',
    sit: '<circle cx="29" cy="23" r="5"/><path d="M29 28l2 19M31 47l15 2M46 49l-12 6M30 36l11 9"/><path d="M6 58h52" opacity=".35"/>',
    salam: '<circle cx="29" cy="23" r="5"/><path d="M29 28l2 19M31 47l15 2M46 49l-12 6M30 36l11 9M40 20l5 3-5 3"/><path d="M6 58h52" opacity=".35"/>'
  };
  function pose(k) { return '<svg class="st-pose" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' + (POSE[k] || POSE.stand) + '</svg>'; }
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
      return '<li class="st-step is-pose">' + pose(s.pose) + '<div><h3 class="st-step-t">' + esc(t('st.p.' + s.id + '.t')) + '</h3><p class="st-p">' + esc(t('st.p.' + s.id + '.x')) + '</p>' + words + '</div></li>';
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
