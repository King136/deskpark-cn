/**
 * H5 / Cocos 游戏包的解压。
 *
 * 浏览器自带的 DecompressionStream('deflate-raw') 就能解 zip 里的 deflate 条目，
 * 不必再引第三方库；解出来的每一条都交给 Service Worker 按原路径提供，
 * 这样 Cocos 那种「index.html + 一堆相对路径资源」的目录结构也能原样跑起来。
 */
export interface ZipEntry {
  path: string;
  blob: Blob;
}

function u16(b: DataView, i: number) {
  return b.getUint16(i, true);
}
function u32(b: DataView, i: number) {
  return b.getUint32(i, true);
}

async function inflateRaw(data: Uint8Array): Promise<Blob> {
  const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).blob();
}

/** 读 zip：只取中央目录，跳过目录项与 `__MACOSX` */
export async function unzip(file: Blob): Promise<ZipEntry[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (u32(view, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('不是有效的 zip');
  const count = u16(view, eocd + 10);
  let p = u32(view, eocd + 16);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (u32(view, p) !== 0x02014b50) break;
    const method = u16(view, p + 10);
    const nameLen = u16(view, p + 28);
    const extraLen = u16(view, p + 30);
    const commentLen = u16(view, p + 32);
    const localOffset = u32(view, p + 42);
    const nameBytes = buf.subarray(p + 46, p + 46 + nameLen);
    const path = new TextDecoder('utf-8').decode(nameBytes);
    p += 46 + nameLen + extraLen + commentLen;
    if (path.endsWith('/') || path.startsWith('__MACOSX')) continue;
    // 本地头：30 字节 + 文件名 + 扩展字段，之后才是数据
    const lNameLen = u16(view, localOffset + 26);
    const lExtraLen = u16(view, localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const compSize = u32(view, localOffset + 18) || u32(view, p - 46 + 20);
    const raw = buf.subarray(dataStart, dataStart + (compSize || buf.length - dataStart));
    try {
      const blob = method === 0 ? new Blob([raw.slice()]) : await inflateRaw(raw);
      out.push({ path: path.replace(/^\.\//, ''), blob });
    } catch {
      /* 单条坏掉不影响其它资源 */
    }
  }
  return out;
}

export function guessMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    mjs: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    json: 'application/json; charset=utf-8',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    mp4: 'video/mp4',
    webm: 'video/webm',
    ttf: 'font/ttf',
    otf: 'font/otf',
    woff: 'font/woff',
    woff2: 'font/woff2',
    wasm: 'application/wasm',
    plist: 'text/plain; charset=utf-8',
    fnt: 'application/octet-stream',
    bin: 'application/octet-stream',
  };
  return map[ext] ?? 'application/octet-stream';
}
