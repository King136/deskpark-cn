import { preferences } from '@kit.ArkData';

const PREFS_NAME = 'deskpark_prefs';
const KEY_URL = 'base_url';
const KEY_DESKTOP_UA = 'desktop_ua';
/** 闲亭服务端默认地址（局域网联机端口 8787）；首次启动可在设置页修改 */
export const DEFAULT_URL = 'http://192.168.1.100:8787';

export const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** 本地配置读写（SharedPreferences 等价物） */
export class ConfigStore {
  private static instance: ConfigStore | null = null;
  private store: preferences.Preferences | null = null;

  private constructor() {}

  static async get(): Promise<ConfigStore> {
    if (!ConfigStore.instance) {
      ConfigStore.instance = new ConfigStore();
    }
    const ctx = getContext(this) as Context;
    if (!ConfigStore.instance.store) {
      ConfigStore.instance.store = await preferences.getPreferences(ctx, PREFS_NAME);
    }
    return ConfigStore.instance;
  }

  async getUrl(): Promise<string> {
    return (await this.store?.get(KEY_URL, '')) as string;
  }

  async setUrl(url: string): Promise<void> {
    await this.store?.put(KEY_URL, url);
    await this.store?.flush();
  }

  async getDesktopUa(): Promise<boolean> {
    return (await this.store?.get(KEY_DESKTOP_UA, false)) as boolean;
  }

  async setDesktopUa(v: boolean): Promise<void> {
    await this.store?.put(KEY_DESKTOP_UA, v);
    await this.store?.flush();
  }
}
