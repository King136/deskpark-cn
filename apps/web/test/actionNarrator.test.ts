import { describe, expect, it } from 'vitest';
import type { AnyGame } from '@park/engine';
import { Rng, SYSTEM_SEAT, chess, doudizhu, gomoku, guandan, onecard, sichuan, texas, xiangqi } from '@park/engine';
import { narrate } from '../src/lib/actionNarrator';
import type { GameController } from '../src/lib/controller';

/**
 * 逐手播报回归：用规则电脑把各玩法跑若干步，每个动作都尝试生成文案。
 * 要求：任何一步都不抛错；出牌/落子类动作能给出中文短句。
 */
function ctlFor(def: AnyGame, view: unknown, last: { seat: number; type: string } | null, players = 4): GameController {
  return {
    mode: 'local',
    def,
    view,
    seat: 0,
    players: Array.from({ length: players }, (_, i) => ({
      name: `玩家${i + 1}`, isBot: true, isMe: i === 0, connected: true, auto: false,
    })),
    version: 1,
    deadlines: {},
    over: false,
    last,
    act: () => null,
    auto: false,
    setAuto: () => {},
    canRestart: true,
    restart: () => {},
    leave: () => {},
  } as GameController;
}

function drive(def: AnyGame, players: number, options: unknown, seed: number, steps = 120) {
  const rng = new Rng(seed);
  let state = def.setup({
    players: Array.from({ length: players }, (_, i) => ({ name: `玩家${i + 1}`, isBot: true })),
    options,
    seed,
  });
  let checks = 0;
  for (let step = 0; step < steps && !def.isOver(state); step++) {
    const active = def.activeSeats(state);
    let seat: number, action: any;
    if (!active.length) {
      const auto = def.autoAdvance?.(state);
      if (!auto) break;
      seat = SYSTEM_SEAT;
      action = auto.action;
    } else {
      seat = active[rng.int(active.length)];
      action = def.bot(def.view(state, seat), seat, new Rng(seed + step));
    }
    state = def.apply(state, seat, action);
    const view = def.view(state, 0);
    const last = { seat, type: String(action?.type ?? '') };
    const ctl = ctlFor(def, view, last, players);
    expect(() => narrate(ctl)).not.toThrow();
    const n = narrate(ctl);
    if (n) {
      checks++;
      expect(n.short.length).toBeGreaterThan(0);
      expect(n.text).toContain(n.short);
    }
  }
  return checks;
}

describe('逐手动作播报', () => {
  const games: [string, AnyGame, number, unknown][] = [
    ['斗地主', doudizhu, 3, doudizhu.defaultOptions],
    ['掼蛋', guandan, 4, guandan.defaultOptions],
    ['德州扑克', texas, 6, texas.defaultOptions],
    ['UNO', onecard, 4, onecard.defaultOptions],
    ['四川麻将', sichuan, 4, sichuan.defaultOptions],
    ['五子棋', gomoku, 2, gomoku.defaultOptions],
    ['中国象棋', xiangqi, 2, xiangqi.defaultOptions],
    ['国际象棋', chess, 2, chess.defaultOptions],
  ];
  for (const [name, def, players, options] of games) {
    it(`${name} 每手都能生成文案且不抛错`, () => {
      expect(drive(def, players, options, 42)).toBeGreaterThan(0);
    });
  }

  it('通用兜底：未知动作类型映射为中文动词', () => {
    const ctl = ctlFor(gomoku, {}, { seat: 1, type: 'place' });
    expect(narrate(ctl)?.short).toContain('落子');
  });
});
