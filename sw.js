// ImpoBot Service Worker — Cache primero para assets estáticos
var CACHE = 'impobot-v5';
var ASSETS = [
  '/',
  '/index.html',
  '/logo.png',
  '/logo-sm.png',
  '/tools/vencimientos.html',
  '/tools/monotributo.html',
  '/tools/sueldos.html',
  '/tools/ganancias.html',
  '/tools/recibos.html',
  '/tools/autonomos.html',
  '/tools/sac.html',
  '/tools/indemnizacion.html',
  '/tools/f931.html',
  '/tools/intereses.html',
  '/tools/rg830.html',
  '/tools/valores.html',
  '/tools/uva.html',
  '/tools/procesador.html',
  '/tools/procesador/core.js',
  '/tools/procesador/app.js',
  '/tools/balance.html',
  '/tools/balance/engine.js',
  '/tools/balance/render.js',
  '/tools/balance/app.js',
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(cache){
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k!==CACHE; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e){
  // Network first para API calls (BCRA, etc), cache first para assets
  var url = e.request.url;
  if(url.includes('api.bcra') || url.includes('dolarapi') || url.includes('formspree') || url.includes('brevo')){
    e.respondWith(fetch(e.request).catch(function(){ return caches.match(e.request); }));
  } else {
    e.respondWith(
      caches.match(e.request).then(function(cached){
        return cached || fetch(e.request).then(function(resp){
          var clone = resp.clone();
          caches.open(CACHE).then(function(cache){ cache.put(e.request, clone); });
          return resp;
        });
      })
    );
  }
});
