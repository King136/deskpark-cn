import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';

/** 飞行棋（简化版）：掷骰前进，同格撞回起点，四枚全部到终点者胜。 */
export interface LdOptions {
  tokens: number;
  track: number;
}
export type LdAction =
  | { type: 'roll' }
  | { type: 'pick'; token: number }
  | { type: 'ready' };
export interface LdState {
  options: LdOptions;
  players: number;
  tokens: number;
  track: number;
  pos: number[][];
  dice: number;
  turn: Seat;
  over: boolean;
  winner: Seat | null;
  rng: number;
}
export interface LdView {
  seat: Seat | null;
  players: number;
  tokens: number;
  track: number;
  pos: number[][];
  dice: number;
  turn: Seat;
  over: boolean;
  winner: Seat | null;
}

export const ludo: GameDefinition<LdState, LdAction, LdView, LdOptions> = {
  meta: {
    id: 'ludo',
    category: 'board',
    name: '飞行棋',
    nameEn: 'Ludo',
    tagline: '掷骰前进，先回家者胜',
    minPlayers: 2,
    maxPlayers: 4,
    defaultPlayers: 4,
    rules: [
      '轮流掷骰，选一枚棋子按点数前进。',
      '停在同一格里会把对方棋子踢回机场（起点）。',
      '四枚棋子全部抵达终点即获胜。',
    ],
  },
  defaultOptions: { tokens: 4, track: 28 },
  optionFields: [],
  setup({ options, players, seed }) {
    const tokens = options.tokens ?? 4;
    const track = options.track ?? 28;
    const n = Math.max(2, players.length);
    return {
      options: { tokens, track },
      players: n,
      tokens,
      track,
      pos: Array.from({ length: n }, () => Array(tokens).fill(-1)),
      dice: 0,
      turn: 0,
      over: false,
      winner: null,
      rng: new Rng(seed ?? 19).state,
    };
  },
  activeSeats: (s) => (s.over ? [] : [s.turn]),
  validate(s, seat, a) {
    if (s.over) return a.type === 'ready' ? null : '本局已结束';
    if (a.type === 'ready') return null;
    if (seat !== s.turn) return '还没轮到你';
    if (a.type === 'pick' && s.dice === 0) return '先掷骰';
    if (a.type === 'roll' && s.dice > 0) return '先走完这步再掷';
    if (a.type === 'pick' && (a.token < 0 || a.token >= s.tokens)) return '没有这枚棋子';
    return null;
  },
  apply(s0, seat, a) {
    if (a.type === 'ready') {
      return { ...clone(s0), pos: s0.pos.map((r) => r.map(() => -1)), dice: 0, turn: 0, over: false, winner: null, rng: s0.rng + 31 };
    }
    const s = clone(s0);
    if (a.type === 'roll') {
      const rng = new Rng(s.rng + 3);
      s.dice = rng.int(6) + 1;
      s.rng = rng.state;
      return s;
    }
    const t = a.token;
    if (t < 0 || t >= s.tokens) return s;
    const cur = s.pos[seat][t];
    let next = cur + s.dice;
    if (cur === -1) next = s.dice - 1; // 从机场起步，掷几点走几格
    if (next >= s.track) next = s.track;
    s.pos[seat][t] = next;
    // 撞子：对方同格回机场
    for (let p = 0; p < s.players; p++) {
      if (p === seat) continue;
      s.pos[p] = s.pos[p].map((v) => (v === next && next < s.track ? -1 : v));
    }
    s.dice = 0;
    if (s.pos[seat].every((v) => v >= s.track)) {
      s.over = true;
      s.winner = seat;
      return s;
    }
    s.turn = (seat + 1) % s.players;
    return s;
  },
  view(s, seat) {
    return { seat, players: s.players, tokens: s.tokens, track: s.track, pos: s.pos, dice: s.dice, turn: s.turn, over: s.over, winner: s.winner };
  },
  isOver: (s) => s.over,
  bot(view, seat) {
    if (view.dice > 0) {
      const mine = view.pos[seat] ?? [];
      let best = 0;
      mine.forEach((p, i) => {
        const q = mine[best] ?? -1;
        if (p >= 0 && p < view.track && (q < 0 || p > q)) best = i;
      });
      return { type: 'pick', token: best };
    }
    return { type: 'roll' };
  },
};
