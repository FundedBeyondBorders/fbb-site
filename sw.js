// Service worker for FundedBeyondBorders — enables "Install as app" on every
// OS (Android, iOS 16.4+, Windows, macOS, Linux) and a fast app-shell load.
//
// SAFETY-CRITICAL DESIGN CHOICE: this is a live trading platform. A stale
// price, balance, or position shown from a cache could cost someone real
// money or a wrong decision. So this service worker ONLY EVER caches the
// static app shell (HTML/CSS/JS/icons/manifest) — never anything else:
//   - Any cross-origin request (the trading engine API lives on a
//     different domain) is untouched — goes straight to the network,
//     every time, no exceptions.
//   - Any same-origin request that isn't a recognized static file
//     extension is untouched too, as a second safety net.
//   - Static files use "stale-while-revalidate": the cached copy (if any)
//     is served instantly for speed, while a fresh copy is fetched in the
//     background to update the cache for next time — so the SHELL loads
//     fast, but nothing here ever risks showing stale financial data,
//     since financial data never flows through this path at all.

const CACHE_NAME = 'fbb-shell-v1';

const SHELL_ASSETS = [
  '/',
  '/index.html', '/auth.html', '/dashboard.html', '/platform.html',
  '/checkout.html', '/rules.html', '/faq.html', '/contact.html', '/status.html',
  '/certificate.html', '/verify-email.html', '/reset-password.html',
  '/privacy.html', '/admin.html', '/404.html',
  '/css/style.css',
  '/js/i18n.js', '/js/api.js', '/js/settings.js', '/js/pwa.js',
  '/manifest.json',
  '/icons/icon-72.png', '/icons/icon-96.png', '/icons/icon-128.png',
  '/icons/icon-144.png', '/icons/icon-152.png', '/icons/icon-192.png',
  '/icons/icon-384.png', '/icons/icon-512.png',
  '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png',
  '/icons/favicon-16.png', '/icons/favicon-32.png', '/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch((err) => console.error('[sw] shell precache failed:', err))
  );
  self.skipWaiting(); // activate this new version immediately, don't wait for old tabs to close
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

const STATIC_FILE_PATTERN = /\.(html|css|js|png|svg|ico|json|webmanifest)$/;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Safety net #1: only ever touch GET requests to OUR OWN origin. The
  // trading engine API is on a different domain — this line alone means
  // it's structurally impossible for this service worker to cache a
  // price, balance, or order response.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Safety net #2: only touch recognized static file types (plus the
  // root path). Anything else — including any same-origin API route that
  // might exist now or in the future — passes through untouched.
  const isShellFile = url.pathname === '/' || STATIC_FILE_PATTERN.test(url.pathname);
  if (!isShellFile) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return networkResponse;
        })
        .catch(() => cached || caches.match('/')); // offline with nothing cached for this exact URL — fall back to the always-precached shell root rather than resolving to undefined
      return cached || networkFetch; // stale-while-revalidate
    })
  );
});
