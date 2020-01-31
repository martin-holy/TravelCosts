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
    '/TravelCosts/js/reports.js',
    '/TravelCosts/img/flags/AL.png',
    '/TravelCosts/img/flags/AT.png',
    '/TravelCosts/img/flags/BG.png',
    '/TravelCosts/img/flags/BO.png',
    '/TravelCosts/img/flags/BR.png',
    '/TravelCosts/img/flags/CA.png',
    '/TravelCosts/img/flags/CZ.png',
    '/TravelCosts/img/flags/DE.png',
    '/TravelCosts/img/flags/EC.png',
    '/TravelCosts/img/flags/ES.png',
    '/TravelCosts/img/flags/FR.png',
    '/TravelCosts/img/flags/GB.png',
    '/TravelCosts/img/flags/GR.png',
    '/TravelCosts/img/flags/GY.png',
    '/TravelCosts/img/flags/HR.png',
    '/TravelCosts/img/flags/HU.png',
    '/TravelCosts/img/flags/CH.png',
    '/TravelCosts/img/flags/IT.png',
    '/TravelCosts/img/flags/ME.png',
    '/TravelCosts/img/flags/PE.png',
    '/TravelCosts/img/flags/PL.png',
    '/TravelCosts/img/flags/PT.png',
    '/TravelCosts/img/flags/RO.png',
    '/TravelCosts/img/flags/SI.png',
    '/TravelCosts/img/flags/SK.png',
    '/TravelCosts/img/flags/TT.png',
    '/TravelCosts/img/flags/US.png'
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
  e.respondWith(async function() {
    try {
      const cache = await caches.open(appName),
            res = await cache.match(e.request);
      if (res) return res;

      const netRes = await fetch(e.request);
      if (netRes.ok && netRes.status === 200 && netRes.type === 'basic')
        if (cacheables.some(x => e.request.url.endsWith(x)))
          cache.put(e.request, netRes.clone());
      return netRes;
    } catch (err) {
      console.log('Error in fetch handler:', err);
      throw err;
    }
  }());
});