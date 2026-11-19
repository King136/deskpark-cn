import type {
  ChatMessage,
  ClientMessage,
  MatchScore,
  RoomScoreRow,
  RoomSnapshot,
  ScoreSummary,
  ServerMessage,
} from '@park/protocol';
import { CHAT_HISTORY, PROTOCOL_VERSION } from '@park/protocol';
import { useSyncExternalStore } from 'react';
import { findRoomHost } from './discover';
import { normalizeServer, serverUrl, setServerOverride } from './platform';
import { profile } from './store';

export type OnlineStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'offline';

export type GameMessage = Extract<ServerMessage, { t: 'game' }>;

export interface Emote {
  seat: number;
  emote: string;
  name: string;
  at: number;
}

/** 断线自救状态：牌桌上展示「正在局域网找接棒的设备」 */
export interface RescueState {
  code: string;
  /** 自救已切到哪台主机（还没连上） */
  target?: string;
  tries: number;
  at: number;
}

export interface OnlineState {
  status: OnlineStatus;
  playerId: string | null;
  room: RoomSnapshot | null;
  you: { seat: number | null; isHost: boolean } | null;
  game: GameMessage | null;
  /** 服务器时间 - 本地时间 */
  clockOffset: number;
  error: { message: string; code?: string; at: number } | null;
  emotes: Emote[];
  /** 当前房间的聊天记录 */
  chat: ChatMessage[];
  /** 我的娱乐分档案（服务器存档） */
  myScore: ScoreSummary | null;
  /** 最近一局的结算 */
  matchScore: MatchScore | null;
  /** 房间内本次进房以来的累计 */
  roomScores: RoomScoreRow[];
  /** 断线后的自救（仅在有房间时出现） */
  rescue: RescueState | null;
}

const initial: OnlineState = {
  status: 'idle',
  playerId: null,
  room: null,
  you: null,
  game: null,
  clockOffset: 0,
  error: null,
  emotes: [],
  chat: [],
  myScore: null,
  matchScore: null,
  roomScores: [],
  rescue: null,
};

/** 联机客户端：自动重连（指数退避 + 抖动）、断线自救（局域网找接棒主机）、状态可订阅。 */
class OnlineClient {
  private state: OnlineState = initial;
  private listeners = new Set<() => void>();
  private ws: WebSocket | null = null;
  private wanted = false;
  private retry = 0;
  private retryTimer: number | null = null;
  private queue: ClientMessage[] = [];
  private pingTimer: number | null = null;
  /** 最近一次收到服务器任何消息的时间：看门狗靠它发现静默断链 */
  private lastAlive = 0;
  private rescueTimer: number | null = null;

  getState = () => this.state;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private patch(p: Partial<OnlineState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l());
  }

  connect(): void {
    this.wanted = true;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    )
      return;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.patch({ status: this.retry > 0 ? 'reconnecting' : 'connecting' });
    let ws: WebSocket;
    try {
      ws = new WebSocket(serverUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    this.lastAlive = Date.now();
    ws.onopen = () => {
      this.retry = 0;
      this.lastAlive = Date.now();
      const { name, token, avatar } = profile.get();
      ws.send(
        JSON.stringify({
          t: 'hello',
          token,
          name,
          avatar,
          v: PROTOCOL_VERSION,
        } satisfies ClientMessage),
      );
      // 重连后回到原来的房间（服务器重启过、房间已不在时会收到 no-room）
      const roomCode = this.state.room?.code;
      if (roomCode) ws.send(JSON.stringify({ t: 'join', code: roomCode } satisfies ClientMessage));
      // 掉线期间留下的进房/建房/聊天补发；操作类消息已丢弃，以服务器状态为准
      const pending = this.queue.filter((m) => m.t === 'chat' || m.t === 'create' || (m.t === 'join' && m.code !== roomCode));
      this.queue = [];
      for (const m of pending) ws.send(JSON.stringify(m));
      this.patch({ status: 'open', rescue: null });
      this.stopRescue();
      this.pingTimer = window.setInterval(() => {
        // 看门狗：服务器 45 秒没有任何回音（移动网络静默断链）就主动断开触发重连
        if (Date.now() - this.lastAlive > 45_000) {
          ws.close();
          return;
        }
        this.send({ t: 'ping' });
      }, 20_000);
    };
    ws.onmessage = (e) => {
      this.lastAlive = Date.now();
      try {
        this.onMessage(JSON.parse(String(e.data)) as ServerMessage);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.ws === ws) this.ws = null;
      if (this.wanted) this.scheduleReconnect();
      else this.patch({ status: 'idle' });
    };
    ws.onerror = () => ws.close();
  }

  private scheduleReconnect() {
    this.retry++;
    // 抖动：一堆设备同时断网重连时别在同一毫秒一起压上来
    const delay = Math.min(8000, 400 * 2 ** Math.min(this.retry, 5)) * (0.7 + Math.random() * 0.6);
    const offline = this.retry > 6;
    this.patch({ status: offline ? 'offline' : 'reconnecting' });
    // 房间里断到彻底离线：开自救——在局域网里找持有这间房的主机（含接棒的新主机）
    if (offline && this.state.room) this.startRescue();
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      if (this.wanted) this.connect();
    }, delay);
  }

  /* ---------------- 断线自救：局域网里找持有这间房的主机 ---------------- */

  private startRescue(): void {
    const code = this.state.room?.code;
    if (!code || this.rescueTimer) return;
    let tries = 0;
    const tick = async () => {
      this.rescueTimer = null;
      // getState() 是方法调用，TS 不会沿用旧收窄；等 await 回来必须重读真实状态
      if (!this.wanted || !this.getState().room || this.getState().status === 'open') return;
      tries++;
      this.patch({ rescue: { code, tries, at: Date.now() } });
      try {
        const host = await findRoomHost(code);
        if (!this.wanted || this.getState().status === 'open' || !host) return;
        const target = `ws://${host.ip}:${host.port}/ws`;
        if (normalizeServer(serverUrl()) !== normalizeServer(target)) {
          setServerOverride(target);
          this.patch({ rescue: { code, target: `${host.ip}:${host.port}`, tries, at: Date.now() } });
          this.retry = 0;
          this.connect();
          return;
        }
      } catch {
        /* 扫不到就等下一轮 */
      }
      if (tries < 10) this.rescueTimer = window.setTimeout(tick, 8_000);
    };
    this.rescueTimer = window.setTimeout(tick, 3_000);
  }

  private stopRescue(): void {
    if (this.rescueTimer) clearTimeout(this.rescueTimer);
    this.rescueTimer = null;
    if (this.state.rescue) this.patch({ rescue: null });
  }

  /** 立即重试（例如用户点击"重新连接"） */
  reconnectNow(): void {
    this.retry = 0;
    this.stopRescue();
    this.connect();
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return;
    }
    // 掉线期间只有这三类值得留：进房/建房是流程的一部分，聊天是用户打了字。
    // 操作类消息（出牌/换座/开局）过期重放会出错，一律丢弃，重连后以服务器状态为准。
    if (msg.t === 'join' || msg.t === 'create' || msg.t === 'chat') {
      this.queue = [...this.queue, msg].slice(-20);
    }
    if (msg.t !== 'ping') this.connect();
  }

  /** 离开联机（回到大厅时调用） */
  disconnect(): void {
    this.wanted = false;
    this.queue = [];
    this.stopRescue();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
    this.patch({ ...initial });
  }

  clearError(): void {
    this.patch({ error: null });
  }

  private onMessage(m: ServerMessage) {
    switch (m.t) {
      case 'welcome':
        this.patch({ playerId: m.playerId, myScore: m.score });
        break;
      case 'score': {
        // 不在这个房间（或已经离开）就丢弃，避免串房
        if (m.code && this.state.room && this.state.room.code !== m.code) break;
        this.patch({
          matchScore: m.match ?? this.state.matchScore,
          roomScores: m.rows.length ? m.rows : this.state.roomScores,
          myScore: m.you ?? this.state.myScore,
        });
        break;
      }
      case 'room': {
        const sameRoom = this.state.room?.code === m.room.code;
        // 新一局时服务端先推 matchNo 已递增的 room、再推 game。
        // 必须以 matchNo 判定是否保留旧 game，否则一帧内 game.matchNo≠room.matchNo，
        // 控制器（controller.ts: game.matchNo !== room.matchNo → null）会卸载牌桌导致闪白。
        const sameMatch =
          this.state.game && sameRoom && this.state.game.matchNo === m.room.matchNo;
        this.patch({
          room: m.room,
          you: m.you,
          game: sameMatch ? this.state.game : null,
          chat: sameRoom ? this.state.chat : [],
          matchScore: sameRoom ? this.state.matchScore : null,
          roomScores: sameRoom ? this.state.roomScores : [],
        });
        break;
      }
      case 'chat': {
        if (this.state.room && this.state.room.code !== m.code) break;
        if (this.state.chat.some((x) => x.id === m.message.id)) break;
        this.patch({ chat: [...this.state.chat, m.message].slice(-CHAT_HISTORY) });
        break;
      }
      case 'chatHistory':
        if (this.state.room && this.state.room.code !== m.code) break;
        this.patch({ chat: m.messages });
        break;
      case 'game': {
        if (
          this.state.game &&
          this.state.game.matchNo === m.matchNo &&
          this.state.game.version > m.version
        )
          break;
        // 新一局开始：把上一局的结算卡收掉，避免比赛进行中还挂着旧账
        const stale = this.state.matchScore && this.state.matchScore.matchNo !== m.matchNo;
        this.patch({
          game: m,
          clockOffset: m.serverTime - Date.now(),
          matchScore: stale && !m.over ? null : this.state.matchScore,
        });
        break;
      }
      case 'left':
        this.patch({ room: null, you: null, game: null, chat: [], matchScore: null, roomScores: [] });
        break;
      case 'error':
        this.patch({ error: { message: m.message, code: m.code, at: Date.now() } });
        if (m.code === 'no-room' && this.state.room) {
          this.patch({
            room: null,
            you: null,
            game: null,
            chat: [],
            matchScore: null,
            roomScores: [],
          });
        }
        if (m.code === 'replaced') {
          this.wanted = false;
          this.ws?.close();
        }
        break;
      case 'emote': {
        const now = Date.now();
        const emotes = [...this.state.emotes.filter((e) => now - e.at < 4000), { ...m, at: now }];
        this.patch({ emotes });
        break;
      }
      case 'pong':
        this.patch({ clockOffset: m.serverTime - Date.now() });
        break;
    }
  }
}

export const online = new OnlineClient();

export function useOnline(): OnlineState {
  return useSyncExternalStore(online.subscribe, online.getState, online.getState);
}

// 改名 / 换形象后同步给服务器
let last = `${profile.get().name}|${profile.get().avatar}`;
profile.subscribe(() => {
  const { name, avatar } = profile.get();
  const key = `${name}|${avatar}`;
  if (key !== last) {
    last = key;
    if (online.getState().status === 'open') online.send({ t: 'rename', name, avatar });
  }
});
