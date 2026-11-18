/**
 * WebDAV 备份：把本机 `park.*` 的玩家数据打包成一个 JSON，直接 PUT 到自己的网盘，
 * 换设备时 GET 回来覆盖，实现「游戏、设置、形象、存档」整体迁移。
 *
 * 只依赖标准 WebDAV 方法（PROPFIND / MKCOL / PUT / GET / HEAD），
 * 坚果云、Nextcloud、群晖、Alist 都能用。
 *
 * 已知限制：浏览器的跨域策略要求网盘返回 CORS 头。多数网盘（含坚果云）对
 * 第三方域名的 WebDAV 请求不放行，此时浏览器会报网络错误；Android 壳里
 * 走的是原生 HTTP，不受此限制。UI 上把这条差异说清楚，不要报「密码错误」误导用户。
 */
import { storage } from './platform';

export interface DavConfig {
  /** 目录地址，如 https://dav.jianguoyun.com/dav/闲亭 */
  url: string;
  user: string;
  pass: string;
  /** 备份文件名 */
  file: string;
  /** 记住密码：关掉则只存在本次会话 */
  remember: boolean;
  /** 启动时自动比对云端是否更新 */
  auto: boolean;
}

const CFG_KEY = 'park.dav';

export const DAV_DEFAULT: DavConfig = {
  url: '',
  user: '',
  pass: '',
  file: 'xanting-backup.json',
  remember: true,
  auto: false,
};

export function getDavConfig(): DavConfig {
  const raw = storage.get<Partial<DavConfig>>(CFG_KEY, {});
  return { ...DAV_DEFAULT, ...raw };
}

export function setDavConfig(patch: Partial<DavConfig>): DavConfig {
  const next = { ...getDavConfig(), ...patch };
  // 不记住密码时，落盘版本去掉密码，避免明文长期留在 localStorage
  storage.set(CFG_KEY, next.remember ? next : { ...next, pass: '' });
  return next;
}

/* ---------------- 基础请求 ---------------- */

function b64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function headers(cfg: DavConfig, extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (cfg.user) h.Authorization = `Basic ${b64(`${cfg.user}:${cfg.pass}`)}`;
  return h;
}

function dirUrl(cfg: DavConfig): string {
  return cfg.url.trim().replace(/\/+$/, '');
}

function fileUrl(cfg: DavConfig): string {
  return `${dirUrl(cfg)}/${encodeURIComponent(cfg.file || DAV_DEFAULT.file)}`;
}

export class DavError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DavError';
  }
}

/** 把底层异常翻译成人能看懂的话：跨域失败在浏览器里只会得到一个 TypeError */
function explain(e: unknown): DavError {
  if (e instanceof DavError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return new DavError(
      '连不上这个地址。三个常见原因：地址写错、网盘不允许浏览器跨域（换成 App 里试）、证书不受信任',
    );
  }
  return new DavError(msg);
}

async function req(cfg: DavConfig, url: string, init: RequestInit): Promise<Response> {
  if (!dirUrl(cfg)) throw new DavError('先填 WebDAV 目录地址');
  try {
    return await fetch(url, { ...init, headers: headers(cfg, (init.headers as Record<string, string>) ?? {}) });
  } catch (e) {
    throw explain(e);
  }
}

function propfind(cfg: DavConfig): Promise<Response> {
  return req(cfg, dirUrl(cfg), {
    method: 'PROPFIND',
    headers: { Depth: '0', 'Content-Type': 'application/xml' },
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>',
  });
}

/** 探测目录是否存在、账号是否可用；返回可读的服务器描述 */
export async function davTest(cfg: DavConfig): Promise<string> {
  let res = await propfind(cfg);
  if (res.status === 401 || res.status === 403) {
    throw new DavError('账号或密码不对（也可能是这个目录没有写权限）', res.status);
  }
  if (res.status === 404) {
    // 目录还没建：备份时本来就会逐级建，这里顺手建掉，省得用户先手动去网盘建文件夹
    await davEnsureDir(cfg);
    res = await propfind(cfg);
    if (res.status === 404) throw new DavError('目录不存在，也建不出来（检查上级目录的写权限）', 404);
  }
  if (!res.ok && res.status !== 207) throw new DavError(`服务器返回 ${res.status}`, res.status);
  const text = await res.text().catch(() => '');
  const name = /<d:displayname>([^<]*)<\/d:displayname>/i.exec(text)?.[1];
  const server = res.headers.get('server') ?? '';
  return [name || 'WebDAV 目录', server].filter(Boolean).join(' · ');
}

/** 目录不存在就建（已存在时服务器返回 405，不算错） */
export async function davEnsureDir(cfg: DavConfig): Promise<void> {
  const parts = dirUrl(cfg).split('/').filter(Boolean);
  // 逐级建，schemeful 前缀（https:）跳过
  const origin = dirUrl(cfg).startsWith('http') ? `${parts[0]}//${parts[1]}` : '';
  let acc = origin;
  const rest = dirUrl(cfg).startsWith('http') ? parts.slice(2) : parts;
  for (const seg of rest) {
    acc += `/${seg}`;
    const res = await req(cfg, acc, { method: 'MKCOL' }).catch(() => null);
    if (res && ![200, 201, 204, 301, 405].includes(res.status)) {
      throw new DavError(`建目录失败：${res.status}`, res.status);
    }
  }
}

/* ---------------- 备份包 ---------------- */

export interface BackupPack {
  app: 'xanting';
  version: 1;
  exportedAt: string;
  device: string;
  /** localStorage 里 `park.*` 的原始键值 */
  data: Record<string, unknown>;
}

/** 同步时跳过的键：WebDAV 配置本身（含密码）、联机服务器地址（跟设备/网络绑定） */
const SKIP = new Set([CFG_KEY, 'park.server']);

export function collectLocal(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('park.') || SKIP.has(k)) continue;
      const raw = localStorage.getItem(k);
      if (raw == null) continue;
      try {
        out[k] = JSON.parse(raw);
      } catch {
        out[k] = raw;
      }
    }
  } catch {
    /* 隐私模式下 localStorage 不可用 */
  }
  return out;
}

export function buildPack(device: string): BackupPack {
  return {
    app: 'xanting',
    version: 1,
    exportedAt: new Date().toISOString(),
    device,
    data: collectLocal(),
  };
}

/** 覆盖写回本机；返回写入的键数量 */
export function applyPack(pack: BackupPack): number {
  let n = 0;
  for (const [k, v] of Object.entries(pack.data ?? {})) {
    if (!k.startsWith('park.') || SKIP.has(k)) continue;
    try {
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      n++;
    } catch {
      /* 配额满等：跳过 */
    }
  }
  return n;
}

export function parsePack(text: string): BackupPack {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new DavError('这个文件不是合法的 JSON');
  }
  const p = obj as Partial<BackupPack>;
  if (p.app !== 'xanting' || !p.data || typeof p.data !== 'object') {
    throw new DavError('这不是闲亭的备份文件');
  }
  return { app: 'xanting', version: p.version ?? 1, exportedAt: p.exportedAt ?? '', device: p.device ?? '', data: p.data };
}

/* ---------------- 上传 / 下载 ---------------- */

export interface SyncMark {
  at: string;
  dir: string;
}

const SYNC_KEY = 'park.sync';

export function getSyncMark(): SyncMark {
  return storage.get<SyncMark>(SYNC_KEY, { at: '', dir: '' });
}

function markSync(dir: string): void {
  storage.set(SYNC_KEY, { at: new Date().toISOString(), dir });
}

export async function davUpload(cfg: DavConfig, device: string): Promise<{ pack: BackupPack; bytes: number }> {
  const pack = buildPack(device);
  const body = JSON.stringify(pack, null, 2);
  const res = await req(cfg, fileUrl(cfg), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body,
  });
  if (res.status === 401 || res.status === 403) throw new DavError('没有写权限', res.status);
  if (!res.ok) throw new DavError(`上传失败：${res.status}`, res.status);
  markSync(dirUrl(cfg));
  return { pack, bytes: new TextEncoder().encode(body).length };
}

/** 云端备份的元信息（只看时间与大小，不下载正文） */
export async function davStat(cfg: DavConfig): Promise<{ modified: string | null; size: number } | null> {
  const res = await req(cfg, fileUrl(cfg), { method: 'HEAD' }).catch(() => null);
  if (!res || res.status === 404) return null;
  if (!res.ok) return null;
  return {
    modified: res.headers.get('last-modified'),
    size: Number(res.headers.get('content-length') ?? 0),
  };
}

export async function davDownload(cfg: DavConfig): Promise<BackupPack> {
  const res = await req(cfg, fileUrl(cfg), { method: 'GET' });
  if (res.status === 404) throw new DavError('云端还没有备份文件，先点「备份到云端」');
  if (!res.ok) throw new DavError(`下载失败：${res.status}`, res.status);
  const pack = parsePack(await res.text());
  markSync(dirUrl(cfg));
  return pack;
}

/* ---------------- 时间格式化 ---------------- */

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '未知时间';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 启动时的静默比对：只发一个 HEAD，不下载正文。
 * 云端比本机上次同步更新 → 返回 true，由 UI 提示「去设置里恢复」，不自动覆盖。
 */
export async function davCheckNewer(): Promise<{ newer: boolean; modified: string | null }> {
  const cfg = getDavConfig();
  if (!cfg.auto || !dirUrl(cfg)) return { newer: false, modified: null };
  const st = await davStat(cfg).catch(() => null);
  if (!st?.modified) return { newer: false, modified: null };
  const mark = getSyncMark();
  const remote = new Date(st.modified).getTime();
  const local = mark.at ? new Date(mark.at).getTime() : 0;
  return { newer: Number.isFinite(remote) && remote > local + 60_000, modified: st.modified };
}
