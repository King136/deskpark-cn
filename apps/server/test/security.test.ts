import type { ServerMessage } from '@park/protocol';
import { PROTOCOL_VERSION } from '@park/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startServer } from '../src/server';

type Srv = ReturnType<typeof startServer>;
let server: Srv;
let port = 0;
let base = '';

beforeAll(async () => {
  server = startServer({
    port: 0,
    host: '127.0.0.1',
    staticDir: null,
    config: { turnTimeoutMs: 5000, maxIdentitiesPerIp: 3 }, // 收紧上限便于测试
  });
  port = await server.ready;
  base = `http://127.0.0.1:${port}`;
});
afterAll(async () => {
  await server.close();
});

describe('服务端安全加固（v0.4.0 回归）', () => {
  it('/api/lan 默认不泄露房号与玩家昵称', async () => {
    const res = await fetch(`${base}/api/lan`);
    const body = (await res.json()) as { rooms: unknown[]; roomCount: number; code?: string };
    expect(res.status).toBe(200);
    expect(Array.isArray(body.rooms)).toBe(true);
    expect(body.rooms.length).toBe(0);
    expect(typeof body.roomCount).toBe('number');
    expect(JSON.stringify(body)).not.toContain('players');
  });

  it('/api/profile 拒绝超大 body（>8KB）', async () => {
    const big = 'x'.repeat(9 * 1024);
    const res = await fetch(`${base}/api/profile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ua: big }),
    });
    expect(res.status).toBe(413);
  });

  it('单 IP 身份数超上限后被拒绝', async () => {
    const connect = (token: string) =>
      new Promise<{ ws: WebSocket; welcome: boolean; err: boolean }>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        let welcome = false;
        let err = false;
        ws.on('open', () => {
          ws.send(JSON.stringify({ t: 'hello', token, name: 'T', v: PROTOCOL_VERSION }));
        });
        ws.on('message', (d) => {
          const m = JSON.parse(d.toString()) as ServerMessage;
          if (m.t === 'welcome') welcome = true;
          if (m.t === 'error' && m.code === 'too-many-identities') err = true;
        });
        setTimeout(() => resolve({ ws, welcome, err }), 300);
      });
    // 上限 3：前 3 个成功，第 4 个被拒
    const results: { ws: WebSocket; welcome: boolean; err: boolean }[] = [];
    for (let i = 0; i < 4; i++) {
      results.push(await connect(`sec-token-${'a'.repeat(16)}-${i}`));
    }
    const accepted = results.filter((r) => r.welcome).length;
    expect(accepted).toBeLessThanOrEqual(3);
    expect(results[3].err).toBe(true);
    results.forEach((r) => r.ws.close());
  });

  it('旧协议版本被拒绝且无 welcome', async () => {
    const result = await new Promise<{ welcome: boolean; versionErr: boolean }>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      let welcome = false;
      let versionErr = false;
      ws.on('open', () => {
        ws.send(JSON.stringify({ t: 'hello', token: `old-${'z'.repeat(16)}`, name: '老', v: -1 }));
      });
      ws.on('message', (d) => {
        const m = JSON.parse(d.toString()) as ServerMessage;
        if (m.t === 'welcome') welcome = true;
        if (m.t === 'error' && m.code === 'version') versionErr = true;
      });
      setTimeout(() => {
        ws.close();
        resolve({ welcome, versionErr });
      }, 300);
    });
    expect(result.versionErr).toBe(true);
    expect(result.welcome).toBe(false);
  });
});
