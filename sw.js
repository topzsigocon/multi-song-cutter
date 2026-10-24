const CACHE='multi-song-cutter-v2';
const FILES=['./','./index.html','./app.js','./manifest.json','./lame.min.js','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-512-maskable.png'];
// Cache each file separately so one missing file (e.g. lame.min.js) does not break installation.
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>Promise.all(FILES.map(f=>c.add(f).catch(()=>{})))))});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
