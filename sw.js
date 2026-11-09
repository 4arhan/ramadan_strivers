/* Ramadan Strivers service worker (v8): offline app shell + web push.
   - HTML / navigations: network-first (3.5 s timeout), falling back to the cached shell when offline.
   - Same-origin static files (css/*, js/*, vendor/*, icons/*, manifest): cache-first. The shell list below is
     precached at install with the same ?v= query index.html uses, so a release that bumps ?v= never mixes versions.
   - Other languages (js/lang/<code>.js) and anything else static: cached on first use.
   - Google Fonts (CSS + font files): cache-first.
   - /api/*, /s/* share pages, /poster/*: never cached.
   Shipping: bump VERSION, and ASSET_V together with the ?v= query strings in index.html. */
const VERSION = 'rs-v8.0.0-1';
const ASSET_V = '8.0.0';
const SHELL_FILES = [
  'css/app.css', 'css/tracker.css', 'css/learn.css', 'css/prep.css', 'css/cloud.css',
  'js/core.js', 'js/icons.js', 'js/lang/en.js', 'js/content.js',
  'js/tracker.js', 'js/learn.js', 'js/prep.js', 'js/cloud.js', 'js/main.js'
].map(p => '/' + p + '?v=' + ASSET_V);
const STATIC_FILES = [
  '/', '/manifest.webmanifest', '/vendor/adhan.umd.min.js',
  '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png',
  'https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap'
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const NEVER_CACHE = /^\/(api|s|poster)\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.all(SHELL_FILES.concat(STATIC_FILES).map(u => c.add(u).catch(() => null))))
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

function networkFirst(req) {
  return new Promise(resolve => {
    let settled = false;
    const finish = r => { if (!settled && r) { settled = true; resolve(r); } };
    const timer = setTimeout(() => { shellFromCache(req).then(finish); }, 3500);
    fetch(req).then(res => {
      clearTimeout(timer);
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put('/', copy)); }
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
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: d.url }, tag: 'rs-daily', renotify: true
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
