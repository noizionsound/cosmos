// ─── COSMOS Service Worker ────────────────────────────────────────────────────
// Strategy:
//   Code files (JS / HTML / CSS) → network-first, no-store
//     → always loads the latest deployed version automatically
//   Media files (mp4 / opus / ogg / jpg / png) → cache-first
//     → large files don't re-download on every visit
// ─────────────────────────────────────────────────────────────────────────────

const CACHE      = 'cosmos-media-v1';
const MEDIA_EXTS = ['.mp4', '.ogg', '.opus', '.jpg', '.png', '.webm', '.gif'];

// Activate immediately — no waiting for old tabs to close
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Only handle same-origin and CDN requests
  if (e.request.method !== 'GET') return;

  const isMedia = MEDIA_EXTS.some(ext => url.pathname.toLowerCase().endsWith(ext));

  if (isMedia) {
    // ── Cache-first for media ──────────────────────────────────────────────
    // IMPORTANT: only cache status 200 (full response).
    // Status 206 = Range Request (browser streams audio/video in chunks).
    // Cache API rejects 206 responses — catching the error and skipping cache.
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(res => {
            if (res.status === 200) {
              cache.put(e.request, res.clone()).catch(() => {});
            }
            return res;
          });
        })
      )
    );
  } else {
    // ── Network-first for code (JS / HTML / CSS / JSON) ───────────────────
    // cache: 'no-store' bypasses HTTP cache so fresh code is always fetched.
    // Falls back to SW cache if offline.
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .catch(() => caches.match(e.request))
    );
  }
});
