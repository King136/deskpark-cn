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

function lanIp(): string {
  const host = (globalThis as { ParkHost?: { lanIp?: () => string } }).ParkHost;
  try {
    return host?.lanIp?.() ?? '';
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
  const self = lanIp();
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
