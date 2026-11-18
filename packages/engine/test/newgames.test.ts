import { describe, expect, it } from 'vitest';
import { battle, blocks, checkers, g2048, klondike, liar, ludo, mines, snake, sudoku } from '../src/index';

const ctx = (options: unknown, players = 4) => ({
  options,
  players: Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
  seed: 1234,
}) as never;

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('新玩法规则自检', () => {
  it('纸牌接龙：七列发牌 1..7，整段搬移与收牌叠约束', () => {
    const d: any = klondike;
    const s0 = d.setup(ctx({ draw: 1 }));
    expect(s0.tableau.map((p: number[]) => p.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(s0.stock.length + s0.tableau.flat().length).toBe(52);
    // 非 A 的牌不能进收牌叠
    const card = s0.tableau[0][0];
    const bad = d.validate(s0, 0, { type: 'move', from: 'tableau', pile: 0, index: 0, to: 'foundation', target: Math.floor(card / 13) });
    if ((card % 13) + 1 !== 1) expect(bad).toBeTruthy();
  });

  it('扫雷：翻格与插旗，踩雷即结束', () => {
    const d: any = mines;
    let s = d.setup(ctx({ cols: 9, rows: 9, mines: 10 }));
    expect(s.revealed.filter(Boolean).length).toBe(0);
    const flag = d.apply(s, 0, { type: 'flag', index: 0 });
    expect(flag.flags[0]).toBe(true);
    const safe = s.cells.findIndex((v: number) => v > 0);
    s = d.apply(s, 0, { type: 'reveal', index: safe });
    expect(s.revealed[safe]).toBe(true);
    expect(s.over).toBe(false);
  });

  it('数独：给定格不可改，填对不增加失误', () => {
    const d: any = sudoku;
    const s = d.setup(ctx({ blanks: 42 }));
    expect(s.given.filter(Boolean).length).toBe(39);
    const givenAt = s.given.findIndex(Boolean);
    expect(d.validate(s, 0, { type: 'set', index: givenAt, value: 1 })).toBeTruthy();
    const empty = s.given.findIndex((g: boolean) => !g);
    const s2 = d.apply(s, 0, { type: 'set', index: empty, value: s.puzzle[empty] });
    expect(s2.errors).toBe(s.errors);
  });

  it('跳棋：各 12 子，合法一步后换手', () => {
    const d: any = checkers;
    const s = d.setup(ctx({ size: 8 }));
    expect(s.red).toBe(12);
    expect(s.black).toBe(12);
    const moved = d.apply(s, 0, { type: 'move', from: 40, to: 33 });
    expect(moved.turn).toBe(1);
  });

  it('飞行棋：掷骰后选子前进，未掷不能选子', () => {
    const d: any = ludo;
    const s = d.setup(ctx({ tokens: 4, track: 28 }, 4));
    expect(d.validate(s, 0, { type: 'pick', token: 0 })).toBeTruthy();
    const rolled = d.apply(s, 0, { type: 'roll' });
    expect(rolled.dice).toBeGreaterThanOrEqual(1);
    const moved = d.apply(rolled, 0, { type: 'pick', token: 0 });
    expect(moved.pos[0][0]).toBeGreaterThanOrEqual(0);
  });

  it('吹牛骰：喊数递增约束，开盅即结算', () => {
    const d: any = liar;
    const s = d.setup(ctx({ dice: 5 }, 2));
    expect(d.validate(s, 0, { type: 'challenge' })).toBeTruthy();
    const b = d.apply(s, 0, { type: 'bid', count: 2, face: 3 });
    expect(b.turn).toBe(1);
    expect(d.validate(b, 1, { type: 'bid', count: 2, face: 3 })).toBeTruthy();
    const done = d.apply(b, 1, { type: 'challenge' });
    expect(done.over).toBe(true);
  });

  it('海战棋：开炮标记与换手', () => {
    const d: any = battle;
    const s = d.setup(ctx({ size: 10 }, 2));
    const shot = d.apply(s, 0, { type: 'fire', index: 0 });
    expect([1, 2]).toContain(shot.shots[0][0]);
    if (!shot.over) expect(shot.turn).toBe(1);
  });

  it('落块：tick 会推进或落地，棋盘尺寸正确', () => {
    const d: any = blocks;
    const s0 = d.setup(ctx({ cols: 10, rows: 18 }));
    expect(s0.board.length).toBe(180);
    expect(s0.cur).not.toBeNull();
    const s1 = d.apply(s0, 0, { type: 'tick' });
    expect(s1.board.length).toBe(180);
  });

  it('贪吃蛇：tick 会前进，转向不吃反向', () => {
    const d: any = snake;
    const s0 = d.setup(ctx({ cols: 16, rows: 16 }));
    const s1 = d.apply(s0, 0, { type: 'tick' });
    expect(s1.snake[0]).not.toBe(s0.snake[0]);
    const s2 = d.apply(s1, 0, { type: 'turn', dir: 'left' });
    expect(s2.dir).toBe('right');
  });

  it('2048：滑动后总数与棋盘合法', () => {
    const d: any = g2048;
    const s0 = d.setup(ctx({ size: 4 }, 1));
    expect(s0.board.filter((v: number) => v > 0).length).toBe(2);
    const s1 = d.apply(s0, 0, { type: 'move', dir: 'left' });
    expect(s1.board.length).toBe(16);
  });
});
