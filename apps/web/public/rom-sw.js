/* 游戏库虚拟文件服务：把 IndexedDB 里的 H5 / Cocos 资源按原路径提供给 iframe */
const DB = 'park-library';
const FILES = 'files';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readFile(key) {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        const t = db.transaction(FILES, 'readonly');
        const req = t.objectStore(FILES).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      }),
  );
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith('/__rom/')) return;
  event.respondWith(
    (async () => {
      const key = decodeURIComponent(url.pathname.slice('/__rom/'.length));
      const blob = await readFile(key);
      if (!blob) return new Response('missing: ' + key, { status: 404 });
      return new Response(blob, {
        headers: { 'content-type': blob.type || 'application/octet-stream', 'cache-control': 'no-cache' },
      });
    })(),
  );
});
