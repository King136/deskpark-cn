import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ScoreStore } from '../src/scores';

const dirs: string[] = [];

function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'park-score-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('娱乐分存档', () => {
  it('累计、按玩法分账、重启后不丢', () => {
    const dir = tmpDir();
    const a = new ScoreStore(dir);
    a.bump('p1', '阿明', 'doudizhu', 20, true);
    a.bump('p1', '阿明', 'doudizhu', -5, false);
    a.bump('p1', '阿明', 'sichuan', 7, true);
    a.flush();

    const b = new ScoreStore(dir);
    const s = b.summary('p1');
    expect(s.total).toBe(22);
    expect(s.matches).toBe(3);
    expect(s.wins).toBe(2);
    expect(s.byGame.doudizhu).toEqual({ total: 15, matches: 2 });
    expect(s.byGame.sichuan).toEqual({ total: 7, matches: 1 });
  });

  it('文件里只有分数，没有任何金额/订单字段', () => {
    const dir = tmpDir();
    const a = new ScoreStore(dir);
    a.bump('p2', '阿花', 'guandan', 3, true);
    a.flush();
    const raw = readFileSync(join(dir, 'scores.json'), 'utf8');
    const parsed = JSON.parse(raw) as { players: Record<string, { totals: Record<string, unknown> }> };
    const keys = Object.keys(parsed.players.p2.totals).sort();
    expect(keys).toEqual(['byGame', 'matches', 'total', 'wins']);
    // 明确不允许出现的字段
    for (const banned of ['balance', 'coin', 'recharge', 'order', 'cash', 'rate', 'wallet']) {
      expect(raw.includes(banned)).toBe(false);
    }
  });

  it('未知玩家返回全 0 档案，不会凭空造分', () => {
    const s = new ScoreStore(tmpDir()).summary('nobody');
    expect(s).toEqual({ total: 0, matches: 0, wins: 0, byGame: {} });
  });

  it('存档损坏时自动改名并从空白重来，不炸服务', () => {
    const dir = tmpDir();
    const a = new ScoreStore(dir);
    a.bump('p3', '老李', 'xiangqi', 1, true);
    a.flush();
    // 模拟写坏
    const bad = '{"version":1,"players":{"p3":{';
    writeFileSync(join(dir, 'scores.json'), bad);
    const b = new ScoreStore(dir);
    expect(b.summary('p3').total).toBe(0);
    expect(() => new ScoreStore(dir)).not.toThrow();
  });

  it('不落盘模式（dir=null）仍可统计，只是重启清零', () => {
    const a = new ScoreStore(null);
    a.bump('p4', '小周', 'texas', 12, true);
    expect(a.summary('p4').total).toBe(12);
    expect(() => a.flush()).not.toThrow();
  });
});
