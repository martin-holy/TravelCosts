const appName = 'TravelCosts',
      appVersion = 'v2019.03.29_1',
      cacheName = `${appName}_${appVersion}`;

// Call Install Event
self.addEventListener('install', e => {
  console.log('Service Worker: Installed');

  e.waitUntil(
    caches.open(cacheName).then(cache => {
      console.log('Service Worker: Caching Files');
      return cache.addAll([
        '/TravelCosts/',
        '/TravelCosts/index.html',
        '/TravelCosts/manifest.json',
        '/TravelCosts/css/dark.css',
        '/TravelCosts/img/icon-144x144.png',
        '/TravelCosts/img/adm.png',
        '/TravelCosts/img/car.png',
        '/TravelCosts/img/global.png',
        '/TravelCosts/img/money.png',
        '/TravelCosts/img/background.jpg',
        '/TravelCosts/js/appCore.js',
        '/TravelCosts/js/custom.js',
        '/TravelCosts/js/extensions.js',
        '/TravelCosts/js/appStores.js'
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
          if (cache.startsWith(appName) && cache != cacheName) {
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
  // Respond with Cache falling back to Network
  e.respondWith(async function() {
    return await caches.match(e.request) || fetch(e.request);
  }());
});