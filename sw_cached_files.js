const cacheName = 'v1';

// Call Install Event
self.addEventListener('install', e => {
  console.log('Service Worker: Installed');

  e.waitUntil(
    caches.open(cacheName).then(cache => {
      console.log('Service Worker: Caching Files');
      return cache.addAll([
        '/TravelCosts/',
        '/TravelCosts/index.html',
        '/TravelCosts/dbSchema.json',
        '/TravelCosts/manifest.json',
        '/TravelCosts/css/dark.css',
        '/TravelCosts/img/icon-128x128.png',
        '/TravelCosts/js/AppsAndForms.js',
        '/TravelCosts/js/custom.js',
        '/TravelCosts/js/extensions.js'
      ]);
    })
  );
});

// Call Activate Event
self.addEventListener('activate', e => {
  console.log('Service Worker: Activated');
  // Remove unwanted caches
  e.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache != cacheName) {
            console.log('Service Worker: Clearing Old Cache');
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Call Fetch Event
self.addEventListener('fetch', e => {
  e.respondWith(async function() {
    if (navigator.onLine) return fetch(e.request);
    const cachedResponse = await caches.match(e.request);
    if (cachedResponse) return cachedResponse;
    return fetch(e.request);
  }());
});