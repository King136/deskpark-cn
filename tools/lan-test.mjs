/**
 * 房间接棒自测：`node tools/lan-test.mjs create|join <房号>`
 * 用真实 WebSocket 协议跑，验证「服务端重启 / 换机后房间还在」。
 */
import WebSocket from 'ws';

const mode = process.argv[2] ?? 'create';
const code = process.argv[3] ?? '';
const url = process.env.WS_URL ?? 'ws://127.0.0.1:8899/ws';

const ws = new WebSocket(url);
let done = false;
const finish = (ok, msg) => {
  if (done) return;
  done = true;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`);
  try {
    ws.close();
  } catch {}
  setTimeout(() => process.exit(ok ? 0 : 1), 200);
};

ws.on('open', () => {
  ws.send(JSON.stringify({ t: 'hello', v: 1, token: 'test-token-1234567890', name: '接棒测试' }));
  setTimeout(() => {
    if (mode === 'create') {
      ws.send(JSON.stringify({ t: 'create', gameId: 'doudizhu', seats: 3 }));
    } else {
      ws.send(JSON.stringify({ t: 'join', code }));
    }
  }, 120);
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.t === 'error') return finish(false, `错误：${msg.message}`);
  if (msg.t === 'room') {
    if (mode === 'create') return finish(true, `建房成功 ${msg.room.code}（${msg.room.gameId}）`);
    return finish(
      msg.room.code === code,
      `加入 ${msg.room.code} 成功，座位 ${msg.you.seat}，房主 ${msg.you.isHost}`,
    );
  }
});
ws.on('error', (e) => finish(false, String(e)));
setTimeout(() => finish(false, '超时没收到房间消息'), 5000);
