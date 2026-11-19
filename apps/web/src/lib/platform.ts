/**
 * 平台适配层：所有与运行环境相关的能力（存储、服务器地址、震动等）集中在这里，
 * 移植到 App（Capacitor / React Native）时只需替换本文件的实现。
 */

function makeArea(area: Storage | undefined) {
  return {
    get<T>(key: string, fallback: T): T {
      try {
        const raw = area?.getItem(key);
        return raw == null ? fallback : (JSON.parse(raw) as T);
      } catch {
        return fallback;
      }
    },
    set(key: string, value: unknown): void {
      try {
        area?.setItem(key, JSON.stringify(value));
      } catch {
        /* 隐私模式或配额已满时忽略 */
      }
    },
    remove(key: string): void {
      try {
        area?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
    /** 列出某个前缀下的所有键（去掉前缀），localStorage 没有前缀查询，只能全量扫 */
    keys(prefix: string): string[] {
      const out: string[] = [];
      try {
        for (let i = 0; i < (area?.length ?? 0); i++) {
          const k = area?.key(i);
          if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length));
        }
      } catch {
        /* ignore */
      }
      return out;
    },
  };
}

/** 持久存储（localStorage） */
export const storage = makeArea(typeof localStorage === 'undefined' ? undefined : localStorage);

/**
 * 会话存储（sessionStorage）：仅用于敏感数据（如用户填入的第三方 API Key）。
 * 关闭标签页即失效，避免长期落盘被同源脚本/持久化 XSS 窃取。
 */
export const sessionStorageArea = makeArea(
  typeof sessionStorage === 'undefined' ? undefined : sessionStorage,
);

/**
 * 联机服务器地址：优先使用玩家自己填的地址（App / 局域网必需），
 * 其次构建时注入的 VITE_SERVER_URL，最后与页面同源。
 */
const SERVER_KEY = 'park.server';

/** 规范化玩家输入：`192.168.1.9:8787` → `ws://192.168.1.9:8787/ws` */
export function normalizeServer(input: string): string {
  const raw = input.trim();
  if (!raw) return '';
  let url = raw.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  if (!/^(ws|wss):\/\//i.test(url)) url = `ws://${url}`;
  url = url.replace(/\/+$/, '');
  // 没写路径时补上 /ws ；写了路径就尊重玩家的选择
  if (!/\/[^/]+$/.test(url.replace(/^(ws|wss):\/\/[^/]+/i, ''))) url += '/ws';
  return url;
}

export function getServerOverride(): string {
  return storage.get<string>(SERVER_KEY, '');
}

export function setServerOverride(input: string): void {
  const value = normalizeServer(input);
  if (value) storage.set(SERVER_KEY, value);
  else storage.remove(SERVER_KEY);
}

/** 是否跑在 App 壳里（Capacitor）：此时没有同源服务器，必须手填地址 */
export function isWebview(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/** 本机主机的默认 WebSocket 地址（Android 壳自动开主机） */
export const LOCAL_HOST_WS = 'ws://127.0.0.1:8787/ws';

export function serverUrl(): string {
  const override = getServerOverride();
  if (override) return normalizeServer(override);
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  // App 壳里页面源是 localhost，连"与页面同源"等于连不上的空端口；
  // 而 Android 壳默认把本机开成主机（见 Home 的 startHost），所以默认连本机。
  if (isWebview()) return LOCAL_HOST_WS;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

/** 当前连接的服务器是谁：大厅状态条、房间页都会讲清楚 */
export function serverLabel(url = serverUrl()): string {
  const m = url.match(/^wss?:\/\/([^/?#]+)/);
  const host = m?.[1] ?? url;
  // 原生壳里 127.0.0.1 是「本机当主机」；浏览器 localhost 只是测试场景，照实显示
  if (isWebview() && /^(127\.0\.0\.1|localhost)/.test(host)) return '本机主机';
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(host)) return `局域网 ${host}`;
  return host;
}

export function vibrate(ms = 12): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

/**
 * 复制文字到剪贴板。
 * navigator.clipboard 只在安全页面（HTTPS / localhost）里存在；用 http 打开（例如局域网 IP、
 * 没配证书的服务器）时它是 undefined，这时退回到隐藏文本框 + execCommand('copy')。
 * 必须在点击事件里同步调用（不要先 await 别的东西），否则浏览器会拒绝复制。
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* 权限被拒等：再试旧办法 */
    }
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  const active = document.activeElement as HTMLElement | null;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  // 放在可视区外；16px 字号避免 iOS 聚焦时放大页面
  ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:16px;';
  document.body.appendChild(ta);
  let ok = false;
  try {
    ta.focus({ preventScroll: true });
    ta.select();
    ta.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
  } catch {
    /* 极少数浏览器会抛错：当作复制失败 */
  }
  ta.remove();
  active?.focus?.({ preventScroll: true });
  return ok;
}

export function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
