/**
 * 娱乐分的本地存档。
 *
 * 只存"分"，不存任何钱的字段：没有余额、没有充值档位、没有兑换汇率、没有订单。
 * 存档是一个 JSON 文件，原子写入（先写 .tmp 再 rename），进程退出前 flush。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ScoreSummary } from '@park/protocol';
import { accumulate, emptyTotals, type ScoreTotals } from '@park/score';

interface Entry {
  name: string;
  totals: ScoreTotals;
  updatedAt: number;
}

interface FileShape {
  version: 1;
  players: Record<string, Entry>;
}

/** 最多保留多少名玩家，超出按最近活跃淘汰，防止文件无限膨胀 */
const MAX_PLAYERS = 20_000;
/** 落盘节流：最多每 800ms 写一次 */
const WRITE_DEBOUNCE_MS = 800;

export class ScoreStore {
  private map = new Map<string, Entry>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly file: string | null;

  constructor(
    dir: string | null,
    private readonly log?: (...args: unknown[]) => void,
  ) {
    if (!dir) {
      this.file = null;
      return;
    }
    try {
      mkdirSync(dir, { recursive: true });
    } catch (e) {
      this.log?.('[score] mkdir failed', e);
    }
    this.file = join(dir, 'scores.json');
    this.load();
  }

  private load(): void {
    if (!this.file || !existsSync(this.file)) return;
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as FileShape;
      if (!raw || raw.version !== 1 || typeof raw.players !== 'object') return;
      for (const [id, e] of Object.entries(raw.players)) {
        if (!e || typeof e.totals?.total !== 'number') continue;
        this.map.set(id, e);
      }
      this.log?.('[score] loaded', this.map.size, 'profiles');
    } catch (e) {
      // 存档损坏不应拖垮服务：保留现场（改名为 .bad）后从空白开始
      this.log?.('[score] corrupt scores.json, starting empty', e);
      try {
        renameSync(this.file, `${this.file}.bad`);
      } catch {
        /* ignore */
      }
    }
  }

  summary(id: string | null | undefined): ScoreSummary {
    const e = id ? this.map.get(id) : undefined;
    const totals = e?.totals ?? emptyTotals();
    return {
      total: totals.total,
      matches: totals.matches,
      wins: totals.wins,
      byGame: { ...totals.byGame },
    };
  }

  /** 记一局。`delta` 由结算引擎给出，这里只做累加与落盘 */
  bump(
    id: string,
    name: string,
    gameId: string,
    delta: number,
    won: boolean,
  ): ScoreSummary {
    const prev = this.map.get(id);
    const totals = accumulate(prev?.totals ?? emptyTotals(), gameId, delta, won);
    this.map.set(id, { name, totals, updatedAt: Date.now() });
    this.schedule();
    return this.summary(id);
  }

  private schedule(): void {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, WRITE_DEBOUNCE_MS);
    this.timer.unref?.();
  }

  /** 同步落盘（启动/退出时可调用，保证不丢最近一局） */
  flush(): void {
    if (!this.file) return;
    try {
      if (this.map.size > MAX_PLAYERS) {
        const keep = [...this.map.entries()]
          .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
          .slice(0, MAX_PLAYERS);
        this.map = new Map(keep);
      }
      const players: Record<string, Entry> = {};
      for (const [id, e] of this.map) players[id] = e;
      const data: FileShape = { version: 1, players };
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(data), 'utf8');
      renameSync(tmp, this.file);
    } catch (e) {
      this.log?.('[score] flush failed', e);
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.flush();
  }
}
