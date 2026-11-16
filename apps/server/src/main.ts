import { startServer } from './server';
import { ScoreStore } from './scores';

const port = Number(process.env.PORT) || 8787;
const turnTimeoutMs = Number(process.env.TURN_TIMEOUT_MS) || 30_000;
/** 娱乐分存档目录；设为 off 则不落盘（每次重启清零） */
const dataDir = process.env.PARK_DATA_DIR ?? './data';
const log = (...args: unknown[]) => console.log(new Date().toISOString(), ...args);
const scores = new ScoreStore(dataDir === 'off' ? null : dataDir, log);

const server = startServer({
  port,
  host: process.env.HOST,
  staticDir: process.env.STATIC_DIR,
  config: {
    turnTimeoutMs,
    scores,
    log,
  },
});

server.ready.then((p) => {
  console.log(`🏯 闲亭服务器已启动  http://localhost:${p}   (WebSocket: /ws)`);
  console.log(`   静态资源目录: ${server.staticDir}`);
});

// 联机状态全在内存里：单个请求出错时记录下来继续服务，而不是让所有对局随进程一起中断
process.on('uncaughtException', (e) => console.error(new Date().toISOString(), '[uncaught]', e));
process.on('unhandledRejection', (e) => console.error(new Date().toISOString(), '[unhandled]', e));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    scores.dispose();
    server.close().finally(() => process.exit(0));
  });
}
