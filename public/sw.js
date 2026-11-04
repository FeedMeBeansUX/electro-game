// Offline support. Pages are fetched network-first (so updates arrive when
// online); everything else (scripts, icons, voice files) is served from the
// cache and refreshed in the background, so the game keeps working offline.
const CACHE = 'stroomkring-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./'))),
    );
    return;
  }

  // Stale-while-revalidate: answer from the cache straight away, and refresh
  // the cached copy in the background (so a replaced voice recording updates).
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((hit) => {
        const update = fetch(req)
          .then((res) => {
            // Only cache real files (a missing voice file must stay missing).
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit || Response.error());
        return hit || update;
      }),
    ),
  );
});
