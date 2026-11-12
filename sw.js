/* Service worker : garde l'application et les tuiles de carte pour l'usage sans réseau */
const APP_CACHE = 'affut-app-v1';
const TILE_CACHE = 'affut-tiles-v1';
const APP_FILES = [
  './', './index.html', './style.css', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];
const TILE_HOSTS = ['server.arcgisonline.com', 'tile.opentopomap.org'];
const tileKey = u => u.replace(/\/\/[abc]\.tile\.opentopomap\.org/, '//tile.opentopomap.org');
const isTile = url => TILE_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('affut-app-') && k !== APP_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (isTile(url)) {
    // Tuiles : d'abord la mémoire du téléphone, sinon Internet (et on garde une copie)
    const key = tileKey(req.url);
    e.respondWith(caches.open(TILE_CACHE).then(async cache => {
      const hit = await cache.match(key);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && res.type !== 'opaque') cache.put(key, res.clone());
        return res;
      } catch (err) {
        return new Response('', { status: 504, statusText: 'Hors ligne' });
      }
    }));
    return;
  }

  // Application : copie locale tout de suite (rapide même avec un signal faible),
  // mise à jour en arrière-plan quand Internet répond
  if (url.origin !== location.origin && url.hostname !== 'unpkg.com') return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(APP_CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => hit || caches.match('./index.html'));
    return hit || net;
  }));
});
