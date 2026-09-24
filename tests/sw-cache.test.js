const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

async function requestWith(fetchImpl) {
  const listeners = {};
  const cached = { source: 'offline' };
  const context = {
    self: { location: { origin: 'https://impobot.com.ar' }, addEventListener: (name, fn) => { listeners[name] = fn; }, skipWaiting() {}, clients: { claim() {} } },
    caches: { open: async () => ({ put: async () => {} }), match: async () => cached },
    fetch: fetchImpl,
    URL,
    Date,
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../sw.js'), 'utf8'), context);
  let response;
  listeners.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://impobot.com.ar/index.html' }, respondWith: p => { response = p; }, waitUntil() {} });
  return response;
}

test('la navegación usa una URL nueva para evitar el caché de Cloudflare', async () => {
  let fetchedUrl;
  const result = await requestWith(async url => { fetchedUrl = url; return { ok: true, clone() { return this; }, source: 'network' }; });
  assert.match(fetchedUrl, /_impobot_refresh=\d+/);
  assert.equal(result.source, 'network');
});

test('una caída de red usa la copia offline', async () => {
  const result = await requestWith(async () => { throw Error('offline'); });
  assert.equal(result.source, 'offline');
});
