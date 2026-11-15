/* =====================================================================================================
   Ramadan Strivers v8 — demo-guard.js: what keeps the live demo (?demo=1) apart from everything real.

   index.html loads this file before any other script, and only in demo mode. If it does not load, or cannot do its
   job, index.html stops the page: nothing of the app runs. It depends on nothing, and what it sets up holds whatever
   js/demo.js or the app do afterwards:

   Storage     localStorage and sessionStorage are replaced by a copy kept in memory (carried through a reload in one
               key of the real session storage, rs-demo, gone when the tab closes). Where the browser will not let
               the objects be replaced, their methods are redirected instead and a probe proves a write no longer
               arrives. The app must keep to getItem, setItem, removeItem, key and length.
   Server      fetch() to /api/ never leaves the page. js/demo.js answers (RS_DEMO.answer); what it does not answer
               gets "switched off in the demo". The one exception is the city search, sent as a bare address with no
               headers, body or credentials. The app must use fetch() for every server call.
   Pages       A link that would leave the demo (the privacy page, anything that is not this page) opens in a new
               tab, so the demo's own window can never turn into the real app. Pages the server makes for a real
               competition (poster, public page, league page, share link) are not opened at all.
   The device  Nothing is asked of the app's service worker: no registration, no look-up (so the visitor's real
               reminders cannot be cancelled from here).
   Statistics  Off: nothing is handed to the tag in index.html (js/track.js stays silent as well).

   Address     ?fresh=1 starts the sample again · ?kids=1 / ?kids=0 opens it in kids or grown-up mode ·
               ?open=prayer opens the day's prayer times. Read once, then taken out of the address so a reload keeps
               what happened since.
   ===================================================================================================== */
(function () {
  if (window.RS_DEMO || !/[?&]demo=1(&|$)/.test(location.search)) return;

  /* ------------------------------------------------------------------ what the address asks for */
  var ask = {}, rest = [];
  location.search.replace(/^\?/, '').split('&').forEach(function (p) {
    if (!p) return;
    var i = p.indexOf('='), k = i < 0 ? p : p.slice(0, i);
    if (k === 'fresh' || k === 'kids' || k === 'open') ask[k] = i < 0 ? '' : p.slice(i + 1); else rest.push(p);
  });
  if (ask.fresh !== undefined || ask.kids !== undefined || ask.open !== undefined) {
    try { history.replaceState(history.state, '', location.pathname + '?' + rest.join('&') + location.hash); } catch (e) { /* the address stays */ }
  }

  /* ------------------------------------------------------------------ storage */
  var KEY = 'rs-demo', real = null, realLocal = null, st = null, ok = false;
  try { realLocal = window.localStorage; } catch (e) { realLocal = null; }
  try { real = window.sessionStorage; st = ask.fresh === '1' ? null : JSON.parse(real.getItem(KEY) || 'null'); } catch (e) { st = null; }
  if (!st || st.v !== 1 || !st.l || !st.s || typeof st.l !== 'object' || typeof st.s !== 'object') st = { v: 1, l: {}, s: {} };
  var put = function (k, v) { real.setItem(k, v); };                   // how the demo's own state reaches the real session storage
  function keep() { try { if (real) put(KEY, JSON.stringify(st)); } catch (e) { /* memory only */ } }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function store(o) {
    return {
      getItem: function (k) { k = String(k); return has(o, k) ? o[k] : null; },
      setItem: function (k, v) { o[String(k)] = String(v); keep(); },
      removeItem: function (k) { delete o[String(k)]; keep(); },
      clear: function () { Object.keys(o).forEach(function (k) { delete o[k]; }); keep(); },
      key: function (i) { var ks = Object.keys(o); return i >= 0 && i < ks.length ? ks[i] : null; },
      get length() { return Object.keys(o).length; }
    };
  }
  var ls = store(st.l), ss = store(st.s);
  // The first way: the page gets other storage objects.
  try {
    Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { return ls; } });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get: function () { return ss; } });
    ok = window.localStorage === ls && window.sessionStorage === ss;
  } catch (e) { ok = false; }
  // The second way: the real objects stay, and their methods lead to the copy.
  if (!ok) ok = (function () {
    try {
      var P = window.Storage.prototype, get = P.getItem, set = P.setItem, del = P.removeItem, clr = P.clear, key = P.key, len = Object.getOwnPropertyDescriptor(P, 'length');
      var mine = function (x) { return x === ls || x === ss ? x : (realLocal && x === realLocal ? ls : (real && x === real ? ss : null)); };
      put = function (k, v) { set.call(real, k, v); };
      P.getItem = function (k) { var m = mine(this); return m ? m.getItem(k) : get.apply(this, arguments); };
      P.setItem = function (k, v) { var m = mine(this); return m ? m.setItem(k, v) : set.apply(this, arguments); };
      P.removeItem = function (k) { var m = mine(this); return m ? m.removeItem(k) : del.apply(this, arguments); };
      P.clear = function () { var m = mine(this); return m ? m.clear() : clr.apply(this, arguments); };
      P.key = function (i) { var m = mine(this); return m ? m.key(i) : key.apply(this, arguments); };
      Object.defineProperty(P, 'length', { configurable: true, enumerable: true, get: function () { var m = mine(this); return m ? m.length : len.get.call(this); } });
      // the proof: something written the way the app writes it must not arrive in the real storage, either kind
      var probe = 'rs-demo-probe', leaked = false;
      window.localStorage.setItem(probe, '1'); window.sessionStorage.setItem(probe, '1');
      if (realLocal && get.call(realLocal, probe) !== null) { leaked = true; del.call(realLocal, probe); }
      if (real && get.call(real, probe) !== null) { leaked = true; del.call(real, probe); }
      var seen = window.localStorage.getItem(probe) === '1' && window.sessionStorage.getItem(probe) === '1' && has(st.l, probe) && has(st.s, probe);
      window.localStorage.removeItem(probe); window.sessionStorage.removeItem(probe);
      return seen && !leaked;
    } catch (e) { return false; }
  })();
  if (!ok) return;                                   // index.html stops the page: window.RS_DEMO was never set

  /* ------------------------------------------------------------------ statistics */
  // The tag in index.html reads its orders from window.dataLayer. In the demo that list takes nothing in and cannot
  // be swapped for another, so the tag has nothing to send, whatever its ID is.
  try {
    var none = [], swallow = function () { return 0; }, ignore = function () {};
    Object.defineProperty(none, 'push', { configurable: false, get: function () { return swallow; }, set: ignore });
    Object.defineProperty(window, 'dataLayer', { configurable: false, get: function () { return none; }, set: ignore });
  } catch (e) { /* the switch below still applies */ }
  window['ga-disable-G-Y3WDNYW5P2'] = true;

  /* ------------------------------------------------------------------ the device */
  try {
    var sw = navigator.serviceWorker;
    if (sw) {
      sw.register = function () { return Promise.reject(new Error('demo')); };
      sw.getRegistration = function () { return Promise.resolve(undefined); };
      sw.getRegistrations = function () { return Promise.resolve([]); };
      Object.defineProperty(sw, 'ready', { configurable: true, get: function () { return new Promise(function () {}); } });
    }
  } catch (e) { /* js/main.js does not register one in the demo either */ }

  var D = window.RS_DEMO = { fresh: !has(st.l, 'rs-settings'), kids: ask.kids === '1' ? true : (ask.kids === '0' ? false : null), open: ask.open === 'prayer' ? 'prayer' : '', answer: null, blocked: null };

  /* ------------------------------------------------------------------ the server */
  function addr(x) { try { return new URL(typeof x === 'string' ? x : (x && typeof x.url === 'string' ? x.url : String(x)), location.href); } catch (e) { return null; } }
  // The app's server is this site, or the one a build of the app was pointed at (window.RS_API_BASE, set later).
  function ours(u) {
    if (!u) return false;
    if (u.origin === location.origin) return true;
    try { return !!window.RS_API_BASE && u.origin === new URL(String(window.RS_API_BASE), location.href).origin; } catch (e) { return false; }
  }
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  function gone() { return Promise.reject(new TypeError('Failed to fetch')); }
  window.fetch = function (input, init) {
    var u = addr(input);
    if (!u) return gone();
    if (!ours(u) || u.pathname.indexOf('/api/') !== 0) return realFetch ? realFetch(input, init) : gone();
    var asked = typeof Request !== 'undefined' && input instanceof Request ? input : null;
    var path = u.pathname.replace(/^\/api\//, '').replace(/\/+$/, ''), method = String((init && init.method) || (asked && asked.method) || 'GET').toUpperCase();
    // the city search only reads: the address travels, nothing else
    if (path === 'geo' && method === 'GET') return realFetch ? realFetch(u.href, { method: 'GET', credentials: 'omit', cache: 'no-store' }) : gone();
    var text = init && typeof init.body === 'string' ? Promise.resolve(init.body) : (asked && !(init && init.body) ? asked.clone().text().then(null, function () { return ''; }) : Promise.resolve(''));
    return text.then(function (t) {
      var body = null;
      try { body = t ? JSON.parse(t) : null; } catch (e) { body = null; }
      return new Promise(function (resolve) {
        setTimeout(function () {
          var r = null;
          try { r = D.answer ? D.answer(path, method, u.searchParams, body) : null; } catch (e) { r = [500, { error: 'server', message: 'Demo error' }]; }
          if (!r) r = [403, { error: 'demo', message: 'This is switched off in the demo.' }];
          resolve(new Response(JSON.stringify(r[1]), { status: r[0], headers: { 'Content-Type': 'application/json' } }));
        }, 120);
      });
    });
  };

  /* ------------------------------------------------------------------ other pages */
  function serverPage(u) { return ours(u) && /^\/(poster|o|l|s|api)\//.test(u.pathname); }
  function blocked() { try { if (D.blocked) D.blocked(); } catch (e) { /* no message, then */ } }
  var realOpen = window.open;
  window.open = function (url) {
    var u = url ? addr(url) : null;
    if (u && serverPage(u)) {
      blocked();
      return { closed: true, opener: null, close: function () {}, focus: function () {}, location: {}, document: { open: function () {}, write: function () {}, close: function () {}, title: '', body: null } };
    }
    return realOpen.apply(window, arguments);
  };
  // After the app has had its say about a click: a link to anywhere but this page opens in a new tab. The demo's own
  // way out (data-demo-exit, on its label when the demo has a page to itself) and files to save are left alone.
  window.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.hasAttribute('data-demo-exit') || a.hasAttribute('download')) return;
    var u = addr(String(a.getAttribute('href')));
    if (!u || (u.protocol !== 'http:' && u.protocol !== 'https:')) return;
    if (u.origin === location.origin && u.pathname === location.pathname && u.search === location.search) return;     // a move within the app
    e.preventDefault();
    if (serverPage(u)) { blocked(); return; }
    realOpen.call(window, u.href, '_blank', 'noopener,noreferrer');
  }, false);
  // The app handles its forms itself. One the browser sent instead would load this address without ?demo=1.
  window.addEventListener('submit', function (e) { e.preventDefault(); }, false);

  /* ------------------------------------------------------------------ a first look for the app */
  if (D.fresh) {
    ls.setItem('rs-setup', '1'); ls.setItem('rs-consent', 'no'); ls.setItem('rs-inst-x', '1');
    ls.setItem('rs-settings', JSON.stringify({ mode: 'ramadan', day: 12, theme: 'light', themeChosen: true, detail: true }));
  }
  document.write('<script src="data/cities.js"><\/script>');           // so the demo can show prayer times for the visitor's time zone at once
})();
