import WebSocket from 'ws';

const URL = 'ws://127.0.0.1:8899/ws';

function open(name, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const log = [];
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'hello', token, name, v: 1 }));
    });
    ws.on('message', (d) => {
      const m = JSON.parse(String(d));
      log.push(m);
      if (m.t === 'welcome') resolve({ ws, log });
    });
    ws.on('error', reject);
  });
}

const a = await open('测试甲', 'tok_aaaaaaaaaaaaaaaa1');
const b = await open('测试乙', 'tok_bbbbbbbbbbbbbbbb2');

// 甲建房：斗地主，3 人，1 局定胜负
const gameId = process.argv[2] ?? 'highcard';
const options = process.argv[5] ? JSON.parse(process.argv[5]) : {};
a.ws.send(JSON.stringify({ t: 'create', gameId, options, seats: Number(process.argv[3]) || 3 }));
await new Promise((r) => setTimeout(r, 300));
const room = a.log.filter((m) => m.t === 'room').at(-1)?.room;
console.log('房间', room?.code, room?.seats.map((s) => s.kind));
b.ws.send(JSON.stringify({ t: 'join', code: room.code }));
await new Promise((r) => setTimeout(r, 300));

// 两个人都交给电脑托管，让对局自己打完
a.ws.send(JSON.stringify({ t: 'auto', on: true }));
b.ws.send(JSON.stringify({ t: 'auto', on: true }));
await new Promise((r) => setTimeout(r, 200));
a.ws.send(JSON.stringify({ t: 'start' }));

const deadline = Date.now() + (Number(process.argv[4]) || 60_000);
let scoreA = null;
while (Date.now() < deadline && !scoreA) {
  await new Promise((r) => setTimeout(r, 500));
  scoreA = a.log.find((m) => m.t === 'score' && m.match) ?? null;
}

if (!scoreA) {
  console.log('❌ 未收到结算');
  a.log.slice(-3).forEach((m) => console.log(JSON.stringify(m).slice(0, 160)));
  process.exit(1);
}

console.log('\n=== 结算 ===');
console.log('玩法:', scoreA.match.gameId, '| 依据:', scoreA.match.basis, '| 单位:', scoreA.match.unit);
let sum = 0;
for (const r of scoreA.match.rows) {
  sum += r.delta;
  console.log(`  座${r.seat} ${r.name} 本局 ${r.delta > 0 ? '+' : ''}${r.delta} | 累计 ${r.total}`);
}
console.log('总分（应为 0）:', sum);
console.log('乙是否收到同一份结算:', !!b.log.find((m) => m.t === 'score' && m.match));

// 单独拉一次积分档案
a.ws.send(JSON.stringify({ t: 'scoreboard' }));
await new Promise((r) => setTimeout(r, 500));
const sb = a.log.filter((m) => m.t === 'score').at(-1);
console.log('\n我的档案:', JSON.stringify(sb.you));
console.log('房间累计:', sb.rows.map((r) => `${r.name}:${r.session}`).join(' '));

a.ws.close();
b.ws.close();
process.exit(0);
