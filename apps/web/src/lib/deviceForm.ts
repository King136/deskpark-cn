/**
 * 设备形态识别与适配（v0.5.0）。
 *
 * 五类目标形态：
 *  - desktop  PC 浏览器（宽屏、精确指针）
 *  - tablet   Pad（600–1180px 横屏，或较宽的竖屏）
 *  - phone    常规手机（≤600px 竖屏 / 短边）
 *  - wide     阔直板大屏手机（600–900px 竖屏，20:9 长屏折叠前的直板）
 *  - foldable 折叠屏（通过窗口宽度在短时间内大幅变化 + 宽高比特征推断）
 *
 * 识别结果写到 <html data-device="...">，供 device.css 做形态级样式覆盖；
 * 同时用 hook 暴露给需要按形态调整交互的组件。
 */
import { useEffect, useState } from 'react';

export type DeviceForm = 'desktop' | 'tablet' | 'wide' | 'phone' | 'foldable';

export interface DeviceInfo {
  form: DeviceForm;
  width: number;
  height: number;
  portrait: boolean;
  /** 可用视觉视口高度（排除浏览器工具栏） */
  vh: number;
}

export function classify(w: number, h: number, coarse: boolean): DeviceForm {
  const portrait = h >= w;
  const min = Math.min(w, h);
  const max = Math.max(w, h);
  const aspect = max / Math.max(1, min);

  // 1) 手机：短边很小（<480），无论横竖 —— 优先级最高，避免横屏手机被误判为平板
  if (min < 480) return 'phone';

  // 2) 折叠屏展开态：接近正方形（比例 <1.2）的触屏 —— 先于平板判断。
  //    典型 720×720 / 800×760；iPad 的 4:3（1.33）不会被误判。
  if (aspect < 1.2 && min >= 560 && coarse) return 'foldable';

  // 3) 阔直板大屏手机：竖屏宽度接近平板但高度极高（长宽比 >1.4）。
  //    iPad 竖屏 4:3（1.33）不会被误判为阔直板。
  if (portrait && w >= 560 && w <= 920 && aspect > 1.4) return 'wide';

  // 4) 桌面：宽屏且（非触屏，或很宽）。以宽度为主，降低对 coarse 的依赖
  //    （headless/部分 hybrid 设备 pointer 判定不准）
  if (min >= 900 || (!coarse && max >= 1100)) return 'desktop';

  // 5) 平板：其余中等偏大屏（含折叠半开 600×800）
  if (max >= 900 || min >= 600) return 'tablet';

  // 6) 兜底
  if (w >= 700) return 'tablet';
  return 'phone';
}

function measure(): DeviceInfo {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const coarse =
    window.matchMedia?.('(pointer: coarse)').matches ||
    navigator.maxTouchPoints > 1;
  return {
    form: classify(w, h, coarse),
    width: w,
    height: h,
    portrait: h >= w,
    vh: h,
  };
}

/** 当前设备形态（供组件读取，非响应式） */
export const currentDevice = (): DeviceInfo =>
  typeof window === 'undefined'
    ? { form: 'desktop', width: 1280, height: 800, portrait: false, vh: 800 }
    : measure();

/**
 * 订阅设备形态变化。用 resize + orientationchange，并对折叠屏展开/折叠做节流，
 * 结果同步到 <html data-device> 与 data-orientation。
 */
export function useDeviceForm(): DeviceInfo {
  const [info, setInfo] = useState<DeviceInfo>(currentDevice);
  useEffect(() => {
    let raf = 0;
    const apply = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = measure();
        const root = document.documentElement;
        root.dataset.device = next.form;
        root.dataset.orientation = next.portrait ? 'portrait' : 'landscape';
        setInfo((prev) =>
          prev.form === next.form &&
          prev.portrait === next.portrait &&
          Math.abs(prev.width - next.width) < 2 &&
          Math.abs(prev.height - next.height) < 2
            ? prev
            : next,
        );
      });
    };
    apply();
    window.addEventListener('resize', apply, { passive: true });
    window.addEventListener('orientationchange', apply);
    // visualViewport 变化覆盖移动端地址栏伸缩与折叠屏分屏
    window.visualViewport?.addEventListener('resize', apply);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      window.visualViewport?.removeEventListener('resize', apply);
    };
  }, []);
  return info;
}
