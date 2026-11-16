/**
 * 宿主对接层。
 *
 * 两种"宿主"场景：
 * 1. 原生壳（Android APK）：`window.ParkHost` 由 MainActivity 注入，能真正锁屏幕方向；
 * 2. 外部壳 / 模拟器（网页套壳）：用 `?host=1` 进入"交权模式"，工具条与交互区交给宿主绘制，
 *    宿主通过 postMessage 控制，游戏这边只负责牌桌本体与状态外发。
 *
 * 约定（宿主 → 游戏）：
 *   postMessage({ park: 'host', type: 'chrome', tools: boolean, dock: boolean }, '*')
 *   postMessage({ park: 'host', type: 'orientation', mode: 'portrait'|'landscape'|'auto' }, '*')
 * 游戏 → 宿主：
 *   postMessage({ park: 'park', type: 'ready'|'state', payload }, '*')
 */
export type OrientMode = 'portrait' | 'landscape' | 'auto';

interface ParkHostNative {
  setOrientation?: (mode: string) => void;
  setSystemBars?: (visible: string) => void;
}

function nativeHost(): ParkHostNative | null {
  const h = (window as Window & { ParkHost?: ParkHostNative }).ParkHost;
  return h && typeof h.setOrientation === 'function' ? h : null;
}

/** 原生壳能否直接锁方向（浏览器只能靠 CSS 旋转兜底） */
export const hasNativeOrientation = () => nativeHost() !== null;

/** 请求屏幕方向：原生壳生效；浏览器忽略 */
export function requestOrientation(mode: OrientMode) {
  nativeHost()?.setOrientation?.(mode);
}

/** 显隐系统栏（状态栏 / 导航栏），原生壳生效 */
export function requestSystemBars(visible: boolean) {
  nativeHost()?.setSystemBars?.(visible ? '1' : '0');
}

/* ---------------- 交权模式 ---------------- */

/**
 * 参数既可以写成 ?host=1，也可以写成 #host=1 ——
 * file:// 下有些壳不给带 query，只能靠 hash 传。
 */
const params = new URLSearchParams(
  typeof location === 'undefined'
    ? ''
    : `${location.search.replace(/^\?/, '')}&${location.hash.replace(/^#/, '')}`,
);

/** `?host=1`：由宿主接管工具条与交互区 */
export const HOST_MODE = params.get('host') === '1';

export interface ChromeFlags {
  tools: boolean;
  dock: boolean;
}

export const initialChrome: ChromeFlags = {
  tools: HOST_MODE ? false : params.get('tools') !== '0',
  dock: HOST_MODE ? false : params.get('dock') !== '0',
};

type ChromeListener = (c: ChromeFlags) => void;
const listeners = new Set<ChromeListener>();

export function onHostChrome(fn: ChromeListener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitChrome(c: ChromeFlags) {
  listeners.forEach((f) => f(c));
}

/** 把外部消息接进来（只认带 park:'host' 的信封，避免和其他消息串味） */
export function attachHostBridge() {
  window.addEventListener('message', (e: MessageEvent) => {
    const data = e.data as
      | { park?: string; type?: string; tools?: boolean; dock?: boolean; mode?: OrientMode }
      | null;
    if (!data || data.park !== 'host') return;
    if (data.type === 'chrome') {
      emitChrome({ tools: !!data.tools, dock: !!data.dock });
    } else if (data.type === 'orientation' && data.mode) {
      requestOrientation(data.mode);
    }
  });
}

/** 往宿主报平安 / 报状态 */
export function notifyHost(payload: Record<string, unknown>) {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ park: 'park', ...payload }, '*');
    }
  } catch {
    /* 跨域发不出去就算了，不影响本地游玩 */
  }
}

/** 把控制权挂到 window 上，宿主（模拟器 / 原生壳）可直接调 */
export interface ParkHostApi {
  setChrome: (tools: boolean, dock: boolean) => void;
  setOrientation: (mode: OrientMode) => void;
  notify: (payload: Record<string, unknown>) => void;
}

export function installHostApi(api: ParkHostApi) {
  (window as Window & { ParkHostAPI?: ParkHostApi }).ParkHostAPI = api;
}
