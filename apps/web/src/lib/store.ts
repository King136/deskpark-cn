import { useSyncExternalStore } from 'react';
import { AVATARS } from '@park/protocol';
import { randomToken, sessionStorageArea, storage } from './platform';

type StoreArea = Pick<typeof storage, 'get' | 'set'>;

/**
 * 极简的可订阅存储（无需额外状态库）。
 * persist='local'（默认）用 localStorage；'session' 用 sessionStorage（敏感数据，关标签页即失效）；
 * 'none' 仅内存。
 */
export function createStore<T extends object>(
  key: string,
  initial: T,
  persist: 'local' | 'session' | 'none' = 'local',
) {
  const area: StoreArea | null =
    persist === 'local' ? storage : persist === 'session' ? sessionStorageArea : null;
  let value: T = { ...initial, ...(area ? area.get<Partial<T>>(key, {}) : {}) };
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(patch: Partial<T>) {
      value = { ...value, ...patch };
      area?.set(key, value);
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    use(): T {
      return useSyncExternalStore(this.subscribe, this.get, this.get);
    },
  };
}

export type FeltTheme = 'jade' | 'indigo' | 'wine' | 'graphite';
export type ColorTheme = 'system' | 'light' | 'dark';

export interface Settings {
  felt: FeltTheme;
  fourColor: boolean;
  sound: boolean;
  theme: ColorTheme;
  cardCounter: boolean;
  /** 虚拟形象模式：牌桌上所有人（包括电脑）以全身像素立绘显示 */
  figures: boolean;
  /** 棋类导师：和电脑下棋时，每一步先让导师看看 */
  coach: boolean;
  /** 麻将导师面板：需要时打开，随时可以关 */
  mjCoach: boolean;
}

export const settings = createStore<Settings>('park.settings', {
  felt: 'jade',
  fourColor: false,
  sound: true,
  theme: 'system',
  cardCounter: true,
  figures: false,
  coach: false,
  mjCoach: false,
});

const NAMES = [
  '清风',
  '明月',
  '青竹',
  '远山',
  '听雨',
  '南风',
  '初雪',
  '星河',
  '晚舟',
  '白露',
  '松间',
  '小满',
];

export interface Profile {
  name: string;
  token: string;
  /** 形象 id：像素形象 id（虚拟形象模式下显示为对应的全身像），或额外虚拟角色的 vc:<id> */
  avatar: string;
  /** 旧版字段，仅用于迁移 */
  avatarMode?: 'pixel' | 'character';
}

export const profile = createStore<Profile>('park.profile', {
  name: NAMES[Math.floor(Math.random() * NAMES.length)],
  token: randomToken(),
  avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)].id,
});
// 首次访问时把随机生成的身份写入本地
profile.set({});
restoreFromNative('park.profile', profile);
profile.subscribe(() => mirrorToNative('park.profile', profile.get()));
settings.subscribe(() => mirrorToNative('park.settings', settings.get()));

// 身份与设置镜像到原生 SharedPreferences：换壳、清 WebView 缓存都不会丢
interface PrefHost {
  getPref?: (k: string) => string | null;
  setPref?: (k: string, v: string) => void;
}

function mirrorToNative(key: string, value: unknown) {
  try {
    (globalThis as { ParkHost?: PrefHost }).ParkHost?.setPref?.(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function restoreFromNative<T extends object>(key: string, store: { get: () => T; set: (p: Partial<T>) => void }) {
  try {
    const raw = (globalThis as { ParkHost?: PrefHost }).ParkHost?.getPref?.(key);
    if (!raw) return;
    store.set(JSON.parse(raw) as Partial<T>);
  } catch {
    /* ignore */
  }
}

/** 上次使用的各玩法设置 */
export const lastSetup = createStore<
  Record<string, { players: number; options: Record<string, unknown> }>
>('park.lastSetup', {});

// 旧版本把「虚拟角色」当作头像模式存在 profile 里，迁移为显示设置
if (profile.get().avatarMode === 'character') {
  settings.set({ figures: true });
}
if (profile.get().avatarMode) profile.set({ avatarMode: undefined });
