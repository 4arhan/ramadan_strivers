/* Ramadan Strivers service worker (v8): offline app shell + web push.
   - HTML / navigations: network-first (3.5 s timeout), falling back to the cache when offline. Only the app shell
     (/, /index.html, /join/<code>) is stored under '/'; any other page (privacy.html, …) is stored under its own
     URL, so opening it can never replace the shell the installed app starts from.
   - Same-origin static files (css/*, js/*, vendor/*, icons/*, manifest): cache-first. The shell list below is
     precached at install with the same ?v= query index.html uses, so a release that bumps ?v= never mixes versions.
   - Other languages (js/lang/<code>.js) and anything else static: cached on first use.
   - Google Fonts (CSS + font files): cache-first.
   - /api/*, /s/* share pages, /poster/*: never cached.
   Shipping: bump VERSION, and ASSET_V together with the ?v= query strings in index.html (ICON_V with the icon URLs
   in index.html and manifest.webmanifest when the app icon changes). */
const VERSION = 'rs-v8.0.0-5';   // -3: drops caches whose '/' entry a visit to privacy.html had replaced
const ASSET_V = '8.0.0';
const ICON_V = '8';            // icons are cached as immutable: a new icon needs a new ?v= (index.html, manifest, push)
const SHELL_FILES = [
  'css/app.css', 'css/tracker.css', 'css/learn.css', 'css/prep.css', 'css/cloud.css', 'css/social.css',
  'js/core.js', 'js/icons.js', 'js/lang/en.js', 'js/content.js',
  'js/tracker.js', 'js/learn.js', 'js/prep.js', 'js/cloud.js', 'js/social.js', 'js/main.js'
].map(p => '/' + p + '?v=' + ASSET_V);
const STATIC_FILES = [
  '/', '/manifest.webmanifest', '/vendor/adhan.umd.min.js', '/vendor/honorific.woff2',
  '/icons/icon.svg?v=' + ICON_V, '/icons/icon-192.png?v=' + ICON_V, '/icons/icon-512.png?v=' + ICON_V,
  '/icons/maskable-512.png?v=' + ICON_V, '/icons/apple-touch-icon.png?v=' + ICON_V, '/icons/badge-96.png?v=' + ICON_V,
  'https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap'
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const NEVER_CACHE = /^\/(api|s|poster)\//;

self.addEventListener('install', e => {
  // cache: 'reload' skips the HTTP cache, so a new release never precaches a stale copy
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.all(SHELL_FILES.concat(STATIC_FILES).map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('rs-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function cacheable(res) { return res && (res.ok || res.type === 'opaque'); }

function cacheFirst(req) {
  return caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (cacheable(res)) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }));
}

function shellFromCache(req) {
  return caches.match(req, { ignoreSearch: true })
    .then(r => r || caches.match('/', { ignoreSearch: true }))
    .then(r => r || caches.match('/index.html', { ignoreSearch: true }));
}

// The pages that ARE the app (Vercel rewrites /join/<code> to /?join=<code>): stored under the one '/' key.
function isShell(url) {
  const p = url.pathname;
  return p === '/' || p === '/index.html' || p.startsWith('/join/');
}

function networkFirst(req) {
  const shell = isShell(new URL(req.url));
  return new Promise(resolve => {
    let settled = false;
    const finish = r => { if (!settled && r) { settled = true; resolve(r); } };
    const timer = setTimeout(() => { shellFromCache(req).then(finish); }, 3500);
    fetch(req).then(res => {
      clearTimeout(timer);
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(shell ? '/' : req, copy)); }
      if (!settled) { settled = true; resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      shellFromCache(req).then(r => {
        if (settled) return;
        settled = true;
        resolve(r || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
      });
    });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (NEVER_CACHE.test(url.pathname) || url.pathname === '/sw.js') return;     // always network
    if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) { e.respondWith(networkFirst(req)); return; }
    e.respondWith(cacheFirst(req));
    return;
  }
  if (FONT_HOSTS.includes(url.hostname)) e.respondWith(cacheFirst(req));
  // any other origin (analytics, CDNs loaded on demand): browser default
});

self.addEventListener('push', e => {
  let d = { title: 'Ramadan Strivers', body: 'Time to log your deeds.', url: '/' };
  try { d = Object.assign(d, e.data.json()); } catch (err) { /* plain text or no payload */ }
  // badge: Android draws it as an alpha mask in the status bar, so it is a white crescent on transparent
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: '/icons/icon-192.png?v=' + ICON_V, badge: '/icons/badge-96.png?v=' + ICON_V, data: { url: d.url }, tag: 'rs-daily', renotify: true
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
