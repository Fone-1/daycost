const CACHE_NAME = 'daycost-v28';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/settings.js',
    '/js/theme-preload.js',
    '/js/pwa.js',
    '/js/mobile-swipe.js',
    '/js/totp.js',
    '/js/theme.js',
    '/jsQR.min.js',
    '/chart.min.js',
    '/clusterize.min.css',
    '/clusterize.min.js',
    '/icon-512.png',
    '/manifest.json'
];
const CACHEABLE_PATHS = new Set(ASSETS_TO_CACHE);

// Install Event: Pre-cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate Event: Cleanup old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch Event: Stale-While-Revalidate for UI, Network-only for API
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // API responses are user-specific and mutate frequently. Do not cache them.
    if (url.pathname.startsWith('/api/')) {
        return;
    }

    const cacheKey = CACHEABLE_PATHS.has(url.pathname)
        ? new Request(url.pathname, { credentials: 'same-origin' })
        : event.request;

    // Static Assets: Stale-While-Revalidate
    event.respondWith(
        caches.match(cacheKey).then(cachedResponse => {
            const fetchPromise = fetch(event.request)
                .then(networkResponse => {
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(cacheKey, networkResponse.clone());
                    });
                    return networkResponse;
                })
                .catch(() => cachedResponse);
            return cachedResponse || fetchPromise;
        })
    );
});
