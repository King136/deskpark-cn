import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';

/** 吹牛骰：每人 5 颗骰子，只看得见自己的；轮流喊「几个几点」，可以开盅。 */
export interface LiOptions {
  dice: number;
}
export interface LiBid {
  count: number;
  face: number;
  seat: Seat;
}
export type LiAction =
  | { type: 'bid'; count: number; face: number }
  | { type: 'challenge' }
  | { type: 'ready' };
export interface LiState {
  options: LiOptions;
  dice: number;
  hands: number[][];
  bid: LiBid | null;
  turn: Seat;
  over: boolean;
  winner: Seat | null;
  reason: string;
  rng: number;
}
export interface LiView {
  seat: Seat | null;
  dice: number;
  mine: number[];
  total: number;
  bid: LiBid | null;
  turn: Seat;
  over: boolean;
  winner: Seat | null;
  reason: string;
  hands: number[][] | null;
}

function roll(seed: number, seats: number, per: number): { hands: number[][]; rng: number } {
  const rng = new Rng(seed);
  const hands = Array.from({ length: seats }, () => Array.from({ length: per }, () => rng.int(6) + 1));
  return { hands, rng: rng.state };
}

export const liar: GameDefinition<LiState, LiAction, LiView, LiOptions> = {
  meta: {
    id: 'liar',
    category: 'casual',
    name: '吹牛骰',
    nameEn: 'Liar Dice',
    tagline: '喊数吹牛，敢不敢开盅',
    minPlayers: 2,
    maxPlayers: 4,
    defaultPlayers: 2,
    rules: [
      '每人 5 颗骰子，只看得到自己的点数。',
      '轮流喊「全场有几个几点」，后喊必须比前一个大（数量更多，或数量相同点数更大）。',
      '喊「开」则全体亮骰：全场该点数够数，则开盅者输；不够，则喊的人输。',
    ],
  },
  defaultOptions: { dice: 5 },
  optionFields: [],
  setup({ options, players, seed }) {
    const per = options.dice ?? 5;
    const { hands, rng } = roll(seed ?? 5, players.length, per);
    return {
      options: { dice: per },
      dice: per,
      hands,
      bid: null,
      turn: 0,
      over: false,
      winner: null,
      reason: '',
      rng,
    };
  },
  activeSeats: (s) => (s.over ? [] : [s.turn]),
  validate(s, seat, a) {
    if (s.over) return a.type === 'ready' ? null : '本局已结束';
    if (seat !== s.turn) return '还没轮到你';
    if (a.type === 'bid') {
      if (a.count < 1 || a.face < 1 || a.face > 6) return '喊数不合法';
      if (s.bid) {
        if (a.count < s.bid.count) return '数量不能比上一手少';
        if (a.count === s.bid.count && a.face <= s.bid.face) return '同数量要点数更大';
      }
      return null;
    }
    if (a.type === 'challenge' && !s.bid) return '还没人喊，不能开';
    return null;
  },
  apply(s0, seat, a) {
    if (a.type === 'ready') {
      const { hands, rng } = roll(s0.rng + 23, s0.hands.length, s0.dice);
      return { ...clone(s0), hands, bid: null, turn: 0, over: false, winner: null, reason: '', rng };
    }
    const s = clone(s0);
    if (a.type === 'bid') {
      s.bid = { count: a.count, face: a.face, seat };
      s.turn = (seat + 1) % s.hands.length;
      return s;
    }
    const bid = s.bid!;
    const real = s.hands.reduce((sum, hand) => sum + hand.filter((d) => d === bid.face).length, 0);
    const bidderLoses = real >= bid.count;
    s.over = true;
    s.winner = bidderLoses ? ((bid.seat + 1) % s.hands.length) : seat;
    s.reason = `喊 ${bid.count} 个 ${bid.face}，全桌实际 ${real} 个 → ${bidderLoses ? '喊的人输' : '开盅的人输'}`;
    return s;
  },
  view(s, seat) {
    return {
      seat,
      dice: s.dice,
      mine: seat === null ? [] : s.hands[seat] ?? [],
      total: s.hands.length * s.dice,
      bid: s.bid,
      turn: s.turn,
      over: s.over,
      winner: s.winner,
      reason: s.reason,
      hands: s.over ? s.hands : null,
    };
  },
  isOver: (s) => s.over,
  bot(view) {
    const base = view.bid ? view.bid.count : 0;
    const face = view.bid ? Math.min(6, view.bid.face + 1) : 1;
    if (!view.bid || base + 1 <= view.total) return { type: 'bid', count: base + 1, face: base >= 6 ? 1 : face };
    return { type: 'challenge' };
  },
};
