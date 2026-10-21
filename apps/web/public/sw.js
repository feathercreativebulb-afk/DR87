/* Dust Runner '87 service worker — offline play for the web/PWA build.
 * Cache-first for everything same-origin: the shell is precached on install, models and
 * music are cached the first time they play. Bump VERSION to drop old caches on deploy. */
const VERSION = 'dr87-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // audio asks for byte ranges; cache and answer with the whole file, keyed by URL
  const key = req.headers.has('range') ? new Request(req.url) : req;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(key, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(key);
      if (res.ok && res.status === 200) cache.put(key, res.clone());
      return res;
    }),
  );
});
