// 離線用：第一次打開時把 App 檔案存到手機，之後沒有網路也能開。
// 改版時把 VERSION 加 1，手機下次連上網路就會更新。
const VERSION = 'jpstudy-v1';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'db.js', 'manifest.webmanifest',
  'data/kana.js', 'data/words.js', 'vendor/sql-wasm.js', 'vendor/sql-wasm.wasm',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 先用手機裡的檔案（離線也能用），同時在背景更新
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(res => { if (res.ok && new URL(e.request.url).origin === location.origin) cache.put(e.request, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || new Response('離線中，這個檔案還沒有存到手機。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }));
});
