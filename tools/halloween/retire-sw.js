/* Published at /DR87/sw.js while the Halloween event runs. Browsers that played the full game before still have its
 * offline cache, which would keep serving the full game. They check this file on their next visit, install this
 * version, and it deletes those caches and unregisters itself, so the event page loads from the network. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
  })());
});
