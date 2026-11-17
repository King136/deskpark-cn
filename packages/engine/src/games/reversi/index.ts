import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';

/** 黑白棋（Othello）：8×8，夹住对方棋子即翻转，终局子多者胜。 */

export interface RvOptions {
  size: number;
}
export type RvAction = { type: 'place'; x: number; y: number } | { type: 'ready' };
export interface RvState {
  options: RvOptions;
  size: number;
  board: (Seat | null)[];
  turn: Seat;
  last: { x: number; y: number; seat: Seat; flipped: number[] } | null;
  over: boolean;
  scores: number[];
  ready: boolean[];
  round: number;
  passStreak: number;
}
export interface RvView {
  seat: Seat | null;
  size: number;
  board: (Seat | null)[];
  turn: Seat | null;
  last: RvState['last'];
  legal: number[];
  over: boolean;
  scores: number[];
  ready: boolean[];
  round: number;
}

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function flipsAt(board: (Seat | null)[], size: number, idx: number, who: Seat): number[] {
  if (board[idx] !== null) return [];
  const x = idx % size;
  const y = Math.floor(idx / size);
  const all: number[] = [];
  for (const [dx, dy] of DIRS) {
    const run: number[] = [];
    let nx = x + dx;
    let ny = y + dy;
    while (nx >= 0 && ny >= 0 && nx < size && ny < size) {
      const v = board[ny * size + nx];
      if (v === null) break;
      if (v === who) {
        all.push(...run);
        break;
      }
      run.push(ny * size + nx);
      nx += dx;
      ny += dy;
    }
  }
  return all;
}

const legalOf = (board: (Seat | null)[], size: number, who: Seat) =>
  board.map((c, i) => (c === null && flipsAt(board, size, i, who).length > 0 ? i : -1)).filter((i) => i >= 0);

export const reversi: GameDefinition<RvState, RvAction, RvView, RvOptions> = {
  meta: {
    id: 'reversi',
    category: 'chess',
    name: '黑白棋',
    nameEn: 'Reversi',
    tagline: '夹住就翻转，最后子多者胜',
    minPlayers: 2,
    maxPlayers: 2,
    defaultPlayers: 2,
    rules: [
      '黑棋先行。落子后，横竖斜任意方向被对方两子夹住的棋子全部翻成自己颜色。',
      '没有任何可落子的位置时自动停一手（pass），双方都无子可下则终局。',
      '终局按盘面上棋子数量计分，多者获胜；平局为和棋。',
    ],
  },
  defaultOptions: { size: 8 },
  optionFields: [],
  setup({ options, players }) {
    const size = options.size ?? 8;
    const board: (Seat | null)[] = Array(size * size).fill(null);
    const mid = size / 2;
    board[(mid - 1) * size + (mid - 1)] = 0;
    board[mid * size + mid] = 0;
    board[(mid - 1) * size + mid] = 1;
    board[mid * size + (mid - 1)] = 1;
    return {
      options: { size },
      size,
      board,
      turn: 0,
      last: null,
      over: false,
      scores: players.map(() => 0),
      ready: players.map(() => false),
      round: 1,
      passStreak: 0,
    };
  },
  activeSeats: (s) => (s.over ? [] : [s.turn]),
  validate(s, seat, a) {
    if (s.over) return a.type === 'ready' ? null : '本局已结束';
    if (a.type === 'ready') return null;
    if (seat !== s.turn) return '还没轮到你';
    if (flipsAt(s.board, s.size, a.y * s.size + a.x, seat).length === 0) return '这里下不了，得夹住对方的子';
    return null;
  },
  apply(s0, seat, a) {
    const s = clone(s0);
    if (a.type === 'ready') {
      s.ready[seat] = true;
      if (s.ready.every(Boolean)) {
        const size = s.size;
        const mid = size / 2;
        const board: (Seat | null)[] = Array(size * size).fill(null);
        board[(mid - 1) * size + (mid - 1)] = 0;
        board[mid * size + mid] = 0;
        board[(mid - 1) * size + mid] = 1;
        board[mid * size + (mid - 1)] = 1;
        s.board = board;
        s.turn = s.round % 2 === 0 ? 1 : 0;
        s.round += 1;
        s.over = false;
        s.last = null;
        s.passStreak = 0;
        s.ready = s.ready.map(() => false);
      }
      return s;
    }
    const idx = a.y * s.size + a.x;
    const flipped = flipsAt(s.board, s.size, idx, seat);
    s.board[idx] = seat;
    for (const i of flipped) s.board[i] = seat;
    s.last = { x: a.x, y: a.y, seat, flipped };
    s.passStreak = 0;

    const rival: Seat = seat === 0 ? 1 : 0;
    if (legalOf(s.board, s.size, rival).length > 0) {
      s.turn = rival;
    } else if (legalOf(s.board, s.size, seat).length > 0) {
      s.turn = seat;
      s.passStreak = 1;
    } else {
      const count = (who: Seat) => s.board.filter((c) => c === who).length;
      const a0 = count(0);
      const b0 = count(1);
      s.over = true;
      if (a0 > b0) s.scores[0] += 1;
      else if (b0 > a0) s.scores[1] += 1;
    }
    return s;
  },
  view(s, seat) {
    return {
      seat,
      size: s.size,
      board: s.board,
      turn: s.over ? null : s.turn,
      last: s.last,
      legal: seat !== null ? legalOf(s.board, s.size, seat) : [],
      over: s.over,
      scores: s.scores,
      ready: s.ready,
      round: s.round,
    };
  },
  isOver: (s) => s.over,
  bot(view, seat, _rng: Rng) {
    const { board, size } = view;
    const legal = legalOf(board, size, seat);
    if (!legal.length) return { type: 'ready' };
    const corner = (i: number) => {
      const x = i % size;
      const y = Math.floor(i / size);
      const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      const nearCorner = (x <= 1 || x >= size - 2) && (y <= 1 || y >= size - 2);
      return edge ? 40 : nearCorner ? -30 : 0;
    };
    let best = legal[0];
    let bestScore = -Infinity;
    for (const i of legal) {
      const flipped = flipsAt(board, size, i, seat).length;
      const score = flipped * 2 + corner(i);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return { type: 'place', x: best % size, y: Math.floor(best / size) };
  },
};
