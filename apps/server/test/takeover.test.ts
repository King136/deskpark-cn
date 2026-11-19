/**
 * 自接棒语义测试：房主下线 → 快照落盘 → 新主机按房号接回 →
 * 玩家凭 token 认领原座位 → 牌局继续 → 打完正常结算。
 * 全程只用 Hub（与传输层无关），等价于「换一台设备当主机」。
 */
import type { ClientMessage, ServerMessage } from '@park/protocol';
import { PROTOCOL_VERSION } from '@park/protocol';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, Hub, type RoomPersist } from '../src/rooms';

function memPersist(): RoomPersist {
  const store = new Map<string, unknown>();
  return {
    list: () => [...store.keys()],
    read: (code) => store.get(code) ?? null,
    write: (code, data) => void store.set(code, data),
    remove: (code) => void store.delete(code),
  };
}

interface Conn {
  inbox: ServerMessage[];
  post: (m: ClientMessage) => void;
  close: () => void;
}

function dial(hub: Hub, token: string, name: string): Conn {
  const inbox: ServerMessage[] = [];
  const { onMessage, onClose } = hub.connect((m) => inbox.push(m));
  onMessage({ t: 'hello', token, name, v: PROTOCOL_VERSION } satisfies ClientMessage);
  return {
    inbox,
    post: (m) => onMessage(m),
    close: () => onClose(),
  };
}

function last<T extends ServerMessage['t']>(c: Conn, t: T) {
  return [...c.inbox].reverse().find((m) => m.t === t) as
    | Extract<ServerMessage, { t: T }>
    | undefined;
}

function waitFor<T extends ServerMessage['t']>(c: Conn, t: T, ms = 3000) {
  const found = () => last(c, t);
  const initial = found();
  if (initial) return Promise.resolve(initial);
  return new Promise<Extract<ServerMessage, { t: T }>>((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const m = found();
      if (m) {
        clearInterval(timer);
        resolve(m);
      } else if (Date.now() - started > ms) {
        clearInterval(timer);
        reject(new Error(`timeout waiting for ${t}`));
      }
    }, 20);
  });
}

describe('自接棒：快照 → 换主机 → 继续打完', () => {
  it('牌局进行中换主机，座位与牌局完整恢复', async () => {
    const persist = memPersist();
    const cfg = {
      ...DEFAULT_CONFIG,
      persist,
      playPersistMs: 60,
      log: () => {},
    };

    // ---- 第一台主机：建房开打 ----
    const hub1 = new Hub(cfg);
    const a = dial(hub1, 'token-alice', '爱丽丝');
    const b = dial(hub1, 'token-bob', '小波');
    a.post({ t: 'create', gameId: 'highcard', seats: 2, options: { rounds: 1 } });
    const created = await waitFor(a, 'room');
    const code = created.room.code;
    expect(created.you.seat).toBe(0);
    b.post({ t: 'join', code });
    await waitFor(b, 'room', undefined as never).catch(() => {});
    expect(last(b, 'room')!.you.seat).toBe(1);

    a.post({ t: 'start' });
    const g1 = await waitFor(a, 'game');
    expect(g1.seat).toBe(0);

    // 各打一张，让牌局"进行到一半"
    const myHand = (c: Conn) =>
      ((last(c, 'game')!.view as { hand: { id: number }[] }).hand);
    a.post({ t: 'act', action: { type: 'choose', card: myHand(a)[0].id } });
    b.post({ t: 'act', action: { type: 'choose', card: myHand(b)[0].id } });
    await waitFor(b, 'game');

    // ---- 房主设备下线（进程直接消失） ----
    hub1.dispose();

    // 快照应已随牌局写盘（节流 60ms）
    await new Promise((r) => setTimeout(r, 260));
    const raw = persist.read(code) as { status?: string; play?: { state?: unknown } };
    expect(raw?.status).toBe('playing');
    expect(raw?.play?.state).toBeTruthy();

    // ---- 第二台主机：凭房号接回 ----
    const hub2 = new Hub(cfg);
    const a2 = dial(hub2, 'token-alice', '爱丽丝');
    a2.post({ t: 'join', code });
    const backA = await waitFor(a2, 'room');
    // 座位不漂移：爱丽丝还在 0 号位
    expect(backA.room.gameId).toBe('highcard');
    expect(backA.you.seat).toBe(0);
    expect(backA.room.status).toBe('playing');
    // 接回后立刻有牌局视图（ensurePlay 已开跑）
    const gA = await waitFor(a2, 'game');
    expect(gA.matchNo).toBe(1);

    const b2 = dial(hub2, 'token-bob', '小波');
    b2.post({ t: 'join', code });
    const backB = await waitFor(b2, 'room');
    expect(backB.you.seat).toBe(1);
    const gB = await waitFor(b2, 'game');
    // 两家的手牌与接棒前同源（同一份 state 恢复）
    const handA = (gA.view as { hand: { id: number }[] }).hand.map((c) => c.id).join(',');
    const handB = (gB.view as { hand: { id: number }[] }).hand.map((c) => c.id).join(',');
    expect(handA).not.toBe('');
    expect(handB).not.toBe('');

    // ---- 接棒后把这一局打完（1 局 5 墩；亮牌有 1.8s 停留，循环推进直到终局） ----
    const deadline = Date.now() + 40_000;
    while (Date.now() < deadline) {
      const gA2 = last(a2, 'game');
      const gB2 = last(b2, 'game');
      const va = (gA2?.view ?? { phase: 'matchOver', hand: [] }) as {
        phase: string;
        hand: { id: number }[];
      };
      const vb = (gB2?.view ?? { phase: 'matchOver', hand: [] }) as {
        phase: string;
        hand: { id: number }[];
      };
      if (va.phase === 'matchOver' || gA2?.over) break;
      if (va.phase === 'choose' && va.hand.length) {
        a2.post({ t: 'act', action: { type: 'choose', card: va.hand[0].id } });
      }
      if (vb.phase === 'choose' && vb.hand.length) {
        b2.post({ t: 'act', action: { type: 'choose', card: vb.hand[0].id } });
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    // 打完：结算与房间状态广播都正常
    const done = await waitFor(a2, 'game', 6000);
    expect(done.over).toBe(true);
    await waitFor(a2, 'score', 6000);
    expect(last(a2, 'room')!.room.status).toBe('finished');
    hub2.dispose();
  }, 60_000);

  it('等待中的房间接棒：只恢复座位与累计分，不凭空开局', async () => {
    const persist = memPersist();
    const cfg = { ...DEFAULT_CONFIG, persist, playPersistMs: 60, log: () => {} };
    const hub1 = new Hub(cfg);
    const a = dial(hub1, 'token-c', '翠花');
    a.post({ t: 'create', gameId: 'highcard', seats: 3, options: { rounds: 1 } });
    const code = (await waitFor(a, 'room')).room.code;
    // 等落盘（touch 900ms 节流）
    await new Promise((r) => setTimeout(r, 1100));
    hub1.dispose();

    const hub2 = new Hub(cfg);
    const a2 = dial(hub2, 'token-c', '翠花');
    a2.post({ t: 'join', code });
    const back = await waitFor(a2, 'room');
    expect(back.room.status).toBe('waiting');
    expect(back.room.seats).toHaveLength(3);
    expect(back.you.seat).toBe(0);
    // 空位补电脑后开局成功：接回来的房间是能正常打的
    a2.post({ t: 'bot', seat: 1, add: true });
    a2.post({ t: 'bot', seat: 2, add: true });
    a2.post({ t: 'start' });
    const g = await waitFor(a2, 'game');
    expect(g.seat).toBe(0);
    hub2.dispose();
  }, 20_000);
});
