/** 把当前页面顶部的真实底色同步给原生状态栏，避免牌局/大厅之间出现接缝 */
type Cap = { setBarColor?: (o: { color: string }) => Promise<unknown> };

function toHex(rgb: string): string | null {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : parseFloat(m[4]);
  if (a < 0.6) return null;
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(+m[1])}${h(+m[2])}${h(+m[3])}`;
}

/** 从某个元素往上找第一个不透明的背景色 */
export function surfaceColor(el: Element | null): string | null {
  let node: Element | null = el;
  while (node && node !== document.documentElement) {
    const bg = getComputedStyle(node).backgroundColor;
    const hex = toHex(bg);
    if (hex) return hex;
    node = node.parentElement;
  }
  return null;
}

export function applyBarColor(color: string | null): void {
  if (!color) return;
  try {
    const cap = (globalThis as { Capacitor?: { Plugins?: { ParkHost?: Cap } } }).Capacitor?.Plugins
      ?.ParkHost;
    if (cap?.setBarColor) void cap.setBarColor({ color }).catch(() => {});
  } catch {
    /* 浏览器 */
  }
}

/** 页面切换/牌局进出后重新取色 */
export function syncBarColor(selector = '.table__top'): void {
  const color = surfaceColor(document.querySelector(selector)) ??
    surfaceColor(document.body) ??
    (document.documentElement.dataset.theme === 'dark' ? '#121314' : '#f4f1ea');
  applyBarColor(color);
}
