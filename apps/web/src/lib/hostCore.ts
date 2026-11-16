/**
 * 本机当主机：把服务端那套房间逻辑（`@park/server` 的 Hub）搬到网页里跑。
 *
 * 服务端代码本来就和传输层解耦：`Hub.connect(send)` 只要求「给这连接一个发送函数」。
 * 所以在 App 里由原生层监听 TCP 端口，把每条连接的字节桥进来，这里喂给 Hub；
 * 协议、座位、娱乐分、掉线逻辑全部与线上服务端是同一份实现，不会出现两套行为。
 */
import { DEFAULT_CONFIG, Hub } from '@park/server/rooms';
import type { ServerMessage } from '@park/protocol';

interface Session {
  onMessage: (raw: unknown) => void;
  onClose: () => void;
}

export class HostCore {
  private hub: Hub;
  private sessions = new Map<string, Session>();

  constructor(private send: (session: string, text: string) => void) {
    this.hub = new Hub({ ...DEFAULT_CONFIG, log: (...a) => console.debug('[host]', ...a) });
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
    }));
  }

  dispose(): void {
    for (const s of this.sessions.values()) s.onClose();
    this.sessions.clear();
    this.hub.dispose();
  }
}
