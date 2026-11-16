/**
 * 原生局域网主机的桥：Android 侧 `ParkHost` 插件负责监听端口，
 * 这里只负责「开关 + 收发 + 地址」，主机的业务逻辑都在 HostCore 里。
 */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { HostCore } from './hostCore';

export interface HostEvent {
  type: 'open' | 'close' | 'message' | 'error';
  session?: string;
  data?: string;
  message?: string;
}

interface ParkHostPlugin {
  start(options: { port?: number }): Promise<{ port: number; addresses: string[] }>;
  stop(): Promise<void>;
  send(options: { session: string; data: string }): Promise<void>;
  status(): Promise<{ running: boolean; port: number; addresses: string[] }>;
  addListener(
    event: 'hostEvent',
    cb: (e: HostEvent) => void,
  ): Promise<PluginListenerHandle>;
}

const Native = registerPlugin<ParkHostPlugin>('ParkHost');

export function hostAvailable(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

export interface HostState {
  running: boolean;
  port: number;
  /** 别人该填的地址，如 192.168.1.9:8787 */
  addresses: string[];
  rooms: { code: string; gameId: string; humans: number; seats: number; status: string }[];
}

let core: HostCore | null = null;
let listener: PluginListenerHandle | null = null;
let state: HostState = { running: false, port: 8787, addresses: [], rooms: [] };

const subs = new Set<(s: HostState) => void>();
const emit = () => {
  state.rooms = core?.rooms() ?? [];
  for (const f of subs) f({ ...state });
};

export function subscribeHost(fn: (s: HostState) => void): () => void {
  subs.add(fn);
  fn({ ...state, rooms: core?.rooms() ?? [] });
  return () => subs.delete(fn);
}

export async function startHost(port = 8787): Promise<HostState> {
  if (core) return state;
  core = new HostCore((session, text) => {
    void Native.send({ session, data: text }).catch(() => {});
  });
  listener = await Native.addListener('hostEvent', (e) => {
    if (e.type === 'message' && e.session && typeof e.data === 'string') core?.message(e.session, e.data);
    else if (e.type === 'open' && e.session) core?.open(e.session);
    else if (e.type === 'close' && e.session) core?.close(e.session);
    emit();
  });
  const r = await Native.start({ port });
  state = { running: true, port: r.port, addresses: r.addresses ?? [], rooms: [] };
  emit();
  return { ...state };
}

export async function stopHost(): Promise<void> {
  try {
    await Native.stop();
  } finally {
    await listener?.remove();
    listener = null;
    core?.dispose();
    core = null;
    state = { running: false, port: state.port, addresses: [], rooms: [] };
    emit();
  }
}

export function currentHost(): HostState {
  return { ...state, rooms: core?.rooms() ?? [] };
}

/** 本机玩家自己也走 127.0.0.1，朋友用局域网地址 */
export function localWsUrl(port: number): string {
  return `ws://127.0.0.1:${port}/ws`;
}
