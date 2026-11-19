import { useSyncExternalStore } from 'react';

const COMPACT_QUERY = '(max-height: 500px)';
/** 竖屏手机等窄屏幕 */
const NARROW_QUERY = '(max-width: 460px)';
/** 横屏手机等矮屏幕 */
export function useCompact(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(COMPACT_QUERY);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(COMPACT_QUERY).matches,
  );
}

/** 手机竖屏等窄画布：座位/牌池这类"宽设计"要收拢，避免左右出血 */
export function useNarrow(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(NARROW_QUERY);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(NARROW_QUERY).matches,
  );
}

/** 大屏幕上的座位放大倍数：1440×860 以下为 1，最大 1.5 */
function seatScale(): number {
  const s = Math.min(window.innerWidth / 1440, window.innerHeight / 860);
  return Math.round(Math.min(1.5, Math.max(1, s)) * 20) / 20;
}
export function useSeatScale(): number {
  return useSyncExternalStore((cb) => {
    window.addEventListener('resize', cb);
    return () => window.removeEventListener('resize', cb);
  }, seatScale);
}

/** 横屏（宽大于高） */
export function useLandscape(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia('(orientation: landscape)');
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia('(orientation: landscape)').matches,
  );
}
