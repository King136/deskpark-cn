import { describe, expect, it } from 'vitest';
import {
  chess,
  doudizhu,
  guandan,
  highcard,
  onecard,
  sichuan,
  simulate,
  texas,
  xiangqi,
  type AnyGame,
} from '@park/engine';
import { MAX_ABS_DELTA, accumulate, emptyTotals, isZeroSum, settleMatch } from '../src';
import { rankDeltas } from '../src';

function finish(def: AnyGame, players: number, options: unknown, seed = 2026) {
  const { state, steps } = simulate(def, players, options as never, seed, 40000);
  return { state, steps };
}

/** 分差必须是整数、在允许范围内、且座位数对齐 */
function expectWellFormed(deltas: number[], seats: number) {
  expect(deltas).toHaveLength(seats);
  for (const d of deltas) {
    expect(Number.isInteger(d)).toBe(true);
    expect(Math.abs(d)).toBeLessThanOrEqual(MAX_ABS_DELTA);
  }
}

describe('娱乐分结算', () => {
  it('斗地主：终局分差可用且总分守恒', () => {
    const { state } = finish(doudizhu, 3, { baseScore: 1, rounds: 1 }, 11);
    const s = settleMatch('doudizhu', state, 3);
    expect(s.counted).toBe(true);
    expect(s.unit).toBe('分');
    const deltas = s.rows.map((r) => r.delta);
    expectWellFormed(deltas, 3);
    expect(isZeroSum(s)).toBe(true);
    // 地主拿两份，两个农民各一份，方向相反
    const nonzero = deltas.filter((d) => d !== 0);
    expect(nonzero.length).toBeGreaterThanOrEqual(2);
  });

  it('斗地主：多局累计后总分依然守恒', () => {
    const { state } = finish(doudizhu, 3, { baseScore: 2, rounds: 3 }, 12);
    const s = settleMatch('doudizhu', state, 3);
    expect(isZeroSum(s)).toBe(true);
  });

  it('四川麻将：终局分差可用且总分守恒', () => {
    const { state } = finish(
      sichuan,
      4,
      { baseScore: 1, exchange: true, jingoudiao: true, rounds: 1, chips: 0 },
      21,
    );
    const s = settleMatch('sichuan', state, 4);
    expect(s.counted).toBe(true);
    expectWellFormed(
      s.rows.map((r) => r.delta),
      4,
    );
    expect(isZeroSum(s)).toBe(true);
  });

  it('掼蛋：按升级数给出零和分差', () => {
    const { state } = finish(guandan, 4, { startLevel: 13, tribute: false }, 31);
    const s = settleMatch('guandan', state, 4);
    expect(s.counted).toBe(true);
    expectWellFormed(
      s.rows.map((r) => r.delta),
      4,
    );
    expect(isZeroSum(s)).toBe(true);
    // 同队两人同向
    expect(s.rows[0].delta).toBe(s.rows[2].delta);
    expect(s.rows[1].delta).toBe(s.rows[3].delta);
  });

  it('德州：按筹码净赢结算且守恒', () => {
    const { state } = finish(texas, 4, { startingStack: 500, bigBlind: 10, blindUp: 0 }, 41);
    const s = settleMatch('texas', state, 4);
    expect(s.counted).toBe(true);
    expect(s.unit).toBe('筹码');
    expectWellFormed(
      s.rows.map((r) => r.delta),
      4,
    );
    expect(isZeroSum(s)).toBe(true);
  });

  it('象棋 / 国际象棋：胜负 ±1 或和棋 0', () => {
    for (const [id, def] of [
      ['xiangqi', xiangqi],
      ['chess', chess],
    ] as const) {
      const { state } = finish(def, 2, def.defaultOptions, 51);
      const s = settleMatch(id, state, 2);
      expect(s.counted).toBe(true);
      const total = s.rows.reduce((a, r) => a + r.delta, 0);
      expect(Math.abs(total)).toBeLessThanOrEqual(0);
      for (const r of s.rows) expect(Math.abs(r.delta)).toBeLessThanOrEqual(1);
    }
  });

  it('单人玩法也能给出结果（接龙 / 比大小）', () => {
    const a = finish(onecard, 4, onecard.defaultOptions, 61);
    const b = finish(highcard, 3, highcard.defaultOptions, 71);
    for (const [id, n, st] of [
      ['onecard', 4, a],
      ['highcard', 3, b],
    ] as const) {
      const s = settleMatch(id, st.state, n);
      expect(s.counted).toBe(true);
      expectWellFormed(
        s.rows.map((r) => r.delta),
        n,
      );
      // 各自累加型玩法也要换算成名次分：桌上必须对得上账
      expect(isZeroSum(s)).toBe(true);
    }
  });

  it('名次分：并列取平均、误差补第一位，始终零和', () => {
    // 4 人：第一名、两人并列第二、最后
    expect(rankDeltas([10, 5, 5, 0], 4)).toEqual([3, 0, 0, -3]);
    // 3 人全平：全 0
    expect(rankDeltas([2, 2, 2], 3)).toEqual([0, 0, 0]);
    // 6 人乱序，总和必须为 0
    const d = rankDeltas([1, 7, 3, 9, 0, 5], 6);
    expect(d.reduce((a, x) => a + x, 0)).toBe(0);
    expect(d.slice().sort((a, b) => b - a)).toEqual([5, 3, 1, -1, -3, -5]);
  });

  it('未知玩法 / 空状态：不计分而不是乱记', () => {
    const s = settleMatch('not-a-game', { foo: 1 }, 3);
    expect(s.counted).toBe(false);
    expect(s.rows.every((r) => r.delta === 0)).toBe(true);
    expect(settleMatch('doudizhu', null, 3).counted).toBe(false);
  });

  it('异常数据被收敛，不会写出离谱的账', () => {
    const s = settleMatch('doudizhu', { scores: [1e9, -1e9, 0], result: {} }, 3);
    expect(s.rows[0].delta).toBe(MAX_ABS_DELTA);
    expect(s.rows[1].delta).toBe(-MAX_ABS_DELTA);
  });

  it('累计：并入总分、按玩法分账、胜负计数', () => {
    let t = emptyTotals();
    t = accumulate(t, 'doudizhu', 30, true);
    t = accumulate(t, 'doudizhu', -10, false);
    t = accumulate(t, 'xiangqi', 1, true);
    expect(t.total).toBe(21);
    expect(t.matches).toBe(3);
    expect(t.wins).toBe(2);
    expect(t.byGame.doudizhu).toEqual({ total: 20, matches: 2 });
    expect(t.byGame.xiangqi).toEqual({ total: 1, matches: 1 });
  });
});
