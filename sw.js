/* Ramadan Strivers service worker: offline shell + web push. Bump VERSION when shipping. */
const VERSION = 'rs-v9';
const CORE = ['/', '/index.html', '/i18n.js', '/cloud.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(e.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/s/')) return; // API & share pages: always network
  if(url.origin !== location.origin){ // CDN libs: cache-first
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res; }).catch(() => r))); return; }
  // Own files: network-first with cache fallback, so updates arrive immediately and offline still works
  e.respondWith(fetch(e.request).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res; })
    .catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('/index.html') : undefined)) ));
});
self.addEventListener('push', e => {
  let d = { title: '🌙 Ramadan Strivers', body: 'Time to log your deeds.', url: '/' }; try { d = Object.assign(d, e.data.json()); } catch(err){}
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: d.url }, tag: 'rs-daily', renotify: true }));
});
self.addEventListener('notificationclick', e => { e.notification.close(); const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { for(const c of cs){ if('focus' in c){ c.navigate(url); return c.focus(); } } return self.clients.openWindow(url); })); });
