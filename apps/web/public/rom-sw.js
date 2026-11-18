/* 游戏库虚拟文件服务：把 IndexedDB 里的 H5 / Cocos 资源按原路径提供给 iframe */
const DB = 'park-library';
const FILES = 'files';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
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
      const type = blob.type || 'application/octet-stream';
      const isHtml = /text\/html/i.test(type);
      return new Response(blob, {
        headers: {
          'content-type': type,
          'cache-control': 'no-cache',
          // iframe 现在是 opaque origin，需 CORS 放行才能用 fetch/XHR 相对路径加载资源
          'access-control-allow-origin': '*',
          // 禁止浏览器猜测类型导致脚本被当其他类型绕过；HTML 加 CSP 阻断外联与顶层导航
          'x-content-type-options': 'nosniff',
          ...(isHtml
            ? {
                'content-security-policy':
                  "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src *; img-src * data: blob:; media-src * data: blob:; frame-ancestors 'self'",
              }
            : {}),
        },
      });
    })(),
  );
});
