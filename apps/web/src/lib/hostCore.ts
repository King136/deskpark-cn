/**
 * 本机当主机：把服务端那套房间逻辑（`@park/server` 的 Hub）搬到网页里跑。
 *
 * 服务端代码本来就和传输层解耦：`Hub.connect(send)` 只要求「给这连接一个发送函数」。
 * 所以在 App 里由原生层监听 TCP 端口，把每条连接的字节桥进来，这里喂给 Hub；
 * 协议、座位、娱乐分、掉线逻辑全部与线上服务端是同一份实现，不会出现两套行为。
 *
 * v0.8.0 起主机持久化到 localStorage（与线上服务端落盘同构）：
 * 崩溃重启、换设备接棒时，房间（含进行中的牌局）都能按房号接回来。
 */
import { DEFAULT_CONFIG, Hub } from '@park/server/rooms';
import type { ServerMessage } from '@park/protocol';
import { storage } from './platform';
import { HOST_ROOM_KEY } from './takeover';

interface Session {
  onMessage: (raw: unknown) => void;
  onClose: () => void;
}

/** 主机持久层：localStorage 版的 RoomPersist（键与线上文件落盘同一结构） */
const persist = {
  list: () => storage.keys(HOST_ROOM_KEY),
  read: (code: string) => storage.get<Record<string, unknown> | null>(HOST_ROOM_KEY + code, null),
  write: (code: string, data: unknown) => storage.set(HOST_ROOM_KEY + code, data),
  remove: (code: string) => storage.remove(HOST_ROOM_KEY + code),
};

export class HostCore {
  private hub: Hub;
  private sessions = new Map<string, Session>();
  /** 定期清理：断线座位释放、空闲房间删除（服务端 30s 一跑，主机同样要有） */
  private sweeper: ReturnType<typeof setInterval> | null = null;

  constructor(
    private send: (session: string, text: string) => void,
    /** 快照落盘后的回推：原生 HTTP 层靠它提供 /api/room */
    private onPersist?: (code: string, data: Record<string, unknown>) => void,
  ) {
    this.hub = new Hub({
      ...DEFAULT_CONFIG,
      persist,
      onPersist: (code, data) => this.onPersist?.(code, data),
      log: (...a) => console.debug('[host]', ...a),
    });
    this.sweeper = setInterval(() => {
      try {
        this.hub.sweep();
      } catch {
        /* 清理失败不影响对局 */
      }
    }, 30_000);
  }

  open(session: string): void {
    const conn = this.hub.connect((msg: ServerMessage) => this.send(session, JSON.stringify(msg)));
    this.sessions.set(session, conn);
  }

  message(session: string, text: string): void {
    const s = this.sessions.get(session);
    if (!s) return;
    try {
      s.onMessage(text);
    } catch {
      /* Hub 内部已兜底 */
    }
  }

  close(session: string): void {
    const s = this.sessions.get(session);
    this.sessions.delete(session);
    s?.onClose();
  }

  stats() {
    return this.hub.stats();
  }

  /** 给「我的」页面看的房间概览 */
  rooms() {
    return [...this.hub.rooms.values()].map((r) => ({
      code: r.code,
      gameId: r.def.meta.id,
      humans: r.seats.filter((s) => s.kind === 'human').length,
      seats: r.seats.length,
      status: r.status,
      players: r.seats.map((s2) => (s2.kind === 'human' ? s2.name : null)),
    }));
  }

  dispose(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
    for (const s of this.sessions.values()) s.onClose();
    this.sessions.clear();
    this.hub.dispose();
  }
}
