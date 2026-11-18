import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';

/** 纸牌接龙（Klondike）：七列牌堆、翻牌堆、四叠按花色从 A 收齐。 */
export interface KlOptions {
  draw: number;
}
export type KlAction =
  | { type: 'draw' }
  | { type: 'move'; from: 'tableau' | 'waste'; pile: number; to: 'tableau' | 'foundation'; target: number }
  | { type: 'ready' };
export interface KlState {
  options: KlOptions;
  draw: number;
  tableau: number[][];
  stock: number[];
  waste: number[];
  foundations: number[][];
  moves: number;
  over: boolean;
  win: boolean;
  rng: number;
}
export interface KlView {
  seat: Seat | null;
  tableau: number[][];
  stock: number;
  waste: number[];
  foundations: number[][];
  moves: number;
  over: boolean;
  win: boolean;
}

const rank = (c: number) => (c % 13) + 1;
const suit = (c: number) => Math.floor(c / 13);
const isRed = (c: number) => suit(c) === 1 || suit(c) === 3;
const canStack = (card: number, onto: number | undefined) =>
  onto === undefined ? rank(card) === 13 : rank(card) === rank(onto) - 1 && isRed(card) !== isRed(onto);

function deal(seed: number, draw: number): KlState {
  const rng = new Rng(seed);
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const tableau: number[][] = Array.from({ length: 7 }, () => []);
  let p = 0;
  for (let col = 0; col < 7; col++)
    for (let row = 0; row <= col; row++) tableau[col].push(deck[p++]);
  return {
    options: { draw },
    draw,
    tableau,
    stock: deck.slice(p),
    waste: [],
    foundations: [[], [], [], []],
    moves: 0,
    over: false,
    win: false,
    rng: rng.state,
  };
}

function check(s: KlState): KlState {
  if (s.foundations.every((f) => f.length === 13)) {
    s.over = true;
    s.win = true;
  }
  return s;
}

export const klondike: GameDefinition<KlState, KlAction, KlView, KlOptions> = {
  meta: {
    id: 'klondike',
    category: 'casual',
    name: '纸牌接龙',
    nameEn: 'Klondike',
    tagline: '红黑相间，从 A 收齐四叠',
    minPlayers: 1,
    maxPlayers: 1,
    defaultPlayers: 1,
    rules: [
      '七列牌堆，列内按红黑相间、点数递减排列，空列只放 K。',
      '点翻牌堆取牌，取完可把翻牌倒回重翻。',
      '四叠按花色从 A 到 K 依次收牌，收齐 52 张即通关。',
      '这里一次挪动一张（列顶那张）。',
    ],
  },
  defaultOptions: { draw: 1 },
  optionFields: [],
  setup({ options, seed }) {
    return deal(seed ?? 41, options.draw ?? 1);
  },
  activeSeats: (s) => (s.over ? [] : [0]),
  validate(s, _seat, a) {
    if (s.over) return a.type === 'ready' ? null : '本局已结束';
    if (a.type !== 'move') return null;
    const card =
      a.from === 'waste' ? s.waste[s.waste.length - 1] : s.tableau[a.pile]?.[s.tableau[a.pile].length - 1];
    if (card === undefined) return '这张牌不能移动';
    if (a.to === 'foundation') {
      const f = s.foundations[a.target];
      if (!f || suit(card) !== a.target || rank(card) !== f.length + 1) return '收牌叠只接同花色下一张';
      return null;
    }
    const col = s.tableau[a.target];
    if (!col) return '目标列不存在';
    if (!canStack(card, col[col.length - 1])) return '只能压在红黑相间、点数大一的牌上，空列只接 K';
    return null;
  },
  apply(s0, _seat, a) {
    if (a.type === 'ready') return deal(s0.rng + 43, s0.draw);
    const s = clone(s0);
    if (a.type === 'draw') {
      if (!s.stock.length) {
        if (!s.waste.length) return s;
        s.stock = s.waste.slice().reverse();
        s.waste = [];
        s.moves++;
        return s;
      }
      const n = Math.min(s.draw, s.stock.length);
      const picked = s.stock.splice(0, n);
      s.waste.push(...picked);
      s.moves++;
      return s;
    }
    const card =
      a.from === 'waste' ? s.waste[s.waste.length - 1] : s.tableau[a.pile]?.[s.tableau[a.pile].length - 1];
    if (card === undefined) return s;
    if (a.to === 'foundation') {
      const f = s.foundations[a.target];
      if (!f || suit(card) !== a.target) return s;
      if (rank(card) !== f.length + 1) return s;
      f.push(card);
    } else {
      const col = s.tableau[a.target];
      if (!col || a.target === (a.from === 'tableau' ? a.pile : -1)) return s;
      if (!canStack(card, col[col.length - 1])) return s;
      col.push(card);
    }
    if (a.from === 'waste') s.waste.pop();
    else s.tableau[a.pile].pop();
    s.moves++;
    return check(s);
  },
  view(s, seat) {
    return {
      seat,
      tableau: s.tableau,
      stock: s.stock.length,
      waste: s.waste,
      foundations: s.foundations,
      moves: s.moves,
      over: s.over,
      win: s.win,
    };
  },
  isOver: (s) => s.over,
  bot() {
    return { type: 'draw' };
  },
};
