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

function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 150;
}

export function applyBarColor(color: string | null): void {
  if (!color) return;
  // PWA / 浏览器地址栏也跟随，和原生壳保持一致
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  try {
    const cap = (globalThis as { Capacitor?: { Plugins?: { ParkHost?: Cap } } }).Capacitor?.Plugins
      ?.ParkHost;
    if (cap?.setBarColor) void cap.setBarColor({ color }).catch(() => {});
    else
      (globalThis as { ParkHost?: { setBarTheme?: (t: string) => void } }).ParkHost?.setBarTheme?.(
        isDark(color) ? 'dark' : 'light',
      );
  } catch {
    /* 浏览器 */
  }
}

/**
 * 页面切换后重新取色。
 *
 * 牌桌不是纯色而是绒布渐变，直接取 `.table` 的 `--felt-1`，
 * 状态栏就和牌桌顶栏是同一种绿，不再出现「上面黑一条、下面绿一块」。
 */
export function syncBarColor(): void {
  const table = document.querySelector('.table');
  if (table) {
    const felt = getComputedStyle(table as HTMLElement).getPropertyValue('--felt-1').trim();
    if (felt) {
      applyBarColor(felt);
      return;
    }
  }
  const paper = surfaceColor(document.body) ?? '#f4f1ea';
  applyBarColor(document.documentElement.dataset.theme === 'dark' ? '#121314' : paper);
}
