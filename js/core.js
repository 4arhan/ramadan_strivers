/* =====================================================================================================
   Ramadan Strivers v8 — core.js (foundation). The ONLY shared runtime surface: one global `RS`.
   Plain browser JavaScript (ES2019), no modules, no frameworks.
   Script order (index.html): core.js → icons.js → lang/en.js → content.js → tracker.js → learn.js →
   prep.js → cloud.js → main.js. main.js runs the boot sequence (settings → theme → lang → 'boot' →
   query params → router.start() → service worker).

   QUICK REFERENCE (authoritative list: build/CONTRACT.md §3)
   Utilities  RS.VERSION · RS.$(sel, root) · RS.$$(sel, root) → Array · RS.esc(str) · RS.clamp(n, lo, hi)
              RS.todayISO(date?) · RS.debounce(fn, ms) · RS.uid(prefix?) · RS.refUrl('Bukhari 38') → URL | ''
              RS.reducedMotion() · RS.isRTL() · RS.isDark()
   Format     RS.fmt.n(num, intlOpts?) · .pct(0..100) · .time(date) · .dur(ms) · .date(date, intlOpts?) · .hijri(date?)
              (always Latin digits, current UI language)
   Storage    RS.store.get(key, fallback) · .set(key, val) → bool · .del(key) · .keys(prefix) → [keys]
              .raw(key) → string|null · .setRaw(key, string)   (get() returns non-JSON values, e.g. the v7
              'rs-auth' token, as the raw string; numeric strings such as 'rs-season' come back as numbers)
   Settings   RS.settings (one shared object; mutate then RS.saveSettings()) · RS.loadSettings() · RS.DEFAULTS
   Events     RS.on(evt, fn) · RS.off(evt, fn) · RS.emit(evt, data)
              'boot' · 'lang'(code) · 'theme'(name) · 'day'(n) · 'data'({source}) · 'route'({route, params}) ·
              'sync' · 'params'({join, t, magic, tab}) — main.js also keeps them in RS.bootParams
   i18n       RS.t(key, vars) → string (lang → en → key) · RS.tn(key, n, vars) (plural via Intl.PluralRules:
              keys key.one / key.other / key.few …; {n} is filled with the formatted number) · RS.has(key)
              RS.lang() · RS.dir() · RS.setLang(code) → Promise<activeCode> · RS.LANGS · RS.I18N[code]
   Theme      RS.setTheme('system'|'light'|'dark') · RS.applyTheme()
   Calendar   RS.hijri(date?, offset? = settings.hijriOff) → {day, month, year} · RS.hijriMonth(m) → localized name
              · RS.hijriMonthKey(m) → 'core.hijri.m9' · RS.appMode() → 'ramadan' | 'prep' | 'year'
   Fonts      RS.loadFont('amiri'|'arabic'|'bengali'|'devanagari') — UI script fonts load automatically
   Icons      RS.icon(name, {size=20, cls, label}) → '<svg…>' (decorative unless label) · RS.mountIcons()
   UI         RS.ui.* return HTML strings. Every text parameter is escaped. Parameters documented as HTML
              (body, extra, lead, trail, titleHtml, subHtml, rows) are inserted raw — escape what you put in them.
              hero card section list row metrics ring cta btn iconBtn toggle seg chip field textarea select
              check empty bar kicker gradeChip ref bars spark arabic  + helpers: stepper note loading linkAction
              Each component's options are documented above its definition below. Live examples: #/styleguide
              (js/main.js). Classes and tokens: css/app.css.
   Overlays   RS.toast(msg, {tone:'default'|'success'|'error', ms}) · RS.sheet.open({title, body, actions, onClose,
              focus, cls}) → sheet body element · RS.sheet.close() · RS.sheet.isOpen() ·
              RS.confirm({title, body, ok, cancel, danger}) → Promise<boolean>
   Actions    RS.act(name, fn) — delegated: <button data-act="name" data-arg="x"> → fn(arg, el, event);
              [data-act-change] / [data-act-input] → fn(value, el, event) (value = el.value, checkbox → checked);
              <form data-act-submit="name"> → fn(valuesObject, form, event) (default prevented).
              Built-in: 'nav.back', 'nav.go'(route?query), 'sheet.close', 'theme.set', 'lang.set', 'noop'.
              RS.runAct(name, arg, el) invokes a handler programmatically.
   Router     RS.router.register(route, {render(rootEl, params), onShow?(params), onHide?(), title?(params),
              tab?, nav?, parent?}) · .go(route, params?, {replace}) · .back(fallbackRoute?) · .current() →
              {route, params} · .href(route, params) → '#/route?x=y' · .has(route) · .start()
              RS.refresh() re-renders the current route (keeps scroll and focus) · RS.topbar({title, sub, back,
              actions:[{icon, act, arg, label, href}]})
   Misc       RS.buzz(ms) · RS.lazy(src) → Promise (script loaded once)
   ===================================================================================================== */
(function () {
  'use strict';

  var RS = window.RS = window.RS || {};
  RS.VERSION = '8.0.0';
  RS.I18N = RS.I18N || {};

  var doc = document;
  var root = doc.documentElement;
  var hasOwn = Object.prototype.hasOwnProperty;
  var warned = {};
  function warnOnce(kind, what) {
    var k = kind + ':' + what;
    if (warned[k]) return;
    warned[k] = 1;
    if (window.console) console.warn('[RS] ' + kind + ': ' + what);
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ------------------------------------------------------------------ utilities */
  RS.$ = function (sel, el) { return (el || doc).querySelector(sel); };
  RS.$$ = function (sel, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(sel)); };

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  RS.esc = function (s) {
    return s == null ? '' : String(s).replace(/[&<>"'`]/g, function (c) { return ESC[c]; });
  };
  var esc = RS.esc;

  RS.clamp = function (n, lo, hi) {
    n = Number(n);
    if (isNaN(n)) n = lo;
    return Math.min(hi, Math.max(lo, n));
  };
  RS.todayISO = function (d) {
    d = d instanceof Date ? d : new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  };
  RS.debounce = function (fn, ms) {
    var timer = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, ms == null ? 250 : ms);
    };
  };
  var uidN = 0;
  RS.uid = function (prefix) {
    uidN += 1;
    return (prefix || 'rs') + '-' + Date.now().toString(36) + uidN.toString(36) + Math.random().toString(36).slice(2, 6);
  };
  RS.reducedMotion = function () {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  };

  // 'Bukhari 38' → https://sunnah.com/bukhari:38 · 'Quran 2:185' → https://quran.com/2/185 (v7 rule: the six
  // books whose sunnah.com numbering matches the usual citation, plus the Quran; anything else → '')
  var BOOKS = {
    'bukhari': 'bukhari', 'muslim': 'muslim', 'tirmidhi': 'tirmidhi', 'nasai': 'nasai', "nasa'i": 'nasai',
    'ibn majah': 'ibnmajah', 'abu dawud': 'abudawud', 'abu dawood': 'abudawud'
  };
  RS.refUrl = function (ref) {
    if (!ref) return '';
    var s = String(ref).trim();
    var m = s.match(/^(?:Quran|Qur'an)\s+(\d{1,3}):(\d{1,3})(?:\s*[-\u2013]\s*\d{1,3})?$/i);
    if (m) return 'https://quran.com/' + m[1] + '/' + m[2];
    m = s.match(/^(.+?)\s+(\d+[a-z]?)$/i);
    if (m) {
      var b = BOOKS[m[1].toLowerCase()];
      if (b) return 'https://sunnah.com/' + b + ':' + m[2];
    }
    return '';
  };

  function toDate(d) {
    if (d == null) return new Date();
    if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
    if (typeof d === 'number') return new Date(d);
    var s = String(d);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    var x = new Date(s);
    return isNaN(x.getTime()) ? null : x;
  }

  /* ------------------------------------------------------------------ storage */
  var storageOK = (function () {
    try {
      var k = '__rs_probe';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })();
  var memStore = {};
  var storageWarned = false;
  function storageFailed() {
    if (storageWarned) return;
    storageWarned = true;
    setTimeout(function () { if (RS.toast) RS.toast(RS.t('err.storage'), { tone: 'error' }); }, 0);
  }
  function rawGet(k) {
    if (storageOK) { try { return window.localStorage.getItem(k); } catch (e) { /* fall through */ } }
    return hasOwn.call(memStore, k) ? memStore[k] : null;
  }
  function rawSet(k, v) {
    if (storageOK) {
      try { window.localStorage.setItem(k, v); return true; } catch (e) { storageFailed(); return false; }
    }
    memStore[k] = v;
    return true;
  }
  function rawDel(k) {
    if (storageOK) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } }
    delete memStore[k];
  }
  RS.store = {
    available: storageOK,
    get: function (key, fallback) {
      var s = rawGet(key);
      if (s == null) return fallback;
      try { return JSON.parse(s); } catch (e) {
        // v7 stored some values raw (e.g. the auth token). Corrupt JSON objects fall back.
        return /^\s*[[{"]/.test(s) ? fallback : s;
      }
    },
    set: function (key, val) {
      if (val === undefined) { rawDel(key); return true; }
      var s;
      try { s = JSON.stringify(val); } catch (e) { return false; }
      return rawSet(key, s);
    },
    del: function (key) { rawDel(key); },
    keys: function (prefix) {
      var out = [];
      if (storageOK) {
        try {
          for (var i = 0; i < window.localStorage.length; i++) {
            var k = window.localStorage.key(i);
            if (k != null && (!prefix || k.indexOf(prefix) === 0)) out.push(k);
          }
        } catch (e) { /* ignore */ }
      }
      Object.keys(memStore).forEach(function (k) {
        if ((!prefix || k.indexOf(prefix) === 0) && out.indexOf(k) < 0) out.push(k);
      });
      return out.sort();
    },
    raw: function (key) { return rawGet(key); },
    setRaw: function (key, str) {
      if (str == null) { rawDel(key); return true; }
      return rawSet(key, String(str));
    }
  };

  /* ------------------------------------------------------------------ events */
  var handlers = {};
  RS.on = function (evt, fn) {
    (handlers[evt] = handlers[evt] || []).push(fn);
    return fn;
  };
  RS.off = function (evt, fn) {
    var list = handlers[evt];
    if (!list) return;
    var i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };
  RS.emit = function (evt, data) {
    (handlers[evt] || []).slice().forEach(function (fn) {
      try { fn(data); } catch (e) { console.error('[RS] "' + evt + '" handler failed', e); }
    });
  };

  /* ------------------------------------------------------------------ languages + settings */
  RS.LANGS = [
    { code: 'en', name: 'English', dir: 'ltr' },
    { code: 'zh', name: '\u4e2d\u6587', dir: 'ltr' },
    { code: 'hi', name: '\u0939\u093f\u0928\u094d\u0926\u0940', dir: 'ltr' },
    { code: 'es', name: 'Espa\u00f1ol', dir: 'ltr' },
    { code: 'fr', name: 'Fran\u00e7ais', dir: 'ltr' },
    { code: 'ar', name: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629', dir: 'rtl' },
    { code: 'bn', name: '\u09ac\u09be\u0982\u09b2\u09be', dir: 'ltr' },
    { code: 'pt', name: 'Portugu\u00eas', dir: 'ltr' },
    { code: 'ru', name: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439', dir: 'ltr' },
    { code: 'ur', name: '\u0627\u0631\u062f\u0648', dir: 'rtl' }
  ];
  function langByCode(code) {
    for (var i = 0; i < RS.LANGS.length; i++) if (RS.LANGS[i].code === code) return RS.LANGS[i];
    return null;
  }
  function detectLang() {
    var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || 'en'];
    for (var i = 0; i < list.length; i++) {
      var c = String(list[i] || '').slice(0, 2).toLowerCase();
      if (langByCode(c)) return c;
    }
    return 'en';
  }

  RS.DEFAULTS = {
    day: 1, theme: 'system', detail: false, lang: null, mode: null, level: 'adult', autoDay: true,
    hijriOff: 0, prayer: null, quizLevel: 'standard', showPrep: false
  };
  RS.settings = RS.settings || {};
  RS.loadSettings = function () {
    var saved = RS.store.get('rs-settings', null);
    var s = RS.settings;
    Object.keys(s).forEach(function (k) { delete s[k]; });          // keep the object identity
    Object.keys(RS.DEFAULTS).forEach(function (k) { s[k] = RS.DEFAULTS[k]; });
    if (saved && typeof saved === 'object') Object.keys(saved).forEach(function (k) { s[k] = saved[k]; });
    if (!langByCode(s.lang)) s.lang = detectLang();
    if (s.theme !== 'light' && s.theme !== 'dark') s.theme = 'system';
    s.day = RS.clamp(parseInt(s.day, 10) || 1, 1, 30);
    if (s.mode !== 'ramadan' && s.mode !== 'prep' && s.mode !== 'year') s.mode = null;
    s.hijriOff = RS.clamp(parseInt(s.hijriOff, 10) || 0, -3, 3);
    s.detail = !!s.detail;
    s.autoDay = s.autoDay !== false;
    return s;
  };
  RS.saveSettings = function () { return RS.store.set('rs-settings', RS.settings); };

  /* ------------------------------------------------------------------ i18n */
  var curLang = 'en';
  RS.lang = function () { return curLang; };
  RS.dir = function () { var l = langByCode(curLang); return l ? l.dir : 'ltr'; };
  RS.isRTL = function () { return RS.dir() === 'rtl'; };

  function lookup(lang, key) {
    var d = RS.I18N[lang];
    return d && hasOwn.call(d, key) ? d[key] : undefined;
  }
  function interp(s, vars) {
    if (!vars) return String(s);
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? String(vars[k]) : m; });
  }
  RS.has = function (key) { return lookup(curLang, key) !== undefined || lookup('en', key) !== undefined; };
  RS.t = function (key, vars) {
    var s = lookup(curLang, key);
    if (s === undefined) s = lookup('en', key);
    if (s === undefined) { warnOnce('missing i18n key', key); s = key; }
    return interp(s, vars);
  };
  var pluralCache = {};
  function pluralForm(lang, key, n) {
    if (!RS.I18N[lang]) return undefined;
    var rule;
    try {
      pluralCache[lang] = pluralCache[lang] || new Intl.PluralRules(lang);
      rule = pluralCache[lang].select(n);
    } catch (e) { rule = n === 1 ? 'one' : 'other'; }
    var s = lookup(lang, key + '.' + rule);
    if (s === undefined) s = lookup(lang, key + '.other');
    return s;
  }
  RS.tn = function (key, n, vars) {
    var s = pluralForm(curLang, key, n);
    if (s === undefined) s = pluralForm('en', key, n);
    if (s === undefined) { warnOnce('missing i18n key', key + '.other'); s = key; }
    var v = { n: RS.fmt.n(n) };
    if (vars) Object.keys(vars).forEach(function (k) { v[k] = vars[k]; });
    return interp(s, v);
  };

  var FONT_URLS = {
    arabic: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@300..700&display=swap',
    bengali: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@300..700&display=swap',
    devanagari: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@300..700&display=swap',
    amiri: 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap'
  };
  var SCRIPT_FONT = { ar: 'arabic', ur: 'arabic', bn: 'bengali', hi: 'devanagari' };
  var fontsLoaded = {};
  RS.loadFont = function (key) {
    var url = FONT_URLS[key];
    if (!url || fontsLoaded[key] || !doc.head) return;
    fontsLoaded[key] = true;
    var l = doc.createElement('link');
    l.rel = 'stylesheet';
    l.href = url;
    l.setAttribute('data-font', key);
    doc.head.appendChild(l);
  };

  // Sets <html lang/dir> and the script font. Strings must already be loaded (see RS.setLang).
  RS.applyLang = function (code) {
    var l = langByCode(code) || RS.LANGS[0];
    curLang = l.code;
    root.setAttribute('lang', l.code);
    root.setAttribute('dir', l.dir);
    if (SCRIPT_FONT[l.code]) RS.loadFont(SCRIPT_FONT[l.code]);
    return l.code;
  };
  var langLoads = {};
  RS.loadLang = function (code) {
    if (code === 'en' || RS.I18N[code]) return Promise.resolve(code);
    if (!langByCode(code)) return Promise.reject(new Error('unknown language ' + code));
    if (!langLoads[code]) {
      langLoads[code] = RS.lazy('js/lang/' + code + '.js?v=' + RS.VERSION).then(function () {
        if (!RS.I18N[code]) throw new Error('language file did not register: ' + code);
        return code;
      }, function (e) { delete langLoads[code]; throw e; });
    }
    return langLoads[code];
  };
  RS.setLang = function (code) {
    if (!langByCode(code)) return Promise.resolve(curLang);
    return RS.loadLang(code).then(function () {
      RS.applyLang(code);
      if (RS.settings.lang !== code) { RS.settings.lang = code; RS.saveSettings(); }
      RS.emit('lang', code);
      RS.refresh();
      return code;
    }, function () {
      RS.toast(RS.t('err.lang'), { tone: 'error' });
      return curLang;
    });
  };

  /* ------------------------------------------------------------------ formatting (Latin digits) */
  function loc() { return curLang + '-u-nu-latn'; }
  var nfCache = {};
  function numFmt(opts) {
    var k = loc() + JSON.stringify(opts || {});
    if (!nfCache[k]) {
      try { nfCache[k] = new Intl.NumberFormat(loc(), opts); } catch (e) { nfCache[k] = new Intl.NumberFormat('en', opts); }
    }
    return nfCache[k];
  }
  var dfCache = {};
  function dateFmt(opts) {
    var k = loc() + JSON.stringify(opts || {});
    if (!dfCache[k]) {
      try { dfCache[k] = new Intl.DateTimeFormat(loc(), opts); } catch (e) { dfCache[k] = new Intl.DateTimeFormat('en', opts); }
    }
    return dfCache[k];
  }
  RS.fmt = {
    n: function (x, opts) {
      x = Number(x);
      if (!isFinite(x)) return '\u2013';
      return numFmt(opts || { maximumFractionDigits: 1 }).format(x);
    },
    pct: function (x) {
      x = Number(x);
      if (!isFinite(x)) x = 0;
      return numFmt({ style: 'percent', maximumFractionDigits: 0 }).format(Math.round(x) / 100);
    },
    time: function (d) {
      d = toDate(d);
      return d ? dateFmt({ hour: 'numeric', minute: '2-digit' }).format(d) : '';
    },
    dur: function (ms) {
      var total = Math.max(0, Math.floor((Number(ms) || 0) / 60000));
      var days = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60), m = total % 60;
      if (days > 0) return RS.t('core.dur.dh', { d: days, h: h });
      if (h > 0) return RS.t('core.dur.hm', { h: h, m: m });
      if (m > 0) return RS.t('core.dur.m', { m: m });
      return RS.t('core.dur.lt1m');
    },
    date: function (d, opts) {
      d = toDate(d);
      return d ? dateFmt(opts || { day: 'numeric', month: 'short' }).format(d) : '';
    },
    hijri: function (d) {
      var h = RS.hijri(d);
      return RS.t('core.hijri.date', { day: h.day, month: RS.hijriMonth(h.month), year: h.year });
    }
  };

  /* ------------------------------------------------------------------ theme */
  var mqDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var THEME_COLOR = { light: '#F2F5F3', dark: '#070D0A' };
  RS.isDark = function () {
    var t = RS.settings.theme;
    return t === 'dark' || (t !== 'light' && !!(mqDark && mqDark.matches));
  };
  RS.applyTheme = function () {
    var t = RS.settings.theme;
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
    else root.removeAttribute('data-theme');
    RS.$$('meta[name="theme-color"]').forEach(function (m) {
      var media = m.getAttribute('media') || '';
      var forced = t === 'light' || t === 'dark' ? THEME_COLOR[t] : null;
      m.setAttribute('content', forced || (media.indexOf('dark') >= 0 ? THEME_COLOR.dark : THEME_COLOR.light));
    });
  };
  RS.setTheme = function (t) {
    if (t !== 'light' && t !== 'dark') t = 'system';
    RS.settings.theme = t;
    RS.saveSettings();
    RS.applyTheme();
    RS.emit('theme', t);
  };
  if (mqDark) {
    var onScheme = function () { if (RS.settings.theme === 'system') { RS.applyTheme(); RS.emit('theme', 'system'); } };
    if (mqDark.addEventListener) mqDark.addEventListener('change', onScheme);
    else if (mqDark.addListener) mqDark.addListener(onScheme);
  }

  /* ------------------------------------------------------------------ Hijri calendar + app mode */
  var hijriFmt = null;
  function tabularHijri(date) {   // arithmetic (Kuwaiti) fallback when Intl lacks islamic-umalqura
    var y = date.getFullYear(), mo = date.getMonth() + 1, d = date.getDate();
    var a = Math.floor((14 - mo) / 12), yy = y + 4800 - a, mm = mo + 12 * a - 3;
    var jdn = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
    var l = jdn - 1948440 + 10632, n = Math.floor((l - 1) / 10631);
    l = l - 10631 * n + 354;
    var j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
    l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
    var month = Math.floor((24 * l) / 709);
    return { day: l - Math.floor((709 * month) / 24), month: month, year: 30 * n + j - 30 };
  }
  RS.hijri = function (date, offset) {
    var d = toDate(date) || new Date();
    var off = offset == null ? (parseInt(RS.settings.hijriOff, 10) || 0) : (parseInt(offset, 10) || 0);
    var t = new Date(d.getTime() + off * 86400000);
    try {
      if (hijriFmt === null) {
        hijriFmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric' });
        if (hijriFmt.resolvedOptions().calendar.indexOf('islamic') !== 0) hijriFmt = false;
      }
      if (hijriFmt) {
        var o = {};
        hijriFmt.formatToParts(t).forEach(function (p) {
          if (p.type === 'day' || p.type === 'month' || p.type === 'year') o[p.type] = parseInt(p.value, 10);
        });
        if (o.day && o.month && o.year) return { day: o.day, month: o.month, year: o.year };
      }
    } catch (e) { hijriFmt = false; }
    return tabularHijri(t);
  };
  RS.hijriMonthKey = function (m) { return 'core.hijri.m' + RS.clamp(parseInt(m, 10) || 1, 1, 12); };
  RS.hijriMonth = function (m) { return RS.t(RS.hijriMonthKey(m)); };
  RS.appMode = function () {
    var m = RS.settings.mode;
    if (m === 'ramadan' || m === 'prep' || m === 'year') return m;
    if (RS.store.raw('rs-comp')) return 'ramadan';                 // competition membership forces Ramadan
    var h = RS.hijri();
    return h.month === 9 ? 'ramadan' : (h.month === 8 ? 'prep' : 'year');
  };

  /* ------------------------------------------------------------------ icons */
  var FLIP_RTL = { 'chevron-left': 1, 'chevron-right': 1, 'arrow-left': 1, 'arrow-right': 1, 'arrow-up-right': 1, 'log-in': 1, 'log-out': 1, 'external-link': 1, 'send': 1, 'skip-forward': 1 };
  RS.mountIcons = function () {
    if (!RS.icons || !doc.body || doc.getElementById('rs-sprite')) return;
    var parts = Object.keys(RS.icons).map(function (k) {
      return '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + RS.icons[k] + '</symbol>';
    });
    doc.body.insertAdjacentHTML('afterbegin',
      '<svg xmlns="http://www.w3.org/2000/svg" id="rs-sprite" class="sprite" aria-hidden="true" focusable="false"><defs>' + parts.join('') + '</defs></svg>');
  };
  RS.icon = function (name, o) {
    o = o || {};
    if (!RS.icons || !hasOwn.call(RS.icons, name)) { warnOnce('unknown icon', name); return ''; }
    var size = o.size || 20;
    var cls = 'ic' + (FLIP_RTL[name] ? ' flip-rtl' : '') + (o.cls ? ' ' + esc(o.cls) : '');
    var a11y = o.label ? ' role="img" aria-label="' + esc(o.label) + '"' : ' aria-hidden="true"';
    return '<svg class="' + cls + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24"' + a11y +
      ' focusable="false"><use href="#i-' + esc(name) + '"/></svg>';
  };

  /* ------------------------------------------------------------------ UI components (HTML strings) */
  var ui = RS.ui = {};
  function attr(name, val) {
    if (val == null || val === false) return '';
    if (val === true) return ' ' + name;
    return ' ' + name + '="' + esc(val) + '"';
  }
  function attrsOf(a) {
    if (!a) return '';
    if (typeof a === 'string') return ' ' + a;                // trusted, caller-built attribute string
    return Object.keys(a).map(function (k) { return attr(k, a[k]); }).join('');
  }
  function actAttrs(act, arg) {
    return act ? attr('data-act', act) + (arg != null ? attr('data-arg', String(arg)) : '') : '';
  }
  function isExternal(href) { return /^https?:\/\//i.test(href || '') && String(href).indexOf(location.origin) !== 0; }
  function linkAttrs(href) {
    return ' href="' + esc(href) + '"' + (isExternal(href) ? ' target="_blank" rel="noopener noreferrer"' : '');
  }
  function clsx(base, extra) { return base + (extra ? ' ' + esc(extra) : ''); }
  function txt(v) { return v == null ? '' : esc(v); }
  function linkAction(a) {   // {text, act, arg, href, icon, label}
    var ic = a.icon ? RS.icon(a.icon, { size: 16 }) : '';
    if (a.href) return '<a class="link-btn"' + linkAttrs(a.href) + attr('aria-label', a.label) + '>' + txt(a.text) + ic + '</a>';
    return '<button type="button" class="link-btn"' + actAttrs(a.act, a.arg) + attr('aria-label', a.label) + attr('id', a.id) + '>' + txt(a.text) + ic + '</button>';
  }
  ui.linkAction = linkAction;

  // kicker('moon-star', 'Today') — small icon + uppercase label
  ui.kicker = function (icon, text) {
    return '<p class="kicker">' + (icon ? RS.icon(icon, { size: 16 }) : '') + '<span>' + txt(text) + '</span></p>';
  };

  // The ONE dark pine hero object of a screen.
  // hero({kicker:{icon,text}, number, unit, label, text?, ring:{pct, text, sub, label}, metrics:[{label,value,id?}],
  //       cta:{eyebrow, text, act, arg, href, id}, extra(html), id, cls})
  ui.hero = function (o) {
    o = o || {};
    var kick = o.kicker ? ui.kicker(o.kicker.icon, o.kicker.text) : '';
    var hasNum = o.number != null && o.number !== '';
    var num = hasNum ? '<div class="hero-num"><span class="num">' + txt(o.number) + '</span>' +
      (o.unit ? '<span class="unit">' + txt(o.unit) + '</span>' : '') + '</div>' : '';
    var label = o.label ? '<p class="hero-label">' + txt(o.label) + '</p>' : '';
    var para = o.text ? '<p class="hero-text">' + txt(o.text) + '</p>' : '';
    var ring = '';
    if (o.ring) {
      var ro = {}; Object.keys(o.ring).forEach(function (k) { ro[k] = o.ring[k]; });
      ro.onDark = true;
      ring = ui.ring(o.ring.pct, ro);
    }
    var main = (num || label || para || ring) ? '<div class="hero-main"><div class="hero-figure">' + num + label + para + '</div>' + ring + '</div>' : '';
    var metrics = o.metrics && o.metrics.length ? ui.metrics(o.metrics, { onDark: true }) : '';
    var cta = o.cta ? ui.cta(o.cta) : '';
    var extra = o.extra ? '<div class="hero-extra">' + o.extra + '</div>' : '';
    return '<section class="' + clsx('hero', o.cls) + '"' + attr('id', o.id) + '>' + kick + main + metrics + cta + extra + '</section>';
  };

  // card({kicker:{icon,text}, title, action:{text, act, arg, href, icon}, body(html), cls, id})
  ui.card = function (o) {
    o = o || {};
    var kick = o.kicker ? ui.kicker(o.kicker.icon, o.kicker.text) : '';
    var title = o.title ? '<h2 class="card-title"' + attr('id', o.titleId) + '>' + txt(o.title) + '</h2>' : '';
    var action = o.action ? linkAction(o.action) : '';
    var hd = (kick || title || action) ? '<div class="card-hd"><div class="card-hd-txt">' + kick + title + '</div>' + action + '</div>' : '';
    var body = o.body != null && o.body !== '' ? '<div class="card-bd">' + o.body + '</div>' : '';
    return '<section class="' + clsx('card', o.cls) + '"' + attr('id', o.id) + '>' + hd + body + '</section>';
  };

  // section(title, action?) — small uppercase header between cards
  ui.section = function (title, action) {
    return '<div class="sec-hd"><h2 class="sec-title">' + txt(title) + '</h2>' + (action ? linkAction(action) : '') + '</div>';
  };

  // list([rowHtml, …]) — hairline-separated rows (use inside a card)
  ui.list = function (rows, o) {
    rows = (rows || []).filter(function (r) { return r; });
    if (!rows.length) return '';
    o = o || {};
    return '<ul class="' + clsx('list', o.cls) + '"' + attr('id', o.id) + attr('aria-label', o.label) + '>' +
      rows.map(function (r) { return '<li class="li">' + r + '</li>'; }).join('') + '</ul>';
  };

  // row({icon, title, sub, value, act, arg, chevron, toggle:{on,act,arg}, check:{on,act,arg}, href, cls, id,
  //      lead(html), trail(html), titleHtml, subHtml, extra(html, rendered below and outside the button), disabled, attrs})
  // The whole row is the control: toggle → role=switch, check → role=checkbox, act → button, href → link.
  ui.row = function (o) {
    o = o || {};
    var leadKind = '';
    var lead = '';
    if (o.lead) { lead = '<span class="row-lead">' + o.lead + '</span>'; leadKind = 'custom'; }
    else if (o.check) { lead = '<span class="row-lead">' + ui.check(!!o.check.on) + '</span>'; leadKind = 'check'; }
    else if (o.icon) { lead = '<span class="row-ic" aria-hidden="true">' + RS.icon(o.icon, { size: 19 }) + '</span>'; leadKind = 'icon'; }
    var title = o.titleHtml != null ? o.titleHtml : txt(o.title);
    var sub = o.subHtml != null ? o.subHtml : (o.sub != null && o.sub !== '' ? txt(o.sub) : '');
    var body = '<span class="row-txt"><span class="row-title">' + title + '</span>' + (sub ? '<span class="row-sub">' + sub + '</span>' : '') + '</span>';
    var val = o.value != null && o.value !== '' ? '<span class="row-val">' + txt(o.value) + '</span>' : '';
    var tgl = o.toggle ? '<span class="' + (o.toggle.on ? 'tgl is-on' : 'tgl') + '" aria-hidden="true"><span class="tgl-knob"></span></span>' : '';
    var chev = o.chevron ? RS.icon('chevron-right', { size: 18, cls: 'row-chev' }) : '';
    var inner = lead + body + val + (o.trail || '') + tgl + chev;

    var tag = 'div', a = '';
    if (o.toggle) { tag = 'button'; a = ' type="button" role="switch" aria-checked="' + !!o.toggle.on + '"' + actAttrs(o.toggle.act, o.toggle.arg); }
    else if (o.check) { tag = 'button'; a = ' type="button" role="checkbox" aria-checked="' + !!o.check.on + '"' + actAttrs(o.check.act, o.check.arg); }
    else if (o.href) { tag = 'a'; a = linkAttrs(o.href); }
    else if (o.act) { tag = 'button'; a = ' type="button"' + actAttrs(o.act, o.arg); }
    if (o.disabled) a += tag === 'button' ? ' disabled' : ' aria-disabled="true"';
    a += attr('id', o.id) + attrsOf(o.attrs);
    var cls = 'row' + (o.check && o.check.on ? ' is-done' : '') + (o.disabled ? ' is-disabled' : '') + (o.cls ? ' ' + esc(o.cls) : '');
    if (o.extra) {
      var interactive = tag !== 'div';
      return '<div class="row-wrap' + (leadKind ? ' lead-' + leadKind : ' no-lead') + '"><' + tag + ' class="' + cls + (interactive ? ' row-main' : '') + '"' + a + '>' +
        inner + '</' + tag + '><div class="row-extra">' + o.extra + '</div></div>';
    }
    return '<' + tag + ' class="' + cls + '"' + a + '>' + inner + '</' + tag + '>';
  };

  // metrics([{label, value, id?}], {onDark}) — label above value, hairline separators
  ui.metrics = function (items, o) {
    o = o || {};
    return '<dl class="metrics' + (o.onDark ? ' on-dark' : '') + (o.cls ? ' ' + esc(o.cls) : '') + '">' + (items || []).map(function (m) {
      return '<div class="metric"' + attr('id', m.id) + '><dt>' + txt(m.label) + '</dt><dd>' + txt(m.value) + '</dd></div>';
    }).join('') + '</dl>';
  };

  // ring(pct, {size(px), stroke(1..30, viewBox units of 120), text, sub, label, onDark, cls})
  ui.ring = function (pct, o) {
    o = o || {};
    var p = RS.clamp(Number(pct) || 0, 0, 100);
    var stroke = RS.clamp(o.stroke || 10, 2, 30);
    var r = (120 - stroke) / 2 - 1;
    var c = 2 * Math.PI * r;
    var gid = RS.uid('rg');
    var hasTxt = (o.text != null && o.text !== '') || o.sub;
    var label = o.label || ((hasTxt ? [o.text, o.sub].filter(function (x) { return x != null && x !== ''; }).join(' ') + ' \u00b7 ' : '') + RS.t('core.ring.label', { pct: RS.fmt.pct(p) }));
    var style = o.size ? ' style="--ring-size:' + RS.clamp(o.size, 24, 400) + 'px"' : '';
    var label2 = hasTxt ? '<span class="ring-txt" aria-hidden="true">' + (o.text != null && o.text !== '' ? '<span class="ring-val">' + txt(o.text) + '</span>' : '') +
      (o.sub ? '<span class="ring-sub">' + txt(o.sub) + '</span>' : '') + '</span>' : '';
    return '<div class="ring' + (o.onDark ? ' on-dark' : '') + (p === 0 ? ' is-empty' : '') + (o.cls ? ' ' + esc(o.cls) : '') + '"' + style +
      ' role="img" aria-label="' + esc(label) + '"' + attr('id', o.id) + '>' +
      '<svg class="ring-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="stop-a"/><stop offset="1" class="stop-b"/></linearGradient></defs>' +
      '<circle class="ring-track" cx="60" cy="60" r="' + r + '" stroke-width="' + stroke + '"/>' +
      (p > 0 ? '<circle class="ring-bar" cx="60" cy="60" r="' + r + '" stroke-width="' + stroke + '" stroke="url(#' + gid + ')" stroke-dasharray="' +
        c.toFixed(2) + '" stroke-dashoffset="' + (c * (1 - p / 100)).toFixed(2) + '"/>' : '') +
      '</svg>' + label2 + '</div>';
  };

  // cta({eyebrow, text, act, arg, href, id}) — glass pill with a round mint arrow (inside the hero)
  ui.cta = function (o) {
    o = o || {};
    var inner = '<span class="cta-txt">' + (o.eyebrow ? '<span class="cta-eyebrow">' + txt(o.eyebrow) + '</span>' : '') +
      '<span class="cta-text">' + txt(o.text) + '</span></span>';
    var arrow = '<span class="cta-arrow" aria-hidden="true">' + RS.icon('arrow-right', { size: 20 }) + '</span>';
    if (o.href) return '<a class="cta"' + linkAttrs(o.href) + attr('id', o.id) + '>' + inner + arrow + '</a>';
    if (o.act) return '<button type="button" class="cta"' + actAttrs(o.act, o.arg) + attr('id', o.id) + '>' + inner + arrow + '</button>';
    return '<div class="cta is-static"' + attr('id', o.id) + '>' + inner + '</div>';
  };

  // btn(text, {act, arg, variant:'primary'|'secondary'|'ghost'|'danger', icon, block, type, size:'sm', href, id,
  //            disabled, label(aria), cls, attrs})
  ui.btn = function (text, o) {
    o = o || {};
    var cls = 'btn btn-' + (o.variant || 'primary') + (o.block ? ' btn-block' : '') + (o.size === 'sm' ? ' btn-sm' : '') + (o.cls ? ' ' + esc(o.cls) : '');
    var content = (o.icon ? RS.icon(o.icon, { size: 18 }) : '') + (text != null && text !== '' ? '<span>' + txt(text) + '</span>' : '');
    var common = attr('id', o.id) + attr('aria-label', o.label) + attrsOf(o.attrs);
    if (o.href) return '<a class="' + cls + '"' + linkAttrs(o.href) + attr('download', o.download) + common + '>' + content + '</a>';
    return '<button type="' + esc(o.type || 'button') + '" class="' + cls + '"' + actAttrs(o.act, o.arg) + (o.disabled ? ' disabled' : '') + common + '>' + content + '</button>';
  };

  // iconBtn(icon, {act, arg, label (required), href, id, cls})
  ui.iconBtn = function (icon, o) {
    o = o || {};
    var content = RS.icon(icon, { size: o.size || 22 });
    if (o.href) return '<a class="' + clsx('icon-btn', o.cls) + '"' + linkAttrs(o.href) + attr('aria-label', o.label) + attr('id', o.id) + '>' + content + '</a>';
    return '<button type="button" class="' + clsx('icon-btn', o.cls) + '"' + actAttrs(o.act, o.arg) + attr('aria-label', o.label) + attr('id', o.id) + '>' + content + '</button>';
  };

  // toggle(on, {act, arg, label | labelledby, id}) — standalone switch
  ui.toggle = function (on, o) {
    o = o || {};
    return '<button type="button" class="tgl' + (on ? ' is-on' : '') + '" role="switch" aria-checked="' + !!on + '"' + actAttrs(o.act, o.arg) +
      attr('aria-label', o.label) + attr('aria-labelledby', o.labelledby) + attr('id', o.id) + (o.disabled ? ' disabled' : '') + '><span class="tgl-knob"></span></button>';
  };

  // seg([{value, text, icon?}], current, {act, label, id, cls}) — act receives the clicked value as arg
  ui.seg = function (items, current, o) {
    o = o || {};
    return '<div class="' + clsx('seg', o.cls) + '" role="group"' + attr('aria-label', o.label) + attr('id', o.id) + '>' + (items || []).map(function (it) {
      var on = String(it.value) === String(current);
      return '<button type="button" class="seg-btn" aria-pressed="' + on + '"' + actAttrs(o.act, it.value) + '>' +
        (it.icon ? RS.icon(it.icon, { size: 16 }) + ' ' : '') + txt(it.text) + '</button>';
    }).join('') + '</div>';
  };

  // chip(text, {active, act, arg, icon}) — button when act is given, otherwise a static label
  ui.chip = function (text, o) {
    o = o || {};
    var cls = 'chip' + (o.active ? ' is-active' : '') + (o.cls ? ' ' + esc(o.cls) : '');
    var content = (o.icon ? RS.icon(o.icon, { size: 15 }) : '') + '<span>' + txt(text) + '</span>';
    if (!o.act) return '<span class="' + cls + '"' + attr('id', o.id) + '>' + content + '</span>';
    return '<button type="button" class="' + cls + '" aria-pressed="' + !!o.active + '"' + actAttrs(o.act, o.arg) + attr('id', o.id) + '>' + content + '</button>';
  };

  function fieldActs(o) {
    return attr('data-act-input', o.actInput) + attr('data-act-change', o.actChange || o.act) + (o.arg != null ? attr('data-arg', o.arg) : '');
  }
  function fieldWrap(o, id, control) {
    var hintId = o.hint ? id + '-hint' : null;
    return '<div class="' + clsx('field', o.cls) + '"><label class="field-lbl' + (o.hideLabel ? ' sr-only' : '') + '" for="' + esc(id) + '">' + txt(o.label) + '</label>' +
      control + (o.hint ? '<p class="field-hint" id="' + esc(hintId) + '">' + txt(o.hint) + '</p>' : '') + '</div>';
  }
  // field({id, label, type, value, placeholder, maxlength, hint, hideLabel, required, autocomplete, inputmode,
  //        actInput, actChange, arg, attrs})
  ui.field = function (o) {
    o = o || {};
    var id = o.id || RS.uid('f');
    var control = '<input class="input" id="' + esc(id) + '" name="' + esc(o.name || id) + '" type="' + esc(o.type || 'text') + '"' +
      attr('value', o.value) + attr('placeholder', o.placeholder) + attr('maxlength', o.maxlength) + attr('min', o.min) + attr('max', o.max) +
      attr('autocomplete', o.autocomplete) + attr('inputmode', o.inputmode) + (o.required ? ' required' : '') +
      (o.hint ? ' aria-describedby="' + esc(id) + '-hint"' : '') + fieldActs(o) + attrsOf(o.attrs) + '>';
    return fieldWrap(o, id, control);
  };
  // textarea({id, label, value, placeholder, maxlength, rows, hint, hideLabel, actInput, actChange, arg, attrs})
  ui.textarea = function (o) {
    o = o || {};
    var id = o.id || RS.uid('f');
    var control = '<textarea class="textarea" id="' + esc(id) + '" name="' + esc(o.name || id) + '" rows="' + (parseInt(o.rows, 10) || 4) + '"' +
      attr('placeholder', o.placeholder) + attr('maxlength', o.maxlength) + (o.hint ? ' aria-describedby="' + esc(id) + '-hint"' : '') +
      fieldActs(o) + attrsOf(o.attrs) + '>' + txt(o.value) + '</textarea>';
    return fieldWrap(o, id, control);
  };
  // select({id, label, options:[{value, text, disabled?}], value, act (change → fn(value, el)), arg, hint, hideLabel, attrs})
  ui.select = function (o) {
    o = o || {};
    var id = o.id || RS.uid('f');
    var opts = (o.options || []).map(function (op) {
      return '<option value="' + esc(op.value) + '"' + (String(op.value) === String(o.value) ? ' selected' : '') + (op.disabled ? ' disabled' : '') + '>' + txt(op.text) + '</option>';
    }).join('');
    var control = '<div class="select-wrap"><select class="select" id="' + esc(id) + '" name="' + esc(o.name || id) + '"' +
      (o.hint ? ' aria-describedby="' + esc(id) + '-hint"' : '') + fieldActs(o) + attrsOf(o.attrs) + '>' + opts + '</select>' + RS.icon('chevron-down', { size: 18 }) + '</div>';
    return fieldWrap(o, id, control);
  };

  // check(done, {act, arg, label, disabled}) — round check. Without act it is a visual (aria-hidden) mark,
  // e.g. inside a row({check}) where the whole row is the checkbox.
  ui.check = function (done, o) {
    o = o || {};
    var cls = 'check' + (done ? ' is-done' : '') + (o.cls ? ' ' + esc(o.cls) : '');
    var ic = RS.icon('check', { size: 16 });
    if (!o.act) return '<span class="' + cls + '" aria-hidden="true">' + ic + '</span>';
    return '<button type="button" class="' + cls + '" role="checkbox" aria-checked="' + !!done + '"' + actAttrs(o.act, o.arg) +
      attr('aria-label', o.label) + attr('id', o.id) + (o.disabled ? ' disabled' : '') + '>' + ic + '</button>';
  };

  // empty({icon, title, body, action:{text, act, arg, href, variant, icon}})
  ui.empty = function (o) {
    o = o || {};
    var a = o.action;
    return '<div class="' + clsx('empty', o.cls) + '">' + (o.icon ? '<span class="empty-ic" aria-hidden="true">' + RS.icon(o.icon, { size: 26 }) + '</span>' : '') +
      (o.title ? '<p class="empty-title">' + txt(o.title) + '</p>' : '') + (o.body ? '<p class="empty-body">' + txt(o.body) + '</p>' : '') +
      (a ? ui.btn(a.text, { act: a.act, arg: a.arg, href: a.href, variant: a.variant || 'secondary', icon: a.icon }) : '') + '</div>';
  };

  // bar(pct, {label, onDark, cls}) — thin progress bar (aria-hidden unless a label is given)
  ui.bar = function (pct, o) {
    o = o || {};
    var p = Math.round(RS.clamp(Number(pct) || 0, 0, 100));
    var a11y = o.label ? ' role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '" aria-label="' + esc(o.label) + '"' : ' aria-hidden="true"';
    return '<div class="bar' + (o.onDark ? ' on-dark' : '') + (o.cls ? ' ' + esc(o.cls) : '') + '"' + a11y + '><span class="bar-fill" style="width:' + p + '%"></span></div>';
  };

  // gradeChip('Sahih (Bukhari & Muslim)') → localized class label (Sahih / Hasan / Da'if / Quran); full text in title
  function gradeClass(g) {
    var s = String(g).toLowerCase();
    if (/^\s*sa?h[i\u012b]h/.test(s)) return 'sahih';
    if (/^\s*hasan/.test(s)) return 'hasan';
    if (/da['\u02bf\u2019]?[i\u012b]f|weak/.test(s)) return 'daif';
    if (/qur'?an/.test(s)) return 'quran';
    return 'other';
  }
  ui.gradeClass = gradeClass;
  ui.gradeChip = function (grade) {
    if (!grade) return '';
    var g = String(grade), k = gradeClass(g);
    var label = k === 'other' ? g : RS.t('core.grade.' + k);
    return '<span class="grade grade-' + k + '"' + (label !== g ? ' title="' + esc(g) + '"' : '') + '>' + txt(label) + '</span>';
  };

  // ref({ref, url, grade}) — reference line: book icon · linked reference (not translated) · grade chip
  ui.ref = function (o) {
    o = o || {};
    if (!o.ref && !o.grade) return '';
    var url = o.url || RS.refUrl(o.ref);
    var r = '';
    if (o.ref) {
      r = url ? '<a' + linkAttrs(url) + '><bdi>' + txt(o.ref) + '</bdi>' + RS.icon('arrow-up-right', { size: 13 }) +
        '<span class="sr-only"> ' + txt(RS.t('core.opensNew')) + '</span></a>' : '<bdi>' + txt(o.ref) + '</bdi>';
    }
    return '<span class="' + clsx('ref', o.cls) + '">' + RS.icon('book-open', { size: 15 }) + r + ui.gradeChip(o.grade) + '</span>';
  };

  // bars(values[], {max, highlight: index | [indexes], labels: [..] ('' to skip), height, label (aria), onDark})
  ui.bars = function (values, o) {
    o = o || {};
    var vals = (values || []).map(function (v) { return Math.max(0, Number(v) || 0); });
    var n = vals.length;
    if (!n) return '';
    var max = Number(o.max) || Math.max.apply(null, vals) || 1;
    var W = 300, H = RS.clamp(o.height || 72, 24, 240), lblH = o.labels ? 14 : 0;
    var slot = W / n, bw = Math.max(2, slot * (n > 20 ? 0.64 : 0.56)), rx = Math.min(bw / 2, 4);
    var hi = [].concat(o.highlight == null ? [] : o.highlight);
    var out = '';
    vals.forEach(function (v, i) {
      var h = v > 0 ? Math.max(3, Math.min(1, v / max) * H) : 3;
      var x = i * slot + (slot - bw) / 2;
      var isHi = hi.indexOf(i) >= 0;
      out += '<rect class="bars-b' + (isHi ? ' is-hi' : '') + (v > 0 ? '' : ' is-zero') + '" x="' + x.toFixed(2) + '" y="' + (H - h).toFixed(2) +
        '" width="' + bw.toFixed(2) + '" height="' + h.toFixed(2) + '" rx="' + rx.toFixed(2) + '"/>';
      if (o.labels && o.labels[i] != null && o.labels[i] !== '') {
        out += '<text class="bars-lbl' + (isHi ? ' is-hi' : '') + '" x="' + (i * slot + slot / 2).toFixed(2) + '" y="' + (H + 11) + '" text-anchor="middle">' + txt(o.labels[i]) + '</text>';
      }
    });
    var a11y = o.label ? ' role="img" aria-label="' + esc(o.label) + '"' : ' aria-hidden="true"';
    return '<svg class="chart bars' + (o.onDark ? ' on-dark' : '') + (o.cls ? ' ' + esc(o.cls) : '') + '" viewBox="0 0 ' + W + ' ' + (H + lblH) + '"' + a11y + ' focusable="false">' + out + '</svg>';
  };

  // spark(values[], {min, max, height, label (aria), onDark}) — smooth trend line with soft area and end dot
  ui.spark = function (values, o) {
    o = o || {};
    var vals = (values || []).map(Number).filter(function (v) { return isFinite(v); });
    if (!vals.length) return '';
    if (vals.length === 1) vals = [vals[0], vals[0]];
    var W = 300, H = RS.clamp(o.height || 64, 24, 240), pad = 5;
    var min = o.min != null ? Number(o.min) : Math.min.apply(null, vals);
    var max = o.max != null ? Number(o.max) : Math.max.apply(null, vals);
    if (max === min) { max = min + 1; }
    var n = vals.length;
    var pts = vals.map(function (v, i) {
      var y = pad + (H - 2 * pad) * (1 - (RS.clamp(v, min, max) - min) / (max - min));
      return [pad + i * (W - 2 * pad) / (n - 1), y];
    });
    var d = 'M' + pts[0][0].toFixed(2) + ' ' + pts[0][1].toFixed(2);
    for (var i = 0; i < n - 1; i++) {   // Catmull-Rom → cubic Bézier, clamped to the plot area
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      var c1y = RS.clamp(p1[1] + (p2[1] - p0[1]) / 6, pad, H - pad), c2y = RS.clamp(p2[1] - (p3[1] - p1[1]) / 6, pad, H - pad);
      d += ' C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(2) + ' ' + c1y.toFixed(2) + ' ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(2) + ' ' + c2y.toFixed(2) +
        ' ' + p2[0].toFixed(2) + ' ' + p2[1].toFixed(2);
    }
    var last = pts[n - 1];
    var area = d + ' L' + last[0].toFixed(2) + ' ' + H + ' L' + pts[0][0].toFixed(2) + ' ' + H + ' Z';
    var gid = RS.uid('sg');
    var a11y = o.label ? ' role="img" aria-label="' + esc(o.label) + '"' : ' aria-hidden="true"';
    return '<svg class="chart spark' + (o.onDark ? ' on-dark' : '') + (o.cls ? ' ' + esc(o.cls) : '') + '" viewBox="0 0 ' + W + ' ' + H + '"' + a11y + ' focusable="false">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="stop-a"/><stop offset="1" class="stop-b"/></linearGradient></defs>' +
      '<line class="spark-base" x1="0" y1="' + (H - 0.5) + '" x2="' + W + '" y2="' + (H - 0.5) + '"/>' +
      '<path class="spark-area" d="' + area + '" fill="url(#' + gid + ')"/><path class="spark-line" d="' + d + '"/>' +
      '<circle class="spark-dot" cx="' + last[0].toFixed(2) + '" cy="' + last[1].toFixed(2) + '" r="4"/></svg>';
  };

  // arabic(text, {cls}) — Quranic / dua text in Amiri (loaded on first use), RTL, lang="ar"
  ui.arabic = function (text, o) {
    o = o || {};
    RS.loadFont('amiri');
    return '<p class="' + clsx('ar-text', o.cls) + '" lang="ar" dir="rtl">' + txt(text) + '</p>';
  };

  // stepper({title, sub, prev:{act, arg, label, disabled}, next:{…}, id, cls}) — the "‹ Day 17 ›" switcher.
  // Use relative args (e.g. '-1' / '+1') so RS.refresh() can put focus back on the same arrow.
  ui.stepper = function (o) {
    o = o || {};
    function side(s, icon, fallback) {
      if (!s) return '<span class="stepper-gap" aria-hidden="true"></span>';
      return '<button type="button" class="icon-btn"' + actAttrs(s.act, s.arg) + ' aria-label="' + esc(s.label || fallback) + '"' +
        (s.disabled ? ' disabled' : '') + '>' + RS.icon(icon, { size: 22 }) + '</button>';
    }
    return '<div class="' + clsx('stepper', o.cls) + '"' + attr('id', o.id) + '>' + side(o.prev, 'chevron-left', RS.t('core.prev')) +
      '<div class="stepper-label"><span class="stepper-title">' + txt(o.title) + '</span>' + (o.sub ? '<span class="stepper-sub">' + txt(o.sub) + '</span>' : '') + '</div>' +
      side(o.next, 'chevron-right', RS.t('core.next')) + '</div>';
  };

  // note(text, {icon='info', tone:'accent'|'plain'|'danger', html}) — inline notice inside a card or between cards.
  // html: raw HTML used instead of the escaped text (for a short message containing a link).
  ui.note = function (text, o) {
    o = o || {};
    var tone = o.tone === 'danger' || o.tone === 'plain' ? o.tone : 'accent';
    return '<p class="note note-' + tone + (o.cls ? ' ' + esc(o.cls) : '') + '"' + attr('id', o.id) + '>' + RS.icon(o.icon || 'info', { size: 18 }) +
      '<span>' + (o.html != null ? o.html : txt(text)) + '</span></p>';
  };

  // loading(text?) — spinner + label (role=status) while async content (leaderboards, AI) loads
  ui.loading = function (text) {
    return '<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span><span>' + txt(text || RS.t('core.loading')) + '</span></div>';
  };

  /* ------------------------------------------------------------------ actions (event delegation) */
  var acts = {};
  RS.act = function (name, fn) { acts[name] = fn; return fn; };
  RS.runAct = function (name, arg, el, e) {
    var fn = acts[name];
    if (!fn) { warnOnce('no action handler', name); return; }
    try { return fn(arg, el || null, e || null); } catch (err) { console.error('[RS] action "' + name + '" failed', err); }
  };
  doc.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    var name = el.getAttribute('data-act');
    if (el.tagName === 'A') {
      var h = el.getAttribute('href');
      if (!h || h === '#') e.preventDefault();
    }
    if (!acts[name]) { warnOnce('no action handler', name); return; }
    RS.runAct(name, el.getAttribute('data-arg'), el, e);
  });
  ['change', 'input'].forEach(function (type) {
    doc.addEventListener(type, function (e) {
      var src = e.target;
      var el = src && src.closest ? src.closest('[data-act-' + type + ']') : null;
      if (!el) return;
      var name = el.getAttribute('data-act-' + type);
      if (!acts[name]) { warnOnce('no action handler', name); return; }
      RS.runAct(name, src.type === 'checkbox' ? src.checked : src.value, el, e);
    });
  });
  doc.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.getAttribute || !form.getAttribute('data-act-submit')) return;
    e.preventDefault();
    var values = {};
    Array.prototype.forEach.call(form.elements, function (f) {
      if (!f.name || f.disabled) return;
      if (f.type === 'checkbox') values[f.name] = f.checked;
      else if (f.type === 'radio') { if (f.checked) values[f.name] = f.value; }
      else values[f.name] = f.value;
    });
    RS.runAct(form.getAttribute('data-act-submit'), values, form, e);
  });

  /* ------------------------------------------------------------------ overlays: shared modal plumbing */
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function focusables(container) {
    return RS.$$(FOCUSABLE, container).filter(function (el) { return el.offsetWidth > 0 || el.offsetHeight > 0 || el === doc.activeElement; });
  }
  function shellParts() { return ['topbar', 'view', 'nav'].map(function (id) { return doc.getElementById(id); }).filter(Boolean); }
  function setInert(els, on) {
    els.forEach(function (el) {
      if (!el) return;
      if (on) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); }
      else { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); }
      try { el.inert = !!on; } catch (e) { /* older browsers */ }
    });
  }
  function lockScroll(on) { root.classList.toggle('is-locked', !!on); }
  function showLayer(layer) {
    layer.classList.add('is-open');
    void layer.offsetWidth;                // commit the closed state so the transition runs
    layer.classList.add('is-shown');
  }
  function hideLayer(layer, stillOpen) {
    layer.classList.remove('is-shown');
    setTimeout(function () {
      if (stillOpen()) return;
      layer.classList.remove('is-open');
      layer.innerHTML = '';
    }, RS.reducedMotion() ? 0 : 240);
  }
  function restoreFocus(el) {
    if (el && el.focus && doc.contains(el)) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
  }

  /* ------------------------------------------------------------------ bottom sheet */
  var sheetState = null;
  RS.sheet = {
    // open({title, body(html), actions:[{text, act, arg, variant, icon, id, disabled}], onClose(), focus(selector), label, cls})
    open: function (o) {
      o = o || {};
      var layer = doc.getElementById('sheet-root');
      if (!layer) return null;
      if (sheetState) RS.sheet.close();
      var tid = RS.uid('sheet-title');
      var actions = (o.actions || []).map(function (a) {
        return ui.btn(a.text, { act: a.act, arg: a.arg, variant: a.variant || 'secondary', icon: a.icon, id: a.id, disabled: a.disabled, type: a.type, attrs: a.attrs });
      }).join('');
      layer.innerHTML = '<div class="scrim" data-act="sheet.close"></div>' +
        '<div class="' + clsx('sheet', o.cls) + '" role="dialog" aria-modal="true"' + (o.title ? ' aria-labelledby="' + tid + '"' : attr('aria-label', o.label || RS.t('core.app'))) + ' tabindex="-1">' +
        '<div class="sheet-grip" aria-hidden="true"></div>' +
        '<div class="sheet-hd">' + (o.title ? '<h2 class="sheet-title" id="' + tid + '">' + txt(o.title) + '</h2>' : '<span class="grow"></span>') +
        ui.iconBtn('x', { act: 'sheet.close', label: RS.t('core.close') }) + '</div>' +
        '<div class="sheet-bd">' + (o.body || '') + '</div>' + (actions ? '<div class="sheet-ft">' + actions + '</div>' : '') + '</div>';
      var st = { onClose: o.onClose, prev: doc.activeElement, layer: layer };
      sheetState = st;
      setInert(shellParts(), true);
      lockScroll(true);
      showLayer(layer);
      var panel = layer.querySelector('.sheet');
      var target = o.focus ? layer.querySelector(o.focus) : null;
      try { (target || panel).focus({ preventScroll: true }); } catch (e) { (target || panel).focus(); }
      return layer.querySelector('.sheet-bd');
    },
    close: function () {
      var st = sheetState;
      if (!st) return;
      sheetState = null;
      hideLayer(st.layer, function () { return !!sheetState; });
      if (!dlgState) { setInert(shellParts(), false); lockScroll(false); }
      restoreFocus(st.prev);
      if (typeof st.onClose === 'function') { try { st.onClose(); } catch (e) { console.error('[RS] sheet onClose failed', e); } }
    },
    isOpen: function () { return !!sheetState; },
    body: function () { return sheetState ? sheetState.layer.querySelector('.sheet-bd') : null; }
  };

  /* ------------------------------------------------------------------ confirm dialog */
  var dlgState = null;
  RS.confirm = function (o) {
    o = o || {};
    return new Promise(function (resolve) {
      var layer = doc.getElementById('dialog-root');
      if (!layer) { resolve(false); return; }
      if (dlgState) dlgState.done(false);
      var tid = RS.uid('dlg-title'), bid = RS.uid('dlg-body');
      layer.innerHTML = '<div class="scrim" data-act="dialog.cancel"></div>' +
        '<div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="' + tid + '"' + (o.body ? ' aria-describedby="' + bid + '"' : '') + ' tabindex="-1">' +
        '<h2 class="dialog-title" id="' + tid + '">' + txt(o.title || RS.t('core.confirm.title')) + '</h2>' +
        (o.body ? '<p class="dialog-body" id="' + bid + '">' + txt(o.body) + '</p>' : '') +
        '<div class="dialog-ft">' + ui.btn(o.cancel || RS.t('core.cancel'), { act: 'dialog.cancel', variant: 'secondary' }) +
        ui.btn(o.ok || RS.t('core.ok'), { act: 'dialog.ok', variant: o.danger ? 'danger' : 'primary' }) + '</div></div>';
      var prev = doc.activeElement;
      var others = shellParts().concat([doc.getElementById('sheet-root')]);
      var st = {
        done: function (v) {
          if (dlgState !== st) return;
          dlgState = null;
          hideLayer(layer, function () { return !!dlgState; });
          setInert([doc.getElementById('sheet-root')], false);
          if (!sheetState) { setInert(shellParts(), false); lockScroll(false); }
          restoreFocus(prev);
          resolve(!!v);
        }
      };
      dlgState = st;
      setInert(others, true);
      lockScroll(true);
      showLayer(layer);
      var btns = layer.querySelectorAll('.dialog-ft .btn');
      var first = o.danger ? btns[0] : btns[btns.length - 1];   // least destructive action first for danger
      try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
    });
  };

  doc.addEventListener('keydown', function (e) {
    var layer = dlgState ? doc.getElementById('dialog-root') : (sheetState ? doc.getElementById('sheet-root') : null);
    if (!layer) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      if (dlgState) dlgState.done(false); else RS.sheet.close();
      return;
    }
    if (e.key !== 'Tab') return;
    var panel = layer.querySelector('[role="dialog"],[role="alertdialog"]');
    var f = focusables(panel);
    if (!f.length) { e.preventDefault(); panel.focus(); return; }
    var first = f[0], last = f[f.length - 1], a = doc.activeElement;
    if (e.shiftKey && (a === first || a === panel || !panel.contains(a))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (a === last || !panel.contains(a))) { e.preventDefault(); first.focus(); }
  });

  /* ------------------------------------------------------------------ toast */
  RS.toast = function (msg, o) {
    o = o || {};
    var layer = doc.getElementById('toast-root');
    if (!layer) return { close: function () {} };
    var tone = o.tone === 'success' || o.tone === 'error' ? o.tone : 'default';
    var icon = tone === 'error' ? 'triangle-alert' : (tone === 'success' ? 'circle-check' : 'info');
    var el = doc.createElement('div');
    el.className = 'toast toast-' + tone;
    if (tone === 'error') el.setAttribute('role', 'alert');
    el.innerHTML = RS.icon(icon, { size: 20 }) + '<span>' + esc(msg) + '</span>';
    layer.appendChild(el);
    while (layer.children.length > 3) layer.removeChild(layer.firstChild);
    var gone = false;
    function hide() {
      if (gone) return;
      gone = true;
      el.classList.add('is-leaving');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
    }
    el.addEventListener('click', hide);
    setTimeout(hide, o.ms || (tone === 'error' ? 4500 : 2800));
    return { close: hide };
  };

  /* ------------------------------------------------------------------ topbar */
  // topbar({title, sub, back (true | fallback route), actions:[{icon, act, arg, label, href, id}]})
  RS.topbar = function (o) {
    o = o || {};
    var bar = doc.getElementById('topbar');
    var inner = bar && bar.querySelector('.topbar-in');
    if (!inner) return;
    var back = o.back ? '<button type="button" class="icon-btn topbar-back" data-act="nav.back"' + (typeof o.back === 'string' ? attr('data-arg', o.back) : '') +
      ' aria-label="' + esc(RS.t('core.back')) + '">' + RS.icon('chevron-left', { size: 24 }) + '</button>' : '';
    var titles = '<div class="topbar-titles">' + (o.sub ? '<span class="topbar-sub">' + txt(o.sub) + '</span>' : '') +
      '<h1 class="topbar-title" tabindex="-1">' + txt(o.title || RS.t('core.app')) + '</h1></div>';
    var actions = (o.actions || []).map(function (a) { return ui.iconBtn(a.icon, a); }).join('');
    inner.innerHTML = back + titles + '<div class="topbar-actions">' + actions + '</div>';
  };

  /* ------------------------------------------------------------------ router (hash) */
  var routes = {};
  var started = false, renders = 0;
  var cur = null, curDef = null;
  var stack = [];
  var scrollPos = {};
  var navIntent = null;
  var lastHash = null;
  RS.TABS = ['today', 'quran', 'learn', 'compete', 'me'];

  function cleanRoute(r) { return String(r == null ? '' : r).replace(/^[#/]+/, '').replace(/\/+$/, ''); }
  function parseHash(h) {
    h = String(h || '').replace(/^#\/?/, '');
    var qi = h.indexOf('?');
    var path = cleanRoute(qi >= 0 ? h.slice(0, qi) : h);
    var qs = qi >= 0 ? h.slice(qi + 1) : '';
    try { path = decodeURIComponent(path); } catch (e) { /* keep raw */ }
    var params = {};
    qs.split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      var k = i >= 0 ? kv.slice(0, i) : kv, v = i >= 0 ? kv.slice(i + 1) : '';
      try { k = decodeURIComponent(k.replace(/\+/g, ' ')); v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { /* keep raw */ }
      params[k] = v;
    });
    return { route: path, params: params };
  }
  function buildHash(route, params) {
    var p = params || {};
    var q = Object.keys(p).filter(function (k) { return p[k] != null && p[k] !== ''; }).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(p[k]);
    }).join('&');
    return '#/' + cleanRoute(route) + (q ? '?' + q : '');
  }
  function tabOf(route, def) {
    if (def && def.tab) return def.tab;
    var first = route.split('/')[0];
    return RS.TABS.indexOf(first) >= 0 ? first : null;
  }
  function isTabRoute(route) { return RS.TABS.indexOf(route) >= 0; }
  function parentOf(route) {
    var def = routes[route];
    if (def && def.parent) return def.parent;
    var i = route.lastIndexOf('/');
    if (i > 0) return route.slice(0, i);
    return (def && def.tab) || 'today';
  }
  function setNav(tab, showNav) {
    RS.$$('[data-nav]').forEach(function (a) {
      var on = a.getAttribute('data-nav') === tab;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    doc.body.classList.toggle('no-nav', !showNav);
  }
  function captureFocus(view) {
    var a = doc.activeElement;
    if (!a || a === doc.body || !view.contains(a)) return null;
    var q = function (s) { return String(s).replace(/["\\]/g, '\\$&'); };
    if (a.id) return '[id="' + q(a.id) + '"]';
    var act = a.getAttribute('data-act');
    if (act) {
      var arg = a.getAttribute('data-arg');
      return '[data-act="' + q(act) + '"]' + (arg != null ? '[data-arg="' + q(arg) + '"]' : '');
    }
    return null;
  }
  var rendering = false;
  function renderInto(view, def, params) {
    rendering = true;
    try { renderRoute(view, def, params); } finally { rendering = false; }
  }
  function renderRoute(view, def, params) {
    var tab = tabOf(cur.route, def);
    var isTab = isTabRoute(cur.route);
    setNav(tab, def ? (def.nav != null ? !!def.nav : isTab) : true);
    var title = '';
    try { title = def && def.title ? def.title(params) : (isTab ? RS.t('nav.' + cur.route) : ''); } catch (e) { console.error(e); }
    RS.topbar({ title: title, back: !isTab });
    view.innerHTML = '';
    if (!def) {
      view.innerHTML = ui.empty({ icon: 'compass', title: RS.t('core.notFound.title'), body: RS.t('core.notFound.body'), action: { text: RS.t('core.goHome'), act: 'nav.go', arg: 'today' } });
      RS.topbar({ title: RS.t('core.notFound.title'), back: 'today' });
    } else {
      try { def.render(view, params); } catch (err) {
        console.error('[RS] render failed for "' + cur.route + '"', err);
        view.innerHTML = ui.empty({ icon: 'triangle-alert', title: RS.t('err.render.title'), body: RS.t('err.render.body'), action: { text: RS.t('core.goHome'), act: 'nav.go', arg: 'today' } });
      }
    }
    var h1 = doc.querySelector('#topbar .topbar-title');
    var t = h1 ? h1.textContent : '';
    doc.title = t && t !== RS.t('core.app') ? t + ' \u00b7 ' + RS.t('core.app') : RS.t('core.app');
  }
  function navigate(o) {
    var view = doc.getElementById('view');
    if (!view) return;
    var parsed = parseHash(location.hash);
    if (!parsed.route) parsed.route = 'today';
    if (cur && curDef && curDef.onHide) { try { curDef.onHide(); } catch (e) { console.error(e); } }
    if (cur) scrollPos[cur.key] = window.pageYOffset;
    if (dlgState) dlgState.done(false);
    if (sheetState) RS.sheet.close();
    var key = parsed.route + buildHash('', parsed.params).slice(2);
    cur = { route: parsed.route, params: parsed.params, key: key };
    curDef = routes[parsed.route] || null;
    lastHash = location.hash;
    renderInto(view, curDef, parsed.params);
    var y = (o.back || isTabRoute(parsed.route)) ? (scrollPos[key] || 0) : 0;
    window.scrollTo(0, y);
    if (curDef && curDef.onShow) { try { curDef.onShow(parsed.params); } catch (e) { console.error(e); } }
    renders += 1;
    RS.emit('route', { route: parsed.route, params: parsed.params });
    if (renders > 1) {
      var h1 = doc.querySelector('#topbar .topbar-title');
      if (h1) { try { h1.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    }
  }
  function onHashChange() {
    var h = location.hash || '';
    if (h && h.indexOf('#/') !== 0) return;          // in-page anchors (#view) are not routes
    if (h === lastHash) return;
    var intent = navIntent;
    navIntent = null;
    var isBack = false;
    if (intent === 'replace' && stack.length) stack[stack.length - 1] = h;
    else if (stack.length > 1 && stack[stack.length - 2] === h) { stack.pop(); isBack = true; }
    else stack.push(h);
    navigate({ back: isBack });
  }

  RS.router = {
    register: function (route, def) {
      route = cleanRoute(route);
      if (!def || typeof def.render !== 'function') { console.error('[RS] router.register("' + route + '") needs a render(rootEl, params) function'); return; }
      routes[route] = def;
      if (started && cur && cur.route === route) RS.refresh();
    },
    has: function (route) { return hasOwn.call(routes, cleanRoute(route)); },
    href: function (route, params) { return buildHash(route, params); },
    current: function () { return cur ? { route: cur.route, params: cur.params } : parseHash(location.hash); },
    // go('learn/quiz', {cat:'fasting'}) · go('learn/quiz?cat=fasting') · go('me', null, {replace:true})
    go: function (route, params, o) {
      route = String(route == null ? 'today' : route);
      if (route.indexOf('?') >= 0) {
        var p = parseHash(route);
        route = p.route;
        params = Object.assign(p.params, params || {});
      }
      var h = buildHash(route, params);
      if (location.hash === h) { if (started) navigate({}); return; }
      if (!started) { history.replaceState(history.state, '', location.pathname + location.search + h); return; }
      navIntent = o && o.replace ? 'replace' : 'push';
      if (o && o.replace) location.replace(location.pathname + location.search + h);
      else location.hash = h;
    },
    back: function (fallback) {
      if (stack.length > 1) { history.back(); return; }
      var c = RS.router.current();
      RS.router.go(fallback || parentOf(c.route || 'today'), null, { replace: true });
    },
    start: function () {
      if (started) return;
      started = true;
      try { history.scrollRestoration = 'manual'; } catch (e) { /* ignore */ }
      var h = location.hash;
      if (!h || h === '#' || h === '#/' || h.indexOf('#/') !== 0) {
        history.replaceState(history.state, '', location.pathname + location.search + '#/today');
      }
      stack = [location.hash];
      window.addEventListener('hashchange', onHashChange);
      window.addEventListener('scroll', function () {
        var bar = doc.getElementById('topbar');
        if (bar) bar.classList.toggle('is-scrolled', window.pageYOffset > 4);
      }, { passive: true });
      navigate({});
    },
    started: function () { return started; }
  };

  RS.refresh = function () {
    if (!started || !cur) return;
    if (rendering) { warnOnce('RS.refresh() ignored', 'called while a route was rendering'); return; }
    var view = doc.getElementById('view');
    if (!view) return;
    var y = window.pageYOffset;
    var focusSel = captureFocus(view);
    renderInto(view, curDef, cur.params);
    window.scrollTo(0, y);
    if (focusSel) {
      var el = view.querySelector(focusSel);
      if (el) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
    }
  };

  /* ------------------------------------------------------------------ misc */
  RS.buzz = function (ms) {
    try { if (navigator.vibrate && !RS.reducedMotion()) navigator.vibrate(ms || 10); } catch (e) { /* ignore */ }
  };
  var lazyCache = {};
  RS.lazy = function (src) {
    if (lazyCache[src]) return lazyCache[src];
    var p = new Promise(function (resolve, reject) {
      var s = doc.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () {
        delete lazyCache[src];
        if (s.parentNode) s.parentNode.removeChild(s);
        reject(new Error('Failed to load ' + src));
      };
      (doc.head || doc.documentElement).appendChild(s);
    });
    lazyCache[src] = p;
    return p;
  };

  /* ------------------------------------------------------------------ built-in actions */
  RS.act('noop', function () {});
  RS.act('nav.back', function (arg) { RS.router.back(arg || undefined); });
  RS.act('nav.go', function (arg) { if (arg) RS.router.go(arg); });
  RS.act('nav.skip', function (arg, el, e) {
    if (e) e.preventDefault();
    var v = doc.getElementById('view');
    if (v) { try { v.focus({ preventScroll: false }); } catch (err) { v.focus(); } }
  });
  RS.act('sheet.close', function () { RS.sheet.close(); });
  RS.act('dialog.ok', function () { if (dlgState) dlgState.done(true); });
  RS.act('dialog.cancel', function () { if (dlgState) dlgState.done(false); });
  RS.act('theme.set', function (arg) { RS.setTheme(arg); });
  RS.act('lang.set', function (arg) { RS.setLang(arg); });

  // Settings are available as soon as core.js has run (modules may read them while loading).
  RS.loadSettings();
})();
