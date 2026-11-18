import type { ServerMessage } from '@park/protocol';
import { appendFile, createReadStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { handleAiProxy, isAiProxyPath } from './aiProxy';
import { clientIp } from './net';
import { filePersist } from './persist';
import type { ServerConfig } from './rooms';
import { DEFAULT_CONFIG, Hub } from './rooms';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

export interface StartOptions {
  port: number;
  host?: string;
  staticDir?: string | null;
  config?: Partial<ServerConfig>;
}

function defaultStaticDir(): string {
  const candidates: string[] = [];
  try {
    candidates.push(resolve(fileURLToPath(new URL('.', import.meta.url)), '../../web/dist'));
  } catch {
    /* 单文件打包（CJS）里没有 import.meta.url */
  }
  candidates.push(resolve(process.cwd(), 'web'), resolve(process.cwd(), 'apps/web/dist'));
  for (const c of candidates) if (existsSync(join(c, 'index.html'))) return c;
  return candidates[0];
}

/** 昵称脱敏：保留首尾，中间打码（用于内网探活端点的调试输出） */
function maskName(name: string | undefined): string | null {
  if (!name) return null;
  if (name.length <= 2) return name[0] ?? '';
  return name[0] + '*'.repeat(Math.min(name.length - 2, 4)) + name[name.length - 1];
}

/**
 * 网页的安全响应头：只允许同源脚本；连接（AI 接口、联机服务器）不限来源。
 * 跨域隔离（COOP + COEP）让棋类导师的多线程引擎（Fairy-Stockfish）可以使用 SharedArrayBuffer；
 * 页面的资源都来自本站，不受影响。
 */
const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'same-origin',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': [
    "default-src 'self'",
    // WebAssembly 引擎需要 wasm-unsafe-eval（只允许编译 wasm，不放开 eval）
    // blob: 供「游戏库」里导入的单文件 H5 直接开窗运行
    "script-src 'self' blob: 'wasm-unsafe-eval'",
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    'connect-src * ws: wss:',
    "manifest-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

function serveStatic(root: string, req: IncomingMessage, res: ServerResponse): void {
  let rel: string;
  try {
    rel = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }
  if (rel.includes('\0')) {
    res.writeHead(400);
    res.end();
    return;
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(root, rel));
  const inside = file.startsWith(root + sep);
  const target =
    inside && existsSync(file) && statSync(file).isFile() ? file : join(root, 'index.html');
  if (!existsSync(target)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Web 客户端尚未构建。请先运行 npm run build，或使用 npm run dev 进行开发。');
    return;
  }
  const ext = extname(target);
  const immutable = target.startsWith(join(root, 'assets') + sep);
  // 导师用的棋类引擎（几 MB）：很少更新，缓存一周，免得每次打开都重新下载
  const engine = target.startsWith(join(root, 'engines') + sep);
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': immutable
      ? 'public, max-age=31536000, immutable'
      : engine
        ? 'public, max-age=604800'
        : 'no-cache',
    ...SECURITY_HEADERS,
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(target)
    .on('error', () => res.destroy())
    .pipe(res);
}

export function startServer(opts: StartOptions) {
  const config: ServerConfig = { ...DEFAULT_CONFIG, ...opts.config };
  const hub = new Hub({
    ...config,
    persist: process.env.PARK_ROOMS_PERSIST === '0' ? undefined : filePersist(),
  });
  // 换机接棒：把盘上还在的房间接回来
  const restored = hub.restoreRooms();
  if (restored) config.log?.('[room] restored', restored);
  const staticDir = opts.staticDir === null ? null : resolve(opts.staticDir ?? defaultStaticDir());

  // 服务端游戏库：以主机为准，所有设备通过链接拉取同一个库
  const libDir = resolve(process.env.PARK_DATA_DIR ?? 'data', 'library');
  try {
    mkdirSync(libDir, { recursive: true });
  } catch {
    // 目录已存在或只读文件系统：游戏库退化为不可用，不影响服务启动
  }
  const libList = () => {
    try {
      return readdirSync(libDir)
        .filter((n) => !n.startsWith('.'))
        .map((name) => {
          const st = statSync(join(libDir, name));
          return { name, size: st.size, mtime: st.mtimeMs, url: `/library/${encodeURIComponent(name)}` };
        });
    } catch {
      return [];
    }
  };

  const http = createHttpServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://lan.local');
    if (url.pathname === '/api/profile' && req.method === 'POST') {
      // 用画像：只用请求里自然带的信息（UA、语言、时区、屏幕），不索取任何权限。
      // 安全加固：限制 body 大小（≤8KB）、单文件上限、用 appendFile 异步写，避免被刷爆磁盘/阻塞事件循环。
      const MAX_PROFILE_BODY = 8 * 1024;
      const chunks: Buffer[] = [];
      let size = 0;
      let tooLarge = false;
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_PROFILE_BODY) {
          tooLarge = true;
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        if (tooLarge) {
          res.writeHead(413).end();
          return;
        }
        try {
          const raw = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
          const dir = resolve(process.env.PARK_DATA_DIR ?? 'data');
          mkdirSync(dir, { recursive: true });
          const file = join(dir, 'profiles.ndjson');
          let fileSize = 0;
          try { fileSize = statSync(file).size; } catch { /* 首次写入 */ }
          // 文件超过 2MB 不再追加（防止无限增长）
          if (fileSize < 2 * 1024 * 1024) {
            const ua = String(raw.ua ?? '').slice(0, 500);
            const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'macOS' : 'unknown';
            const rec = {
              ua,
                lang: typeof raw.lang === 'string' ? raw.lang.slice(0, 40) : undefined,
                tz: typeof raw.tz === 'string' ? raw.tz.slice(0, 40) : undefined,
                screen: raw.screen && typeof raw.screen === 'object' ? raw.screen : undefined,
                platform: typeof raw.platform === 'string' ? raw.platform.slice(0, 40) : undefined,
              os,
              isMobile: /Mobile|Android|iPhone/i.test(ua),
              firstGuess: os === 'Android' ? '安卓手机' : os === 'iOS' ? '苹果设备' : '桌面浏览器',
              seenAt: new Date().toISOString(),
            };
            appendFile(file, JSON.stringify(rec) + '\n', () => {});
          }
        } catch {
          /* 画像失败不影响主流程 */
        }
        res.writeHead(204).end();
      });
      return;
    }

    if (url.pathname === '/api/lan') {
      // 局域网自发现。安全加固：默认只暴露"这台机器可开房"这一事实，
      // 不泄露房号/玩法/玩家昵称——否则任何局域网访客可枚举房号并尝试加入/抢房主。
      // 如需房间列表（可信内网调试），显式设置 PARK_LAN_DETAILS=1。
      const details = process.env.PARK_LAN_DETAILS === '1';
      const lan: Record<string, unknown> = {
        app: 'deskpark',
        name: '闲亭 · 局域网主机',
        serverTime: Date.now(),
        rooms: details
          ? [...hub.rooms.values()].map((r) => ({
              code: r.code,
              gameId: r.def.meta.id,
              seats: r.seats.length,
              humans: r.seats.filter((s) => s.kind === 'human').length,
              status: r.status,
              // 玩家昵称属于个人信息，默认不打码仅在内网调试模式下出现
              players: r.seats.map((s) => (s.kind === 'human' ? maskName(s.name) : null)),
            }))
          : [],
        roomCount: hub.rooms.size,
      };
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(lan));
      return;
    }
    if (url.pathname === '/api/library') {
      if (req.method === 'POST') {
        const name = (url.searchParams.get('name') ?? '').replace(/[^\w.\-\u4e00-\u9fa5]/g, '');
        if (!name) {
          res.writeHead(400).end('bad name');
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (c: Buffer) => {
          size += c.length;
          if (size > 300 * 1024 * 1024) {
            req.destroy();
            return;
          }
          chunks.push(c);
        });
        req.on('end', () => {
          try {
            writeFileSync(join(libDir, name), Buffer.concat(chunks));
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true, files: libList() }));
          } catch (e) {
            res.writeHead(500).end(String(e));
          }
        });
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ files: libList(), dir: 'data/library' }));
      return;
    }
    if (url.pathname.startsWith('/library/')) {
      const name = decodeURIComponent(url.pathname.slice('/library/'.length));
      const target = join(libDir, name);
      if (!target.startsWith(libDir) || !existsSync(target)) {
        res.writeHead(404).end('not found');
        return;
      }
      const ext = extname(target).toLowerCase();
      res.writeHead(200, {
        'content-type': MIME[ext] ?? 'application/octet-stream',
        'content-length': statSync(target).size,
        'accept-ranges': 'bytes',
        'cache-control': 'public, max-age=3600',
      });
      createReadStream(target)
        .on('error', () => res.destroy())
        .pipe(res);
      return;
    }
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...hub.stats() }));
      return;
    }
    if (isAiProxyPath(req.url)) {
      handleAiProxy(req, res).catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
      return;
    }
    if (!staticDir) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      serveStatic(staticDir, req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 16 * 1024 });
  // 每个 IP 的同时连接数上限，防止单个来源占满资源
  const perIp = new Map<string, number>();
  const maxPerIp = Number(process.env.MAX_CONN_PER_IP) || 20;
  // Origin 白名单：阻止任意第三方网站在用户浏览器里跨站连接本房间服务。
  // 兼容：无 Origin 的客户端（原生 App/脚本/同源）放行；可用 WS_ALLOWED_ORIGINS 覆盖。
  const allowedOrigins = (process.env.WS_ALLOWED_ORIGINS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const originAllowed = (origin: string | undefined, host: string | undefined): boolean => {
    if (!origin) return true; // 非浏览器客户端
    if (allowedOrigins.includes(origin)) return true;
    try {
      const u = new URL(origin);
      if (host && u.host === host) return true; // 同源
    } catch { /* 非法 Origin 直接拒绝 */ }
    return false;
  };
  wss.on('connection', (socket, req) => {
    const origin = req.headers.origin as string | undefined;
    if (!originAllowed(origin, req.headers.host)) {
      socket.close(1008, 'origin not allowed');
      return;
    }
    const ip = clientIp(req);
    const n = (perIp.get(ip) ?? 0) + 1;
    if (n > maxPerIp) {
      socket.close(1008, 'too many connections');
      return;
    }
    perIp.set(ip, n);
    socket.on('close', () => {
      const left = (perIp.get(ip) ?? 1) - 1;
      if (left <= 0) perIp.delete(ip);
      else perIp.set(ip, left);
    });
    const send = (msg: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    };
    const { onMessage, onClose } = hub.connect(send, ip);
    // 简单限流：每秒最多 30 条消息
    let windowStart = Date.now();
    let count = 0;
    socket.on('message', (data) => {
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > 30) return;
      onMessage(data.toString());
    });
    socket.on('close', onClose);
    socket.on('error', () => socket.close());
  });

  // 心跳：清理僵尸连接
  const alive = new WeakSet<object>();
  wss.on('connection', (socket) => {
    alive.add(socket);
    socket.on('pong', () => alive.add(socket));
  });
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!alive.has(socket)) {
        socket.terminate();
        continue;
      }
      alive.delete(socket);
      socket.ping();
    }
  }, 30_000);
  const sweeper = setInterval(() => hub.sweep(), 30_000);

  const ready = new Promise<number>((resolveReady) => {
    http.listen(opts.port, opts.host ?? '0.0.0.0', () => {
      const addr = http.address();
      resolveReady(typeof addr === 'object' && addr ? addr.port : opts.port);
    });
  });

  const close = async () => {
    clearInterval(heartbeat);
    clearInterval(sweeper);
    hub.dispose();
    for (const s of wss.clients) s.terminate();
    await new Promise<void>((r) => wss.close(() => r()));
    await new Promise<void>((r) => http.close(() => r()));
  };

  return { hub, ready, close, staticDir };
}
