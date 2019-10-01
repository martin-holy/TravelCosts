const appName = 'TravelCosts';

// Install Event
self.addEventListener('install', e => {
  console.log('Service Worker: Installed');

  e.waitUntil(
    caches.open(appName).then(cache => {
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

// Activate Event
self.addEventListener('activate', e => {
  console.log('Service Worker: Activated');

  // cache is updated in appCore.updateCache() and not recreated with new name
  // so there is no need to delete old cache

  return self.clients.claim();
});

// Fetch Event
self.addEventListener('fetch', e => {
  // Respond with Cache falling back to Network
  e.respondWith(
    caches.open(appName).then(cache => {
      return cache.match(e.request).then(response => {
        if (response)
          return response;

        return fetch(e.request).then(networkResponse => {
          if (networkResponse.ok && networkResponse.status == 200 && networkResponse.type == 'basic')
            if (!e.request.url.endsWith('updates.json'))
              cache.put(e.request, networkResponse.clone());

          return networkResponse;
        });
      }).catch(error => {
        console.log('Error in fetch handler:', error);

        throw error;
      });
    })
  );
});