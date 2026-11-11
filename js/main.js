/* =====================================================================================================
   Ramadan Strivers v8 — main.js (foundation). Boot sequence (CONTRACT §6), shell labels, v7 query
   parameters, service worker, and the hidden design-review route #/styleguide.
   Boot: settings → theme → lang/dir + script font → lang file (if not en) → shell labels → emit 'boot' →
   query params (emit 'params') → router.start() → service worker.
   Modules register their routes while loading or in RS.on('boot', …); both happen before router.start().
   ===================================================================================================== */
(function () {
  'use strict';
  var RS = window.RS;
  if (!RS || !RS.router) return;

  var NAV_ICONS = { today: 'circle-check', quran: 'book-open', learn: 'graduation-cap', compete: 'trophy', me: 'user' };

  /* ------------------------------------------------------------------ shell */
  function labelShell() {
    RS.$$('[data-nav]').forEach(function (a) {
      var tab = a.getAttribute('data-nav');
      var label = RS.t('nav.' + tab);
      a.setAttribute('aria-label', label);
      a.innerHTML = RS.icon(NAV_ICONS[tab] || 'circle', { size: 22 }) + '<span class="nav-label" aria-hidden="true">' + RS.esc(label) + '</span>';
    });
    var nav = document.getElementById('nav');
    if (nav) nav.setAttribute('aria-label', RS.t('nav.label'));
    var skip = RS.$('.skip-link');
    if (skip) skip.textContent = RS.t('core.skip');
    fitNav();
  }
  // The active tab shows its label in the mint pill. A label that does not fit at this width and in this language
  // (e.g. long translations at 320px) is hidden for that tab, which then shows its icon only; the link keeps its
  // aria-label. Never an ellipsis. Measured for every tab after labelling, on resize and when fonts arrive.
  function fitNav() {
    var nav = document.getElementById('nav');
    var items = RS.$$('.nav-item', nav || document);
    if (!nav || !items.length) return;
    var active = items.filter(function (a) { return a.classList.contains('is-active'); });
    nav.classList.add('is-measuring');                       // no transitions while classes flip below
    items.forEach(function (a) { a.classList.remove('is-active', 'is-iconly'); });
    var over = items.map(function (a) {
      a.classList.add('is-active');
      var l = a.querySelector('.nav-label');
      var o = !!l && l.scrollWidth - l.clientWidth >= 1;
      a.classList.remove('is-active');
      return o;
    });
    items.forEach(function (a, i) { if (over[i]) a.classList.add('is-iconly'); });
    active.forEach(function (a) { a.classList.add('is-active'); });
    void nav.offsetWidth;
    nav.classList.remove('is-measuring');
  }
  // Tapping the tab you are already on scrolls back to the top (no hash change happens in that case).
  function onNavClick(e) {
    var a = e.target.closest && e.target.closest('[data-nav]');
    if (!a || a.getAttribute('aria-current') !== 'page' || RS.router.current().route !== a.getAttribute('data-nav')) return;
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: RS.reducedMotion() ? 'auto' : 'smooth' });
  }

  /* ------------------------------------------------------------------ v7 query parameters */
  // ?join=CODE&t=TOKEN (competition invite) · ?magic=TOKEN (email sign-in) · ?tab=<tab> (shortcuts, v7 names too)
  var TAB_ALIAS = { today: 'today', quran: 'quran', learn: 'learn', quiz: 'learn', compete: 'compete', me: 'me', progress: 'me', more: 'me' };
  function handleParams() {
    var qs;
    try { qs = new URLSearchParams(location.search); } catch (e) { return; }
    var p = {};
    ['join', 't', 'magic', 'tab', 'buddy'].forEach(function (k) { var v = qs.get(k); if (v != null && v !== '') p[k] = v; });
    if (!Object.keys(p).length) return;
    if (p.join) p.join = String(p.join).trim().toUpperCase();
    RS.bootParams = p;
    var target = null;
    if (p.tab && TAB_ALIAS[p.tab]) target = TAB_ALIAS[p.tab];
    if (p.join) target = 'compete';
    if (p.magic && !target) target = 'me';
    if (p.buddy && !target) target = 'me/buddies';
    ['join', 't', 'magic', 'tab', 'buddy'].forEach(function (k) { qs.delete(k); });
    var rest = qs.toString();
    var hash = target ? RS.router.href(target) : location.hash;
    history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + hash);
    RS.emit('params', p);
  }

  /* ------------------------------------------------------------------ service worker */
  function registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    var qs = new URLSearchParams(location.search);
    if (qs.get('sw') === '1') RS.store.setRaw('rs-dev-sw', '1');
    if (qs.get('sw') === '0') RS.store.del('rs-dev-sw');
    // Local development: no service worker (cache-first would hide edits) unless opted in with ?sw=1.
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !RS.store.raw('rs-dev-sw')) {
      navigator.serviceWorker.getRegistrations().then(function (regs) { regs.forEach(function (r) { r.unregister(); }); }).catch(function () {});
      return;
    }
    var register = function () {
      navigator.serviceWorker.register('/sw.js').catch(function (e) { console.warn('[RS] service worker registration failed', e); });
    };
    if (document.readyState === 'complete') register(); else window.addEventListener('load', register);
  }

  /* ------------------------------------------------------------------ boot */
  function fatal(err) {
    console.error('[RS] boot failed', err);
    var v = document.getElementById('view');
    if (v) v.innerHTML = RS.ui.empty({ icon: 'triangle-alert', title: RS.t('err.render.title'), body: RS.t('err.boot') });
  }
  function boot() {
    try {
      // Settings were loaded by core.js before the modules ran; re-reading them here could discard
      // in-memory changes a module made while loading, so boot only applies them.
      RS.applyTheme();
      RS.mountIcons();
      // Loads the saved or browser language. If it cannot be loaded the app runs in English; only a language the
      // person chose (not one detected from the browser) is worth a message, and their choice stays saved.
      RS.startLang().then(function (lang) {
        labelShell();
        RS.on('lang', labelShell);
        var nav = document.getElementById('nav');
        if (nav) nav.addEventListener('click', onNavClick);
        window.addEventListener('resize', RS.debounce(fitNav, 150));
        if (document.fonts) {
          if (document.fonts.ready) document.fonts.ready.then(fitNav);
          if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', RS.debounce(fitNav, 50));
        }
        RS.emit('boot');
        registerStyleguide();
        handleParams();
        RS.router.start();
        if (lang.failed && lang.explicit) {
          var inUse = RS.LANGS.filter(function (l) { return l.code === RS.lang(); })[0];
          RS.toast(RS.t('err.lang', { lang: inUse ? inUse.name : RS.lang() }), { tone: 'error' });
        }
        registerSW();
      }).catch(fatal);
    } catch (e) { fatal(e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* ------------------------------------------------------------------ #/styleguide (hidden, design review) */
  var sg = { toggle: true, seg: 'individuals', chip: 'all', check: true, rowToggle: false, rowCheck: true, day: 17 };
  var DUA = 'اللَّهُمَّ إِنَّكَ عَفُوٌّ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي';
  var TREND = [42, 55, 61, 48, 70, 76, 64, 81, 77, 85, 72, 88, 90, 79, 93, 86, 74, 91, 95, 89, 97, 84, 92, 100, 88, 79, 94, 96, 90, 37];

  function t(k, v) { return RS.t('core.sg.' + k, v); }
  function block(labelKey, html) { return '<div class="stack-sm"><p class="sg-label">' + RS.esc(t(labelKey)) + '</p>' + html + '</div>'; }

  function styleguideHtml() {
    var ui = RS.ui;
    var h = [];
    var hj = RS.hijri();

    h.push(ui.card({
      kicker: { icon: 'sliders-horizontal', text: t('theme') },
      body: '<div class="stack">' +
        ui.seg([{ value: 'system', text: RS.t('theme.system') }, { value: 'light', text: RS.t('theme.light') }, { value: 'dark', text: RS.t('theme.dark') }],
          RS.settings.theme, { act: 'theme.set', label: RS.t('theme.label') }) +
        ui.select({ id: 'sg-lang', label: RS.t('core.lang.label'), value: RS.lang(), act: 'lang.set',
          options: RS.LANGS.map(function (l) { return { value: l.code, text: l.name, lang: l.code, dir: l.dir }; }) }) +
        '<p class="caption">' + RS.esc(RS.fmt.hijri()) + ' · ' + RS.esc(RS.fmt.date(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })) + ' · ' +
        RS.esc(RS.fmt.time(new Date())) + ' · ' + RS.esc(RS.tn('core.sg.days', 1)) + ' / ' + RS.esc(RS.tn('core.sg.days', 5)) + '</p></div>'
    }));

    h.push(ui.section(t('colours')));
    h.push(ui.card({ body: '<div class="sg-grid">' + [
      ['paper', '--paper'], ['card', '--card'], ['card2', '--card-2'], ['ink', '--ink'], ['ink2', '--ink-2'], ['ink3', '--ink-3'],
      ['accent', '--accent'], ['soft', '--accent-soft'], ['danger', '--danger'], ['hero', 'hero'], ['mint', 'mint'], ['nav', 'nav']
    ].map(function (c) { return '<span class="sg-swatch"><i class="sg-c-' + c[0] + '"></i><span class="ltr">' + RS.esc(c[1]) + '</span></span>'; }).join('') + '</div>' }));

    h.push(ui.section(t('heroes')));
    h.push(ui.hero({
      kicker: { icon: 'moon', text: t('today') + ' · ' + RS.fmt.hijri() },
      number: '37', unit: '%', label: t('ofDeeds'),
      ring: { pct: 37, text: '24/64', sub: t('deeds') },
      metrics: [{ label: t('deeds'), value: '24/64' }, { label: t('points'), value: RS.fmt.n(186) }, { label: t('quran'), value: '12' }, { label: t('streak'), value: '5' }],
      cta: { eyebrow: t('nextPrayer'), text: t('maghribIn', { time: RS.fmt.dur(2 * 3600000 + 14 * 60000) }), act: 'sg.toast', arg: 'default' }
    }));
    h.push(ui.hero({
      kicker: { icon: 'book-open', text: t('quran') },
      number: '0', unit: t('pages'), label: t('ofQuran', { n: 1 }),
      ring: { pct: 0, text: RS.fmt.pct(0) },
      metrics: [{ label: t('todayM'), value: '0' }, { label: t('needed'), value: '20' }, { label: t('daysLeft'), value: '30' }],
      cta: { eyebrow: t('logEyebrow'), text: t('logReading'), act: 'sg.sheet' }
    }));
    h.push(ui.hero({
      kicker: { icon: 'trophy', text: t('board') },
      number: '#3', label: t('ofParticipants', { n: 48 }),
      ring: { pct: 100, text: RS.fmt.pct(100), sub: t('todayM') },
      metrics: [{ label: t('points'), value: RS.fmt.n(2140) }, { label: t('daysM'), value: '17' }, { label: t('quran'), value: '214' }],
      cta: { eyebrow: t('board'), text: t('seeBoard'), act: 'sg.toast', arg: 'success' },
      extra: ui.bar(100, { onDark: true })
    }));
    h.push(ui.hero({
      kicker: { icon: 'users', text: t('compete') },
      text: t('invite'),
      cta: { eyebrow: t('joinEyebrow'), text: t('join'), act: 'sg.toast', arg: 'default' }
    }));
    h.push(ui.hero({
      kicker: { icon: 'calendar', text: RS.hijriMonth(hj.month) },
      number: String(hj.day), label: RS.t('core.hijri.monthYear', { month: RS.hijriMonth(hj.month), year: hj.year }),
      cta: { text: t('staticCta') }
    }));

    h.push(ui.section(t('helpers')));
    h.push(ui.stepper({ title: t('stepTitle', { n: sg.day }), sub: t('stepSub', { n: Math.max(0, 21 - sg.day) }),
      prev: { act: 'sg.day', arg: '-1', label: t('prevDay'), disabled: sg.day <= 1 }, next: { act: 'sg.day', arg: '+1', label: t('nextDay'), disabled: sg.day >= 30 } }));
    h.push(ui.card({ body: '<div class="stack">' + ui.note(t('note'), { icon: 'moon' }) + ui.note(t('notePlain'), { tone: 'plain', icon: 'eye' }) +
      ui.note(t('noteDanger'), { tone: 'danger', icon: 'wifi-off' }) + ui.loading() + '</div>' }));

    h.push(ui.section(t('cards'), { text: t('more'), act: 'sg.toast', arg: 'default' }));
    h.push(ui.card({
      kicker: { icon: 'scroll-text', text: t('cardKicker') }, title: t('cardTitle'),
      action: { text: t('more'), act: 'sg.toast', arg: 'default', icon: 'chevron-right' },
      body: '<p class="quote">' + RS.esc(t('cardBody')) + '</p>' + ui.ref({ ref: 'Bukhari 1894', url: 'https://sunnah.com/bukhari:1894', grade: 'Sahih (Bukhari & Muslim)' })
    }));
    h.push(ui.card({ cls: 'is-flat', title: t('flatCard'), body: '<p>' + RS.esc(t('flatBody')) + '</p>' }));

    h.push(ui.section(t('lists')));
    h.push(ui.card({
      body: ui.list([
        ui.row({ icon: 'settings', title: t('rowSettings'), sub: t('rowSettingsSub'), act: 'sg.toast', arg: 'default', chevron: true }),
        ui.row({ icon: 'flame', title: t('rowValue'), value: RS.fmt.n(186) }),
        ui.row({ icon: 'eye', title: t('rowToggle'), sub: t('rowToggleSub'), toggle: { on: sg.rowToggle, act: 'sg.flip', arg: 'rowToggle' } }),
        ui.row({ check: { on: sg.rowCheck, act: 'sg.flip', arg: 'rowCheck' }, title: t('rowCheck'), value: t('pts', { n: 15 }),
          extra: ui.meta([ui.ref({ ref: 'Bukhari 555', grade: 'Sahih (Bukhari)' }), ui.linkAction({ text: t('explain'), act: 'sg.toast', arg: 'default' })]) }),
        ui.row({ check: { on: !sg.rowCheck, act: 'sg.flip', arg: 'rowCheck' }, title: t('rowCheck2'), sub: t('rowCheck2Sub'), value: t('pts', { n: 5 }) }),
        ui.row({ icon: 'external-link', title: t('rowLink'), sub: 'sunnah.com', href: 'https://sunnah.com/', chevron: true }),
        ui.row({ icon: 'wifi-off', title: t('rowDisabled'), act: 'sg.toast', disabled: true })
      ])
    }));

    h.push(ui.section(t('metrics')));
    var curLang = RS.LANGS.filter(function (l) { return l.code === RS.lang(); })[0];
    h.push(ui.card({ body:
      ui.metrics([{ label: t('deeds'), value: '24/64' }, { label: t('points'), value: RS.fmt.n(186) }, { label: t('quran'), value: '12' }, { label: t('streak'), value: '5' }]) +
      '<hr class="divider">' +
      // words instead of figures (.is-text): they wrap, never cut
      ui.metrics([{ label: t('mode'), value: RS.t('core.mode.year') }, { label: RS.t('core.lang.label'), value: curLang ? curLang.name : RS.lang() },
        { label: RS.t('theme.label'), value: RS.t('theme.' + RS.settings.theme) }]) }));

    h.push(ui.section(t('rings')));
    h.push(ui.card({ body: '<div class="sg-rings">' + ui.ring(0, { text: RS.fmt.pct(0) }) + ui.ring(37, { text: RS.fmt.pct(37) }) +
      ui.ring(100, { text: RS.fmt.pct(100) }) + ui.ring(37, { size: 96, stroke: 8, text: '24', sub: t('deeds') }) + '</div>' }));

    h.push(ui.section(t('buttons')));
    h.push(ui.card({ body: '<div class="stack">' +
      '<div class="btn-row">' + ui.btn(t('primary'), { act: 'sg.toast', arg: 'success' }) + ui.btn(t('secondary'), { variant: 'secondary', act: 'sg.toast' }) + '</div>' +
      '<div class="btn-row">' + ui.btn(t('ghost'), { variant: 'ghost', act: 'sg.toast' }) + ui.btn(t('danger'), { variant: 'danger', icon: 'trash-2', act: 'sg.confirm', arg: 'danger' }) + '</div>' +
      '<div class="btn-row">' + ui.btn(t('withIcon'), { variant: 'secondary', icon: 'share-2', act: 'sg.toast' }) + ui.btn(t('small'), { size: 'sm', act: 'sg.toast' }) +
      ui.btn(t('disabled'), { disabled: true }) + '</div>' +
      ui.btn(t('block'), { block: true, icon: 'download', act: 'sg.toast', arg: 'success' }) + '</div>' }));

    h.push(ui.section(t('controls')));
    h.push(ui.card({ body: '<div class="stack">' +
      '<div class="spread"><span id="sg-tgl-a" class="strong">' + RS.esc(t('toggleOn')) + '</span>' + ui.toggle(sg.toggle, { act: 'sg.flip', arg: 'toggle', labelledby: 'sg-tgl-a' }) + '</div>' +
      '<div class="spread"><span id="sg-tgl-b" class="strong">' + RS.esc(t('toggleOff')) + '</span>' + ui.toggle(!sg.toggle, { act: 'sg.flip', arg: 'toggle', labelledby: 'sg-tgl-b' }) + '</div>' +
      ui.seg([{ value: 'individuals', text: t('individuals') }, { value: 'teams', text: t('teams') }], sg.seg, { act: 'sg.seg', label: t('segLabel') }) +
      '<div class="chips">' + ['all', 'fasting', 'quran'].map(function (c) {
        return ui.chip(t('chip_' + c), { active: sg.chip === c, act: 'sg.chip', arg: c });
      }).join('') + ui.chip(t('chipStatic'), { icon: 'star' }) + '</div></div>' }));

    h.push(ui.section(t('fields')));
    h.push(ui.card({ body:
      ui.field({ id: 'sg-name', label: t('name'), placeholder: t('namePh'), hint: t('nameHint'), maxlength: 40, autocomplete: 'nickname' }) +
      ui.field({ id: 'sg-email', label: t('email'), type: 'email', placeholder: 'name@example.com', autocomplete: 'email' }) +
      ui.field({ id: 'sg-pages', label: t('pagesField'), type: 'number', inputmode: 'numeric', value: 4, min: 0, max: 604 }) +
      ui.textarea({ id: 'sg-notes', label: t('notes'), placeholder: t('notesPh'), rows: 3 }) +
      ui.select({ id: 'sg-level', label: t('level'), value: 'adult', options: [{ value: 'adult', text: t('adult') }, { value: 'kids', text: t('kids') }] })
    }));

    h.push(ui.section(t('checks')));
    h.push(ui.card({ body: '<div class="hstack sg-checks">' + ui.check(sg.check, { act: 'sg.flip', arg: 'check', label: t('checkDone') }) +
      ui.check(!sg.check, { act: 'sg.flip', arg: 'check', label: t('checkTodo') }) + ui.check(true) + ui.check(false) + '</div>' }));

    h.push(ui.section(t('empty')));
    h.push(ui.card({ body: ui.empty({ icon: 'book-open', title: t('emptyTitle'), body: t('emptyBody'), action: { text: t('emptyAction'), act: 'sg.sheet', icon: 'plus' } }) }));

    h.push(ui.section(t('progress')));
    h.push(ui.card({ body: '<div class="stack">' + [0, 37, 100].map(function (p) {
      return '<div class="stack-sm"><div class="spread small"><span>' + RS.esc(t('barLabel')) + '</span><span class="strong">' + RS.esc(RS.fmt.pct(p)) + '</span></div>' +
        ui.bar(p, { label: t('barLabel') + ' ' + RS.fmt.pct(p) }) + '</div>';
    }).join('') + '</div>' }));

    h.push(ui.section(t('charts')));
    h.push(ui.card({
      kicker: { icon: 'chart-column', text: t('barsTitle') },
      body: ui.bars(TREND, { max: 100, highlight: 16, labels: TREND.map(function (v, i) { return (i + 1) % 5 === 0 || i === 0 ? String(i + 1) : ''; }), label: t('barsLabel') })
    }));
    h.push(ui.card({ kicker: { icon: 'chart-line', text: t('sparkTitle') }, body: ui.spark(TREND.slice(0, 17), { min: 0, max: 100, label: t('sparkLabel') }) }));

    h.push(ui.section(t('grades')));
    h.push(ui.card({ body: '<div class="stack">' +
      '<div class="hstack">' + ['Sahih (Bukhari & Muslim)', 'Hasan sahih', "Da'if", 'Quran', t('otherGrade')].map(ui.gradeChip).join('') + '</div>' +
      ui.ref({ ref: 'Bukhari 38', url: 'https://sunnah.com/bukhari:38', grade: 'Sahih (Bukhari)' }) +
      ui.ref({ ref: 'Tirmidhi 807', grade: 'Hasan sahih' }) + ui.ref({ ref: 'Quran 2:185' }) + ui.ref({ ref: 'Tabarani' }) + '</div>' }));

    h.push(ui.section(t('type')));
    h.push(ui.card({ body: '<div class="stack-sm">' +
      '<p class="display-row"><span class="display">17</span><span class="display-unit">' + RS.esc(t('daysWord')) + '</span></p>' +
      '<h2 class="card-title">' + RS.esc(t('titleSample')) + '</h2>' +
      '<p>' + RS.esc(t('body')) + '</p><p class="caption">' + RS.esc(t('caption')) + '</p>' +
      ui.arabic(DUA) + ui.ref({ ref: 'Tirmidhi 3513', grade: 'Hasan sahih' }) + '</div>' }));

    h.push(ui.section(t('overlays')));
    h.push(ui.card({ body: '<div class="btn-row">' +
      ui.btn(t('openSheet'), { variant: 'secondary', icon: 'layers', act: 'sg.sheet' }) +
      ui.btn(t('toast'), { variant: 'secondary', act: 'sg.toast', arg: 'default' }) +
      ui.btn(t('toastSuccess'), { variant: 'secondary', act: 'sg.toast', arg: 'success' }) +
      ui.btn(t('toastError'), { variant: 'secondary', act: 'sg.toast', arg: 'error' }) +
      ui.btn(t('confirm'), { variant: 'secondary', act: 'sg.confirm' }) +
      ui.btn(t('confirmDanger'), { variant: 'danger', act: 'sg.confirm', arg: 'danger' }) + '</div>' }));

    h.push(ui.section(t('icons')));
    h.push(ui.card({ body: '<div class="sg-icons">' + Object.keys(RS.icons || {}).sort().map(function (n) {
      return '<span title="' + RS.esc(n) + '">' + RS.icon(n, { size: 22 }) + '</span>';
    }).join('') + '</div>' }));
    return h.join('');
  }

  function registerStyleguide() {
    RS.router.register('styleguide', {
      nav: false,
      title: function () { return RS.t('core.sg.title'); },
      render: function (el) {
        RS.topbar({ title: RS.t('core.sg.title'), sub: RS.t('core.sg.sub'), back: 'today',
          actions: [{ icon: RS.isDark() ? 'sun' : 'moon', act: 'sg.theme', label: RS.t('core.sg.toggleTheme') }] });
        el.innerHTML = styleguideHtml();
      }
    });
    RS.on('theme', function () { var c = RS.router.current(); if (c.route === 'styleguide') RS.refresh(); });
    RS.act('sg.theme', function () { RS.setTheme(RS.isDark() ? 'light' : 'dark'); });
    RS.act('sg.flip', function (k) { sg[k] = !sg[k]; RS.buzz(8); RS.refresh(); });
    RS.act('sg.seg', function (v) { sg.seg = v; RS.refresh(); });
    RS.act('sg.day', function (d) { sg.day = RS.clamp(sg.day + (parseInt(d, 10) || 0), 1, 30); RS.buzz(8); RS.refresh(); });
    RS.act('sg.chip', function (v) { sg.chip = v; RS.refresh(); });
    RS.act('sg.toast', function (tone) {
      var msg = tone === 'error' ? t('toastErr') : (tone === 'success' ? t('toastOk') : t('toastMsg'));
      RS.toast(msg, { tone: tone || 'default' });
    });
    RS.act('sg.sheet', function () {
      RS.sheet.open({
        title: t('sheetTitle'),
        body: '<p>' + RS.esc(t('sheetBody')) + '</p><div class="chips mt-3">' + [1, 5, 10, 20].map(function (n) {
          return RS.ui.chip(RS.fmt.signed(n), { act: 'sg.sheetAdd', arg: n });
        }).join('') + '</div><div class="mt-4">' + RS.ui.field({ id: 'sg-sheet-pages', label: t('pagesField'), type: 'number', inputmode: 'numeric', value: 0, min: 0 }) + '</div>',
        actions: [{ text: RS.t('core.cancel'), act: 'sheet.close' }, { text: RS.t('core.save'), act: 'sg.sheetSave', variant: 'primary' }]
      });
    });
    RS.act('sg.sheetAdd', function (n) {
      var f = document.getElementById('sg-sheet-pages');
      if (f) f.value = (parseInt(f.value, 10) || 0) + (parseInt(n, 10) || 0);
    });
    RS.act('sg.sheetSave', function () { RS.sheet.close(); RS.toast(t('toastOk'), { tone: 'success' }); });
    RS.act('sg.confirm', function (kind) {
      var danger = kind === 'danger';
      RS.confirm(danger ? { title: t('confirmTitle'), body: t('confirmBody'), ok: t('confirmOk'), danger: true } : { title: t('keepTitle'), body: t('keepBody') })
        .then(function (ok) { RS.toast(ok ? t('confirmed') : t('cancelled'), { tone: ok ? 'success' : 'default' }); });
    });
  }
})();
