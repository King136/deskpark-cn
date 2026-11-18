import { describe, expect, it } from 'vitest';
import { mjx, simulate } from '../src/index';

/* eslint-disable @typescript-eslint/no-explicit-any */
const GAMES = [
  ['mj_guangdong', mjx.mjGuangdong],
  ['mj_changsha', mjx.mjChangsha],
  ['mj_guobiao', mjx.mjGuobiao],
] as const;

describe('地域麻将内核（v0.3.1 重构回归）', () => {
  for (const [id, def] of GAMES) {
    it(`${id}：整局模拟能正常结束，不再空转摸牌`, () => {
      let wins = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const { state } = simulate(def as any, 4, (def as any).defaultOptions, seed, 1200);
        const s = state as any;
        expect(s.over).toBe(true);
        // 核心回归：绝不能出现旧 bug 的"庄家手牌涨到 97 张 / 零弃牌"空转
        expect(Math.max(...s.hands.map((h: number[]) => h.length))).toBeLessThan(20);
        expect(s.discards.reduce((a: number, d: number[]) => a + d.length, 0)).toBeGreaterThan(10);
        // 牌墙必须有实际消耗（摸过牌）
        expect(s.wall.length).toBeLessThan(136 - 52);
        if (s.winner !== null) wins++;
      }
      // 12 局里绝大多数应能分出胜负（流局允许，但不能全流局）
      expect(wins).toBeGreaterThanOrEqual(8);
    });

    it(`${id}：view 严格信息隐藏，他家手牌只给张数`, () => {
      const { state } = simulate(def as any, 4, (def as any).defaultOptions, 7, 1);
      const s = state as any;
      const v = (def as any).view(s, 0);
      // 自己的手牌是真牌（非负），他家用 -1 占位
      expect(v.hands[0].every((t: number) => t >= 0)).toBe(true);
      for (const p of [1, 2, 3]) {
        expect(v.hands[p].every((t: number) => t === -1)).toBe(true);
        expect(v.hands[p].length).toBe(s.hands[p].length);
      }
    });

    it(`${id}：bot 在出牌阶段产出合法动作`, () => {
      const s0 = (def as any).setup({ seed: 99, players: [], options: (def as any).defaultOptions });
      const v = (def as any).view(s0, 0);
      const action = (def as any).bot(v, 0, null);
      expect(['discard', 'hu', 'peng', 'gang', 'chi', 'pass']).toContain(action.type);
      const err = (def as any).validate(s0, 0, action);
      expect(err).toBeNull();
    });
  }

  it('赖子胡牌：长沙红中可作任意牌', () => {
    // 手牌 1万1万 + 赖子... 构造成 14 张：111万 222万 333万 444万 55万(2张) 中(赖子补将)
    const hand = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 33];
    // 4 组面子 + 5万对子，这里把 33(红中) 当一张普通牌放入，验证基础胡牌判定
    expect(typeof mjx.isHu).toBe('function');
    // 标准四面子一将应胡
    expect((mjx.isHu as any)([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4], -1)).toBe(true);
    // 非和牌手牌应不胡
    expect((mjx.isHu as any)([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 8], -1)).toBe(false);
    // 带赖子：把上面对子的一张换成赖子，仍应胡
    expect((mjx.isHu as any)([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 33], 33)).toBe(true);
    expect(hand.length).toBe(14);
  });
});
