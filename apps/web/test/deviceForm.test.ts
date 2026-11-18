import { describe, expect, it } from 'vitest';
import { classify } from '../src/lib/deviceForm';

/**
 * 五形态设备识别回归测试（v0.5.0）。
 * coarse = 是否触屏（pointer: coarse）。
 */
describe('设备形态识别', () => {
  const cases: [string, number, number, boolean, string][] = [
    ['PC 浏览器 1440×900', 1440, 900, false, 'desktop'],
    ['PC 宽屏 1920×1080', 1920, 1080, false, 'desktop'],
    ['iPad 横屏 1024×768', 1024, 768, true, 'tablet'],
    ['iPad 竖屏 768×1024', 768, 1024, true, 'tablet'],
    ['阔直板大屏手机 820×1180', 820, 1180, true, 'wide'],
    ['常规手机 390×844', 390, 844, true, 'phone'],
    ['手机横屏 844×390', 844, 390, true, 'phone'],
    ['折叠屏展开 720×720', 720, 720, true, 'foldable'],
    ['折叠半开 600×800（按小平板处理）', 600, 800, true, 'tablet'],
  ];
  for (const [name, w, h, coarse, expected] of cases) {
    it(`${name} → ${expected}`, () => {
      expect(classify(w, h, coarse)).toBe(expected);
    });
  }
});
