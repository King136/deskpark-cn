/**
 * 游戏库的本地存储。
 *
 * 外部游戏（H5 / Cocos / FC / GB / GBA 等）导入后，文件本体放在 IndexedDB，
 * 元数据放在同一个库里，刷新、重启都不会丢；浏览器不支持 IndexedDB 时退回内存。
 */
export type Platform = 'h5' | 'cocos' | 'fc' | 'gb' | 'gba' | 'other';

export const PLATFORM_LABEL: Record<Platform, string> = {
  h5: 'H5 网页',
  cocos: 'Cocos',
  fc: 'FC / NES',
  gb: 'GB / GBC',
  gba: 'GBA',
  other: '其它',
};

export const PLATFORM_EXT: Record<Platform, string[]> = {
  h5: ['html', 'htm'],
  cocos: ['web', 'cocos', 'zip'],
  fc: ['nes', 'fc', 'rom'],
  gb: ['gb', 'gbc'],
  gba: ['gba'],
  other: ['bin', 'iso', 'zip'],
};

export interface RomItem {
  id: string;
  name: string;
  platform: Platform;
  size: number;
  addedAt: number;
  /** 文件名（含扩展名），交给外部模拟器时要用 */
  fileName: string;
  /** H5 / Cocos 的入口页（相对包内路径） */
  entry?: string;
  /** 解压出来的资源条数，0 表示单文件 */
  files?: number;
  note?: string;
}

const DB_NAME = 'park-library';
const STORE = 'roms';
const FILES = 'files';

let memory: RomItem[] = [];
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    // 版本 2：补建 files store（zip/Cocos 解包文件与 rom-sw.js 虚拟路径依赖它）。
    // 旧版本只建了 roms/blobs，导致 addRom 解包写 files 时抛 NotFoundError。
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T | null>((resolve) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => resolve(null);
  });
}

export async function listRoms(): Promise<RomItem[]> {
  const db = await openDb();
  if (!db) return [...memory];
  const rows = (await tx<RomItem[]>(db, STORE, 'readonly', (s) => s.getAll())) ?? [];
  return rows.sort((a, b) => b.addedAt - a.addedAt);
}

export function guessPlatform(fileName: string): Platform {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  for (const [p, list] of Object.entries(PLATFORM_EXT) as [Platform, string[]][]) {
    if (list.includes(ext)) return p;
  }
  return 'other';
}

export async function addRom(file: File): Promise<RomItem> {
  const isZip = /(?:\.zip|.web)$/i.test(file.name);
  const item: RomItem = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name.replace(/\.\w+$/, ''),
    platform: guessPlatform(file.name),
    size: file.size,
    addedAt: Date.now(),
    fileName: file.name,
  };
  const db = await openDb();
  if (!db) {
    memory = [item, ...memory];
    return item;
  }
  if (isZip) {
    const { unzip, guessMime } = await import('./zip');
    const entries = await unzip(file);
    const entriesTyped = entries.map((e) => ({
      ...e,
      blob: e.blob.type ? e.blob : new Blob([e.blob], { type: guessMime(e.path) }),
    }));
    const html = entriesTyped.find((e) => /(?:^|\/)index\.html?$/i.test(e.path));
    if (!html) throw new Error('压缩包里没找到 index.html');
    // 统一去掉一层公共目录（Cocos 导出常带 build/web-desktop/）
    const prefix = html.path.replace(/index\.html?$/i, '');
    for (const e of entriesTyped) {
      const rel = e.path.startsWith(prefix) ? e.path.slice(prefix.length) : e.path;
      await tx(db, FILES, 'readwrite', (s) => s.put(e.blob, `${item.id}/${rel}`));
    }
    item.entry = 'index.html';
    item.files = entriesTyped.length;
    item.platform = 'cocos';
  } else {
    await tx(db, 'blobs', 'readwrite', (s) => s.put(file, item.id));
    item.entry = file.name;
  }
  await tx(db, STORE, 'readwrite', (s) => s.put(item));
  return item;
}

/** 注册虚拟文件服务：导入的包通过 /__rom/<id>/<path> 提供 */
export async function ensureRomServer(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.register('rom-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return !!reg;
  } catch {
    return false;
  }
}

/** 交给 iframe 的地址：单文件用 blob，压缩包用虚拟路径 */
export async function romPlayUrl(item: RomItem): Promise<string | null> {
  if (item.files && item.entry) {
    const ok = await ensureRomServer();
    if (!ok) return null;
    return `/__rom/${item.id}/${item.entry}`;
  }
  const blob = await romBlob(item.id);
  if (!blob) return null;
  const typed = blob.type ? blob : new Blob([blob], { type: 'text/html' });
  return URL.createObjectURL(typed);
}

export async function updateRom(id: string, patch: Partial<RomItem>): Promise<void> {
  const db = await openDb();
  const row = (await tx<RomItem>(db!, STORE, 'readonly', (s) => s.get(id))) ?? null;
  if (!row) return;
  await tx(db!, STORE, 'readwrite', (s) => s.put({ ...row, ...patch, id }));
}

export async function removeRom(id: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory = memory.filter((r) => r.id !== id);
    return;
  }
  await tx(db, STORE, 'readwrite', (s) => s.delete(id));
  await tx(db, 'blobs', 'readwrite', (s) => s.delete(id));
  // 清理 zip/Cocos 解包到 files store 的文件（键形如 `${id}/<path>`），
  // 否则删除后仍可经 /__rom/<id>/... 取回，且永久占用配额（L4）。
  await new Promise<void>((resolve) => {
    const t = db.transaction(FILES, 'readwrite');
    const store = t.objectStore(FILES);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      const key = String(cur.key);
      if (key === id || key.startsWith(`${id}/`)) cur.delete();
      cur.continue();
    };
    t.oncomplete = () => resolve();
    t.onerror = () => resolve();
  });
}

/** 取出文件本体：H5 直接用它开新窗口，模拟器用它导出/分享 */
export async function romBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  return (await tx<Blob>(db, 'blobs', 'readonly', (s) => s.get(id))) ?? null;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
