/**
 * 自接棒：把「房间的完整快照」缓存到本机，房主设备下线后，
 * 任何一台装了闲亭的设备都能凭快照把这间房接过来继续打。
 *
 * 快照来源是主机的 `/api/room?code=X&full=1`（服务端 Hub 导出，含进行中的权威牌局）。
 * - 房间里的人每 15 秒拉一次存到 localStorage（几 KB，断电也还在）；
 * - 接管时把快照种进主机持久层（`park.host.room.<房号>`），
 *   startHost 后 Hub.adoptRoom 就能按原座位把牌局连人一起接回来。
 */
import { httpOrigin } from './discover';
import { storage } from './platform';

export const HOST_ROOM_KEY = 'park.host.room.';
const CACHE_KEY = 'park.takeover.';
/** 最多记几间房的快照：都是最新一份，旧的挤掉 */
const MAX_CACHED = 4;

/** 与 Hub.diskState 同构：座位轮廓 + 娱乐分 + 进行中的牌局 */
export interface RoomPack {
  code: string;
  gameId: string;
  options?: Record<string, unknown>;
  seats?: { kind?: string; name?: string; avatar?: string }[];
  sessionScores?: number[];
  matchNo?: number;
  status?: string;
  savedAt?: number;
  play?: { state: unknown; seats?: { name?: string; avatar?: string; isBot?: boolean; auto?: boolean }[] };
}

function valid(p: RoomPack | null): p is RoomPack {
  return !!p && typeof p.code === 'string' && typeof p.gameId === 'string' && p.code.length === 4;
}

/** 从主机拉一间房的完整快照（full=1） */
export async function fetchRoomPack(origin: string, code: string): Promise<RoomPack | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2000);
  try {
    const res = await fetch(`${origin}/api/room?code=${encodeURIComponent(code)}&full=1`, {
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { pack?: RoomPack };
    const pack = data.pack ?? null;
    return valid(pack) ? pack : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 缓存快照（按 savedAt 淘汰最旧的） */
export function savePack(pack: RoomPack): void {
  if (!valid(pack)) return;
  const list = listPacks().filter((p) => p.code !== pack.code);
  list.push({ ...pack, savedAt: pack.savedAt ?? Date.now() });
  list.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  for (const p of list.slice(0, MAX_CACHED)) storage.set(CACHE_KEY + p.code, p);
  for (const p of list.slice(MAX_CACHED)) storage.remove(CACHE_KEY + p.code);
}

/** 读缓存 */
export function loadPack(code: string): RoomPack | null {
  const p = storage.get<RoomPack | null>(CACHE_KEY + code, null);
  return valid(p) ? p : null;
}

/** 所有缓存快照（新的在前），「接管」入口用 */
export function listPacks(): RoomPack[] {
  return storage
    .keys(CACHE_KEY)
    .map((code) => storage.get<RoomPack | null>(CACHE_KEY + code, null))
    .filter(valid)
    .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
}

export function dropPack(code: string): void {
  storage.remove(CACHE_KEY + code);
}

/** 本机主机持久层里已有的房间号（上次当主机留下的） */
function hostPersistCodes(): string[] {
  return storage.keys(HOST_ROOM_KEY);
}

/**
 * 接棒第一步：把快照种进主机持久层。
 * 本机持久层已有这间房（上次就是它当主机）或缓存里有快照才算能接；都没有返回 false。
 */
export function seedHostPersist(code: string): boolean {
  if (hostPersistCodes().includes(code)) return true;
  const pack = loadPack(code);
  if (!pack) return false;
  storage.set(HOST_ROOM_KEY + code, pack);
  return true;
}

/** 给「接管牌局」按钮判断能不能用：有快照才提供 */
export function canTakeover(code: string): boolean {
  return hostPersistCodes().includes(code) || !!loadPack(code);
}

/** 从 WS 地址算 HTTP 源（拿当前服务器源用） */
export { httpOrigin };
