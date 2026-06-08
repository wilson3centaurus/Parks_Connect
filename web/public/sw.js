// Parks Connect — Service Worker
// Strategy:
//   Static assets  → Cache-first  (CSS, images, fonts)
//   Public pages   → Network-first, cache fallback, then /offline
//   API / Auth     → Network-only  (never cache)

const CACHE_VER    = 'v3';
const STATIC_CACHE = `zp-static-${CACHE_VER}`;
const PAGE_CACHE   = `zp-pages-${CACHE_VER}`;
const OFFLINE_URL  = '/offline';

// Assets pre-cached on install — must all succeed
const PRECACHE_STATIC = [
  '/manifest.json',
  '/public/css/styles.css',
  '/public/images/logo.png',
  OFFLINE_URL
];

// Pages pre-cached opportunistically — failures are silently ignored
const PRECACHE_PAGES = ['/parks', '/feedback', '/'];

// Paths that must never be served from cache
const NETWORK_ONLY = ['/api/', '/dashboard', '/login', '/logout', '/sw.js'];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      // Hard precache — any failure aborts the SW install
      caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_STATIC)),
      // Soft precache — best-effort
      caches.open(PAGE_CACHE).then(cache =>
        Promise.allSettled(PRECACHE_PAGES.map(url =>
          cache.add(new Request(url, { credentials: 'same-origin' }))
        ))
      )
    ]).then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => {
        const live = new Set([STATIC_CACHE, PAGE_CACHE]);
        return Promise.all(keys.filter(k => !live.has(k)).map(k => caches.delete(k)));
      })
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only intercept same-origin and CDN requests we explicitly whitelist
  const isSameOrigin = url.origin === self.location.origin;

  // Never touch these — pass straight through
  if (isSameOrigin && NETWORK_ONLY.some(p => url.pathname.startsWith(p))) return;

  // ── External resources (fonts, CDN) — cache-first ──────────────────────────
  if (!isSameOrigin) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(STATIC_CACHE).then(c => c.put(request, clone));
        }
        return resp;
      }).catch(() => cached))
    );
    return;
  }

  // ── Static assets — cache-first, refresh in background ────────────────────
  if (
    url.pathname.startsWith('/public/') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async cache => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request).then(resp => {
          if (resp.ok) cache.put(request, resp.clone());
          return resp;
        }).catch(() => null);
        return cached || networkPromise;
      })
    );
    return;
  }

  // ── HTML pages — network-first, cached fallback, offline page ─────────────
  event.respondWith(
    fetch(request)
      .then(resp => {
        // Cache successful page responses (2xx)
        if (resp.ok && resp.status < 300) {
          const clone = resp.clone();
          caches.open(PAGE_CACHE).then(c => c.put(request, clone));
        }
        return resp;
      })
      .catch(async () => {
        // Network failed — try cache first
        const cached = await caches.match(request);
        if (cached) return cached;
        // Nothing in cache for navigation requests → show offline page
        if (request.destination === 'document' || request.headers.get('accept')?.includes('text/html')) {
          return caches.match(OFFLINE_URL);
        }
      })
  );
});

// ── Message: force update ─────────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
