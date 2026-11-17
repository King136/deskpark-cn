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

/** 并行扫一个 /24，单地址 500ms 超时，整体约 8 秒内出结果 */
export async function scanLan(): Promise<FoundHost[]> {
  const self = await lanIp();
  if (!self) return [];
  const dot = self.lastIndexOf('.');
  if (dot < 0) return [];
  const prefix = self.slice(0, dot);
  const found: FoundHost[] = [];
  const batch = 24;

  for (let start = 1; start <= 254; start += batch) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 600);
    const tasks: Promise<void>[] = [];
    for (let i = start; i < Math.min(start + batch, 255); i++) {
      const ip = `${prefix}.${i}`;
      if (ip === self) continue;
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
}


/** 按房号在局域网里找主机：本机自开的服里没有这间房时，必须改连真正持有它的那台 */
export async function findRoomHost(code: string): Promise<FoundHost | null> {
  const list = await scanLan();
  return list.find((h) => h.rooms?.some((r) => r.code.toUpperCase() === code.toUpperCase())) ?? null;
}
