const appName = 'TravelCosts',
  cacheables = [
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
    '/TravelCosts/js/appStores.js',
    '/TravelCosts/js/reports.js'
  ];

// Install Event
self.addEventListener('install', e => {
  console.log('Service Worker: Installed');

  e.waitUntil(
    caches.open(appName).then(cache => {
      console.log('Service Worker: Caching Files');
      return cache.addAll(cacheables);
    })
  );
});

// Activate Event
self.addEventListener('activate', () => {
  console.log('Service Worker: Activated');

  // cache is updated in updateAppCache() in appCore.js and not recreated with new name
  // so there is no need to delete old cache

  return self.clients.claim();
});

// Fetch Event
self.addEventListener('fetch', e => {
  // Respond with Cache falling back to Network
  e.respondWith(
    caches.open(appName).then(cache => {
      return cache.match(e.request).then(res => {
        if (res) return res;

        return fetch(e.request).then(netRes => {
          if (netRes.ok && netRes.status === 200 && netRes.type === 'basic')
            if (cacheables.some(x => e.request.url.endsWith(x)))
              cache.put(e.request, netRes.clone());

          return netRes;
        });
      }).catch(error => {
        console.log('Error in fetch handler:', error);

        throw error;
      });
    })
  );
});