// ImpoBot Service Worker — Cache primero para assets estáticos
var CACHE = 'impobot-v15'; // bump para forzar reinstalación del SW y descartar el precache viejo
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
  '/tools/facturador.html',
  '/tools/facturador.js',
  '/tools/fal.html',
  '/report-widget.js',
  '/bot.js?v=8',
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
  // Precache "best effort": si UN solo asset falla (ej. un adblocker o antivirus bloqueando
  // bot.js u otro archivo), cache.addAll() aborta TODA la instalación y el SW nuevo nunca
  // se activa, dejando al navegador pegado para siempre en la versión vieja sin importar
  // cuántas veces se recargue. Por eso cacheamos cada asset por separado e ignoramos los
  // que fallen, para que la instalación (y por lo tanto la actualización) siempre pueda avanzar.
  e.waitUntil(
    caches.open(CACHE).then(function(cache){
      return Promise.all(ASSETS.map(function(url){
        return cache.add(url).catch(function(err){
          console.log('[ImpoBot SW] no se pudo precachear (se ignora):', url, err);
        });
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k.indexOf('impobot-v')===0 && k!==CACHE; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  // Consultar primero la red para páginas y scripts; usar caché si no hay conexión.
  var url = e.request.url;
  var sameOrigin = new URL(url).origin === self.location.origin;
  if((sameOrigin && (e.request.mode === 'navigate' || /\.(html|js)$/.test(new URL(url).pathname))) ||
     url.includes('api.bcra') || url.includes('dolarapi') || url.includes('formspree') || url.includes('brevo')){
    // Omitir el caché HTTP: fetch() normal puede devolver HTML/JS viejo sin ir a la red.
    var freshUrl = sameOrigin ? new URL(e.request.url) : null;
    if(freshUrl) freshUrl.searchParams.set('_impobot_refresh', Date.now().toString());
    e.respondWith(fetch(freshUrl ? freshUrl.toString() : e.request, sameOrigin ? { cache: 'no-store', credentials: 'same-origin' } : {}).then(function(resp){
      if(sameOrigin && resp.ok){
        var clone = resp.clone();
        e.waitUntil(caches.open(CACHE).then(function(cache){ return cache.put(e.request, clone); }));
      }
      return resp;
    }).catch(function(){ return caches.match(e.request); }));
  } else {
    e.respondWith(
      caches.match(e.request).then(function(cached){
        return cached || fetch(e.request).then(function(resp){
          var clone = resp.clone();
          if(sameOrigin && resp.ok) e.waitUntil(caches.open(CACHE).then(function(cache){ return cache.put(e.request, clone); }));
          return resp;
        });
      })
    );
  }
});
