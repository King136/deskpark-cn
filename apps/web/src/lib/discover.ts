/**
 * 局域网自发现：拿本机 Wi-Fi 网段，扫 8787 端口的 /api/lan。
 * 找到主机后由大厅自动填地址，实现「有人在局域网开主机，其它人自动组网」。
 */
export interface FoundRoom {
  code: string;
  gameId: string;
  humans: number;
  seats: number;
  status: string;
  players?: (string | null)[];
}

export interface FoundHost {
  ip: string;
  port: number;
  name: string;
  rooms: FoundRoom[];
}

/** 房间预览：大厅输码时实时显示"什么玩法、几个人" */
export interface RoomPreview {
  code: string;
  gameId: string;
  seats: number;
  humans: number;
  status: string;
  spectators?: number;
  players?: (string | null)[];
}

const PORT = 8787;

type CapParkHost = { lanIp?: () => Promise<{ ip?: string }> };

async function lanIp(): Promise<string> {
  const host = (globalThis as { ParkHost?: { lanIp?: () => string } }).ParkHost;
  try {
    const ip = host?.lanIp?.();
    if (ip) return ip;
  } catch {
    /* 继续走插件 */
  }
  // 部分机型 addJavascriptInterface 注入比页面初始化晚，必须再问 Capacitor 插件
  const cap = (globalThis as { Capacitor?: { Plugins?: { ParkHost?: CapParkHost } } }).Capacitor
    ?.Plugins?.ParkHost;
  try {
    const res = await cap?.lanIp?.();
    return res?.ip ?? '';
  } catch {
    return '';
  }
}

/** 私网地址判断：这些网段才值得扫 */
function isPrivate(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n))) return false;
  return (
    p[0] === 10 ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 169 && p[1] === 254)
  );
}

/**
 * 浏览器里拿不到本机 IP（WebRTC 已被浏览器关掉这个能力），
 * 但页面若由局域网主机提供，`location.hostname` 就是那台机器的地址，
 * 用它所在的 /24 去扫是最靠谱的零配置猜测。原生壳里优先用真 IP。
 */
export function guessLanPrefix(): string {
  const h = location.hostname;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) && isPrivate(h)) return h.slice(0, h.lastIndexOf('.'));
  return '';
}

/** 把 `192.168.1.9` / `192.168.1.` / `192.168.1` 都归一成 `192.168.1` */
export function normalizePrefix(input: string): string {
  const raw = input.trim().replace(/\s+/g, '');
  if (!raw) return '';
  const parts = raw.split('.').filter(Boolean);
  if (parts.length < 2) return '';
  if (parts.length >= 4) return parts.slice(0, 3).join('.');
  if (parts.length === 3) return parts.join('.');
  return '';
}

async function probe(ip: string, signal: AbortSignal): Promise<FoundHost | null> {
  try {
    const res = await fetch(`http://${ip}:${PORT}/api/lan`, { cache: 'no-store', signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { name?: string; rooms?: FoundRoom[] };
    if (!data || !Array.isArray(data.rooms)) return null;
    return { ip, port: PORT, name: data.name ?? '闲亭主机', rooms: data.rooms };
  } catch {
    return null;
  }
}

/**
 * 并行扫一个 /24：一批 64 个地址、单批 450ms 超时，全场约 2 秒内出结果。
 * 局域网里不存在的 IP 要么立刻 RST 要么静默丢包，批大小对耗时影响远大于超时值；
 * 同时并发去重——10 秒轮询和「输入房号触发扫描」撞在一起时共用一次扫描。
 * 网段来源优先级：显式传入 > 原生 lanIp > 页面域名猜测。
 */
let inflight: Promise<FoundHost[]> | null = null;

function doScan(prefix?: string): Promise<FoundHost[]> {
  return (async () => {
    const self = await lanIp();
    const p =
      normalizePrefix(prefix ?? '') || (self ? self.slice(0, self.lastIndexOf('.')) : '') || guessLanPrefix();
    if (!p) return [];
    const found: FoundHost[] = [];
    const batch = 64;

    for (let start = 1; start <= 254; start += batch) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 450);
      const tasks: Promise<void>[] = [];
      for (let i = start; i < Math.min(start + batch, 255); i++) {
        const ip = `${p}.${i}`;
        if (self && ip === self) continue;
        tasks.push(
          probe(ip, ctrl.signal).then((h) => {
            if (h) found.push(h);
          }),
        );
      }
      await Promise.all(tasks);
      clearTimeout(timer);
    }
    return found.sort((a, b) => b.rooms.length - a.rooms.length);
  })();
}

export function scanLan(explicitPrefix?: string): Promise<FoundHost[]> {
  if (explicitPrefix) return doScan(explicitPrefix);
  if (inflight) return inflight;
  inflight = doScan().finally(() => {
    inflight = null;
  });
  return inflight;
}


/** 按房号在局域网里找主机：本机自开的服里没有这间房时，必须改连真正持有它的那台 */
export async function findRoomHost(code: string): Promise<FoundHost | null> {
  const list = await scanLan();
  return list.find((h) => h.rooms?.some((r) => r.code.toUpperCase() === code.toUpperCase())) ?? null;
}

/** ws:// 地址 → http(s) 源，用于探测同一台主机的 HTTP 接口 */
export function httpOrigin(wsUrl: string): string {
  return wsUrl.replace(/^ws/i, 'http').replace(/\/ws$/, '');
}

/** 通用 HTTP JSON 探测（带超时），失败返回 null */
async function getJson<T>(url: string, timeoutMs: number): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 问当前服务器：这个房号在不在、什么玩法、几个人。1.2 秒内给不出就当没有 */
export function probeRoom(origin: string, code: string): Promise<RoomPreview | null> {
  return getJson<RoomPreview>(`${origin}/api/room?code=${encodeURIComponent(code)}`, 1200);
}

/** 主机健康探测（设置页「探测主机」）：/api/lan 两端都支持 */
export function probeHost(origin: string): Promise<{ name?: string; rooms?: unknown[] } | null> {
  return getJson<{ name?: string; rooms?: unknown[] }>(`${origin}/api/lan`, 1500);
}
