// Minimal offline support: network first, fall back to cache (app shell + CPR guide keep working offline).
// Bump CACHE on every deploy; activate deletes every other cache, including ones left by older builds
// served from this origin, so a stale shell can never win over the current app.
// /api is never cached: it carries personal data (account, location) and must not outlive the session.
const CACHE = 'defikarta-v6';
// A tab on the 112 or CPR screen is never reloaded under the user; it picks up the new build next time.
const BUSY = /^\/(emergency|cpr)\b/;
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.add('/'))); });
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((wins) => wins.filter((w) => !BUSY.test(new URL(w.url).pathname)).forEach((w) => w.navigate(w.url))),
  ),
);
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith('http') || new URL(req.url).pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && new URL(req.url).origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('/') : undefined))),
  );
});
