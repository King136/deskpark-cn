import { describe, expect, it } from 'vitest';
import { HostCore } from '../src/lib/hostCore';

/** 用内存里的「两条手机连接」验证本机主机跑的就是线上服务端那套 Hub */
function rig() {
  const out: Record<string, string[]> = { a: [], b: [] };
  const core = new HostCore((session, text) => {
    (out[session] ??= []).push(text);
  });
  core.open('a');
  core.open('b');
  const find = (session: string, type: string) => {
    const rows = (out[session] ?? []).map((r) => JSON.parse(r));
    return rows.reverse().find((m) => m.t === type) ?? null;
  };
  const send = (session: string, msg: unknown) => core.message(session, JSON.stringify(msg));
  return { core, out, find, send };
}

describe('本机当主机（HostCore）', () => {
  it('建房后另一条连接能用房号加入，并收到同一间房的快照', () => {
    const { find, send } = rig();
    send('a', { t: 'hello', v: 1, token: 'aaaaaaaaaaaaaaaaaaaa', name: '甲' });
    send('a', { t: 'create', gameId: 'doudizhu', seats: 3 });
    const created = find('a', 'room');
    expect(created.t).toBe('room');
    const code = created.room.code;
    expect(code).toHaveLength(4);

    send('b', { t: 'hello', v: 1, token: 'bbbbbbbbbbbbbbbbbbbb', name: '乙' });
    send('b', { t: 'join', code });
    const joined = find('b', 'room');
    expect(joined.t).toBe('room');
    expect(joined.room.code).toBe(code);
    expect(joined.room.seats.filter((s: { kind: string }) => s.kind === 'human')).toHaveLength(2);
  });

  it('房号不存在时回错误而不是崩掉', () => {
    const { find, send } = rig();
    send('a', { t: 'hello', v: 1, token: 'aaaaaaaaaaaaaaaaaaaa', name: '甲' });
    send('a', { t: 'join', code: 'ZZZZ' });
    expect(find('a', 'error')).toBeTruthy();
  });

  it('断开连接后座位被标记离线，房间还在', () => {
    const { core, find, send } = rig();
    send('a', { t: 'hello', v: 1, token: 'aaaaaaaaaaaaaaaaaaaa', name: '甲' });
    send('a', { t: 'create', gameId: 'doudizhu', seats: 3 });
    const code = find('a', 'room').room.code;
    core.close('a');
    expect(core.rooms().map((r) => r.code)).toContain(code);
  });
});
