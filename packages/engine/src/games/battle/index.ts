import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';

/** 海战棋：10×10 各自布 5 艘舰，轮流报坐标，先打光对方舰队者胜。 */
export interface BtOptions {
  size: number;
}
export type BtAction = { type: 'fire'; index: number } | { type: 'ready' };
export interface BtState {
  options: BtOptions;
  size: number;
  ships: number[][];
  shots: number[][];
  turn: Seat;
  over: boolean;
  winner: Seat | null;
  rng: number;
}
export interface BtView {
  seat: Seat | null;
  size: number;
  mine: number[];
  mineShots: number[];
  foeShots: number[];
  turn: Seat;
  over: boolean;
  winner: Seat | null;
  myLeft: number;
  foeLeft: number;
}

const FLEET = [4, 3, 3, 2, 2];

function place(seed: number, size: number, seats: number): { ships: number[][]; rng: number } {
  const rng = new Rng(seed);
  const ships: number[][] = [];
  for (let p = 0; p < seats; p++) {
    const grid = Array(size * size).fill(0);
    for (const len of FLEET) {
      for (let tries = 0; tries < 200; tries++) {
        const horiz = rng.int(2) === 0;
        const x = rng.int(size - (horiz ? len - 1 : 0));
        const y = rng.int(size - (horiz ? 0 : len - 1));
        const cells: number[] = [];
        let ok = true;
        for (let k = 0; k < len; k++) {
          const cx = x + (horiz ? k : 0);
          const cy = y + (horiz ? 0 : k);
          const at = cy * size + cx;
          if (grid[at] !== 0) {
            ok = false;
            break;
          }
          cells.push(at);
        }
        if (!ok) continue;
        cells.forEach((c) => (grid[c] = 1));
        break;
      }
    }
    ships.push(grid);
  }
  return { ships, rng: rng.state };
}

export const battle: GameDefinition<BtState, BtAction, BtView, BtOptions> = {
  meta: {
    id: 'battle',
    category: 'board',
    name: '海战棋',
    nameEn: 'Battleship',
    tagline: '猜坐标，打光对方舰队',
    minPlayers: 2,
    maxPlayers: 2,
    defaultPlayers: 2,
    rules: ['双方各自布 5 艘舰（4/3/3/2/2），彼此看不见。', '轮流点对方棋盘一格报坐标，命中或未命中都会标记。', '先打光对方所有舰格者胜。'],
  },
  defaultOptions: { size: 10 },
  optionFields: [],
  setup({ options, players, seed }) {
    const size = options.size ?? 10;
    const { ships, rng } = place(seed ?? 13, size, Math.max(2, players.length));
    return {
      options: { size },
      size,
      ships,
      shots: Array.from({ length: Math.max(2, players.length) }, () => Array(size * size).fill(0)),
      turn: 0,
      over: false,
      winner: null,
      rng,
    };
  },
  activeSeats: (s) => (s.over ? [] : [s.turn]),
  validate(s, seat, a) {
    if (s.over) return a.type === 'ready' ? null : '本局已结束';
    if (a.type === 'ready') return null;
    if (seat !== s.turn) return '还没轮到你';
    if (a.index < 0 || a.index >= s.size * s.size) return '坐标不合法';
    if (s.shots[seat][a.index] !== 0) return '这格已经打过';
    return null;
  },
  apply(s0, seat, a) {
    if (a.type === 'ready') {
      const fresh = place(s0.rng + 29, s0.size, s0.ships.length);
      return { ...clone(s0), ships: fresh.ships, shots: s0.shots.map((r) => r.map(() => 0)), turn: 0, over: false, winner: null, rng: fresh.rng };
    }
    const s = clone(s0);
    const foe = (seat + 1) % 2;
    const hit = s.ships[foe][a.index] === 1;
    s.shots[seat][a.index] = hit ? 2 : 1;
    const left = s.ships[foe].filter((v, i) => v === 1 && s.shots[seat][i] !== 2).length;
    if (left === 0) {
      s.over = true;
      s.winner = seat;
    } else {
      s.turn = foe;
    }
    return s;
  },
  view(s, seat) {
    const foe = seat === null ? 1 : (seat + 1) % 2;
    const mine = seat === null ? s.ships[0] : s.ships[seat];
    const mineShots = seat === null ? s.shots[0] : s.shots[seat];
    const foeShots = seat === null ? s.shots[1] : s.shots[foe];
    return {
      seat,
      size: s.size,
      mine,
      mineShots,
      foeShots,
      turn: s.turn,
      over: s.over,
      winner: s.winner,
      myLeft: mine.filter((v, i) => v === 1 && foeShots[i] !== 2).length,
      foeLeft: (seat === null ? s.ships[1] : s.ships[foe]).filter((v, i) => v === 1 && (seat === null ? s.shots[0] : s.shots[seat])[i] !== 2).length,
    };
  },
  isOver: (s) => s.over,
  bot(view) {
    const free = view.foeShots.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
    return { type: 'fire', index: free[0] ?? 0 };
  },
};
