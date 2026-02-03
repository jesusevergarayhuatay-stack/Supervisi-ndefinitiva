const CACHE_NAME = 'dp-supervision-v3';
const ASSETS = [
    './',
    './index.html',
    './defensor.html',
    './style.css',
    './app.js',
    './dashboard.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './logo.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
