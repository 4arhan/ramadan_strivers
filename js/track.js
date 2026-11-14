/* =====================================================================================================
   Ramadan Strivers v8 — track.js. Usage statistics with Google Analytics (the tag in index.html).
   What is sent: which screen is open, counts of a few actions (a deed ticked, a city set, a competition joined,
   an image shared ...), the app language, mode, reading level and theme. Never names, emails, journal text,
   which deeds were ticked, or coordinates.
   Consent: index.html sets the default (off in the EEA, UK and Switzerland until allowed; on elsewhere). The
   notice on first use and the switch in Settings store the person's choice in rs-consent ('yes' | 'no', this
   device only). In kids mode nothing is sent and the choice is treated as 'no'.
   API      RS.track(name, params) · RS.trackConsent() → 'yes' | 'no' | '' · RS.setTrackConsent(bool)
   Actions  tk.allow · tk.deny · tk.toggle
   ===================================================================================================== */
(function () {
  'use strict';
  var RS = window.RS;
  if (!RS) return;
  var t = RS.t, esc = RS.esc;
  function g() { if (typeof window.gtag === 'function') window.gtag.apply(null, arguments); }
  function raw(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function kids() { return RS.settings && RS.settings.level === 'kids'; }
  function consent() { var c = raw('rs-consent'); return c === 'yes' || c === 'no' ? c : ''; }
  // Sending is off when the person said no or the device is in kids mode; otherwise Google's consent mode decides
  // what is stored (the regional default from index.html until a choice is made).
  function off() { return kids() || consent() === 'no'; }
  function applyConsent() {
    var c = off() ? 'denied' : (consent() === 'yes' ? 'granted' : null);
    if (c) g('consent', 'update', { analytics_storage: c });
  }
  function track(name, params) {
    if (off()) return;
    g('event', String(name).slice(0, 40), params || {});
  }
  RS.track = track;
  RS.trackConsent = consent;
  RS.setTrackConsent = function (yes) { put('rs-consent', yes ? 'yes' : 'no'); applyConsent(); if (yes) props(); };

  /* ------------------------------------------------------------------ who is using it (no personal data) */
  function props() {
    if (off()) return;
    var s = RS.settings || {}, standalone = false;
    try { standalone = window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone; } catch (e) { standalone = false; }
    g('set', 'user_properties', { app_lang: RS.lang(), app_mode: RS.appMode(), app_level: s.level || 'adult', app_theme: s.theme || 'light',
      app_installed: standalone ? 'yes' : 'no', in_competition: RS.store.raw('rs-comp') ? 'yes' : 'no' });
  }

  /* ------------------------------------------------------------------ screens */
  var lastRoute = null;
  RS.on('route', function (r) {
    var route = r && r.route ? String(r.route) : '';
    if (!route || route === lastRoute) return;
    lastRoute = route;
    if (off()) return;
    g('event', 'page_view', { page_title: route, page_location: location.origin + '/' + route, page_path: '/' + route });
  });

  /* ------------------------------------------------------------------ actions */
  var ACTS = {
    'tl.setupGo': 'setup_done', 'tl.setupSkip': 'setup_skip', 'tl.qibla': 'qibla_open', 'tl.timetable': 'timetable_open',
    'tl.story': 'story_image', 'tl.storyShare': 'story_share', 'tl.storySave': 'story_save', 'share.progress': 'share_link',
    'tr.install': 'install_prompt', 'cal.download': 'calendar_export', 'tl.moon': 'date_adjust', 'prep.begin': 'prep_start',
    'buddy.start': 'buddy_link', 'fam.create': 'family_profile', 'tr.fstate': 'fast_state', 'tr.qadaToday': 'qada_made_up',
    'cmp.create': 'competition_create_try', 'cmp.join': 'competition_join_try', 'acct.submit': 'account_submit',
    'learn.review': 'quiz_review', 'prayer.locate': 'prayer_locate', 'disp.exit': 'display_used', 'me.pdf': 'eid_report'
  };
  var ticks = 0, tickTimer = null;
  function flushTicks() { if (ticks) { track('deed_tick', { count: ticks }); ticks = 0; } clearTimeout(tickTimer); tickTimer = null; }
  RS.on('act', function (a) {
    var name = a && a.name;
    if (!name) return;
    if (name === 'tr.tick') {
      ticks += 1;
      if (!raw('rs-first-deed')) { put('rs-first-deed', '1'); track('first_deed'); }
      if (!tickTimer) tickTimer = setTimeout(flushTicks, 20000);
      return;
    }
    if (name === 'learn.tf' || name === 'learn.mcq' || name === 'learn.grade') { quiz += 1; if (!quizTimer) quizTimer = setTimeout(flushQuiz, 20000); return; }
    var ev = ACTS[name];
    if (!ev) return;
    var p = {};
    if (name === 'tl.story' || name === 'tr.fstate' || name === 'tl.moon') p.value = String(a.arg || '').slice(0, 20);
    if (name === 'tl.setupGo') { p.level = (RS.settings && RS.settings.level) || 'adult'; setTimeout(props, 0); }
    track(ev, p);
  });
  var quiz = 0, quizTimer = null;
  function flushQuiz() { if (quiz) { track('quiz_answer', { count: quiz }); quiz = 0; } clearTimeout(quizTimer); quizTimer = null; }
  window.addEventListener('pagehide', function () { flushTicks(); flushQuiz(); });
  window.addEventListener('appinstalled', function () { track('app_installed'); });

  /* ------------------------------------------------------------------ state changes (a city set, a competition joined) */
  var seen = null;
  function snapshot() {
    var P = RS.cloud && RS.cloud.prayer, s = RS.settings || {};
    return { prayer: !!(P && P.configured && P.configured()), comp: !!RS.store.raw('rs-comp'), level: s.level || 'adult', lang: RS.lang(), mode: RS.appMode(),
      method: s.prayer && s.prayer.method ? String(s.prayer.method) : '' };
  }
  function diff() {
    var now = snapshot();
    if (seen) {
      if (now.prayer && !seen.prayer) track('prayer_set', { method: now.method, by: RS.settings.prayer && RS.settings.prayer.city ? 'city' : 'coordinates' });
      if (now.comp && !seen.comp) track('competition_join');
      if (now.level !== seen.level || now.lang !== seen.lang || now.mode !== seen.mode) { applyConsent(); props(); }
    }
    seen = now;
  }
  RS.on('data', diff);
  RS.on('lang', diff);

  /* ------------------------------------------------------------------ consent notice and switch */
  function noticeHtml() {
    return '<div class="tk-notice" id="tk-notice" role="region" aria-label="' + esc(t('tk.title')) + '"><p class="tk-notice-t"><strong>' + esc(t('tk.title')) + '</strong> ' + esc(t('tk.body')) +
      ' <a href="/privacy.html" target="_blank" rel="noopener">' + esc(t('tk.more')) + '</a></p><div class="tk-notice-b">' +
      RS.ui.btn(t('tk.deny'), { act: 'tk.deny', variant: 'ghost' }) + RS.ui.btn(t('tk.allow'), { act: 'tk.allow' }) + '</div></div>';
  }
  function showNotice() {
    if (consent() || kids() || document.getElementById('tk-notice')) return;
    if (document.querySelector('.sheet')) { setTimeout(showNotice, 4000); return; }        // not on top of the setup questions
    document.body.insertAdjacentHTML('beforeend', noticeHtml());
  }
  function hideNotice() { var n = document.getElementById('tk-notice'); if (n) n.remove(); }
  RS.act('tk.allow', function () { RS.setTrackConsent(true); hideNotice(); });
  RS.act('tk.deny', function () { RS.setTrackConsent(false); hideNotice(); });
  RS.act('tk.toggle', function () { RS.setTrackConsent(consent() === 'no'); RS.refresh(); });
  // A row for Settings: "Usage statistics" on/off (off and locked in kids mode).
  RS.trackRowHtml = function () {
    return RS.ui.row({ icon: 'chart-column', title: t('tk.set'), sub: t(kids() ? 'tk.setKids' : 'tk.setSub'), toggle: { on: !off(), act: 'tk.toggle' }, disabled: kids(), id: 'tk-row' });
  };

  RS.on('boot', function () {
    applyConsent();
    props();
    seen = snapshot();
    // the funnel: a first visit, and a visit on a later day
    var today = RS.todayISO(new Date()), first = raw('rs-first-seen'), last = raw('rs-last-seen');
    if (!first) { put('rs-first-seen', today); track('first_visit'); }
    else if (last && last !== today) track('return_visit', { days_since_first: Math.min(400, Math.round((new Date(today) - new Date(first)) / 86400000)) });
    put('rs-last-seen', today);
    if (RS.tools && RS.tools.firstRun && RS.tools.firstRun()) track('setup_shown');
    setTimeout(showNotice, 2500);
  });
})();
