import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';

/** 跳棋（西洋跳棋）：斜走一步或跳过对方棋子吃子，到底线升王。 */
export interface CkOptions {
  size: number;
}
export type CkAction = { type: 'move'; from: number; to: number } | { type: 'ready' };
export interface CkState {
  options: CkOptions;
  size: number;
  board: number[];
  turn: Seat;
  over: boolean;
  winner: Seat | null;
  black: number;
  red: number;
  rng: number;
}
export interface CkView {
  seat: Seat | null;
  size: number;
  board: number[];
  turn: Seat;
  over: boolean;
  winner: Seat | null;
  mine: number;
  foe: number;
}

const red = (v: number) => v === 1 || v === 3;
const black = (v: number) => v === 2 || v === 4;

function start(size: number): number[] {
  const b = Array(size * size).fill(0);
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < size; x++) if ((x + y) % 2 === 1) b[y * size + x] = 2;
  for (let y = size - 3; y < size; y++)
    for (let x = 0; x < size; x++) if ((x + y) % 2 === 1) b[y * size + x] = 1;
  return b;
}

const count = (b: number[], who: 'r' | 'b') => b.filter((v) => (who === 'r' ? red(v) : black(v))).length;

/** 某方某格的合法落点 */
export function movesFrom(board: number[], size: number, from: number, seat: Seat): { to: number; jump: number | null }[] {
  const x = from % size;
  const y = Math.floor(from / size);
  const v = board[from];
  if (v === 0) return [];
  const mine = seat === 0 ? red(v) : black(v);
  if (!mine) return [];
  const king = v === 3 || v === 4;
  const dirs = king
    ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
    : seat === 0
      ? [[1, -1], [-1, -1]]
      : [[1, 1], [-1, 1]];
  const out: { to: number; jump: number | null }[] = [];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
    const at = ny * size + nx;
    if (board[at] === 0) out.push({ to: at, jump: null });
    else {
      const mineThere = seat === 0 ? red(board[at]) : black(board[at]);
      if (mineThere) continue;
      const jx = x + dx * 2;
      const jy = y + dy * 2;
      if (jx < 0 || jx >= size || jy < 0 || jy >= size) continue;
      const land = jy * size + jx;
      if (board[land] === 0) out.push({ to: land, jump: at });
    }
  }
  return out;
}

export const checkers: GameDefinition<CkState, CkAction, CkView, CkOptions> = {
  meta: {
    id: 'checkers',
    category: 'chess',
    name: '跳棋',
    nameEn: 'Checkers',
    tagline: '斜走一步或跳过吃子',
    minPlayers: 2,
    maxPlayers: 2,
    defaultPlayers: 2,
    rules: [
      '棋子沿深色斜格前进，普通子只能往自己方向走。',
      '斜前方是对方棋子、再下一格为空时可以跳过并吃掉它。',
      '走到对方底线即升王，王可四向斜走。',
      '吃光对方棋子即获胜。',
    ],
  },
  defaultOptions: { size: 8 },
  optionFields: [],
  setup({ options, seed }) {
    const size = options.size ?? 8;
    const board = start(size);
    return { options: { size }, size, board, turn: 0, over: false, winner: null, black: count(board, 'b'), red: count(board, 'r'), rng: new Rng(seed ?? 17).state };
  },
  activeSeats: (s) => (s.over ? [] : [s.turn]),
  validate(s, seat, a) {
    if (s.over) return a.type === 'ready' ? null : '本局已结束';
    if (a.type === 'ready') return null;
    if (seat !== s.turn) return '还没轮到你';
    const legal = movesFrom(s.board, s.size, a.from, seat);
    return legal.some((m) => m.to === a.to) ? null : '这一步走不了';
  },
  apply(s0, seat, a) {
    if (a.type === 'ready') {
      const b = start(s0.size);
      return { ...clone(s0), board: b, turn: 0, over: false, winner: null, black: count(b, 'b'), red: count(b, 'r') };
    }
    const s = clone(s0);
    const legal = movesFrom(s.board, s.size, a.from, seat).find((m) => m.to === a.to)!;
    if (legal.jump !== null) s.board[legal.jump] = 0;
    s.board[a.to] = s.board[a.from];
    s.board[a.from] = 0;
    // 升王
    const y = Math.floor(a.to / s.size);
    if (s.board[a.to] === 1 && y === 0) s.board[a.to] = 3;
    if (s.board[a.to] === 2 && y === s.size - 1) s.board[a.to] = 4;
    s.black = count(s.board, 'b');
    s.red = count(s.board, 'r');
    if (s.black === 0 || s.red === 0) {
      s.over = true;
      s.winner = s.black === 0 ? 0 : 1;
    } else {
      s.turn = (seat + 1) % 2;
    }
    return s;
  },
  view(s, seat) {
    const mineN = seat === 0 ? s.red : s.black;
    const foeN = seat === 0 ? s.black : s.red;
    return { seat, size: s.size, board: s.board, turn: s.turn, over: s.over, winner: s.winner, mine: mineN, foe: foeN };
  },
  isOver: (s) => s.over,
  bot(view, seat) {
    // 优先吃子，其次随便走一步（seat 是本次该走的座位）
    const legal = (i: number) => movesFrom(view.board, view.size, i, seat);
    for (let i = 0; i < view.board.length; i++) {
      const ms = legal(i);
      const jump = ms.find((m) => m.jump !== null);
      if (jump) return { type: 'move', from: i, to: jump.to };
    }
    for (let i = 0; i < view.board.length; i++) {
      const ms = legal(i);
      if (ms.length) return { type: 'move', from: i, to: ms[0].to };
    }
    return { type: 'move', from: 0, to: 0 };
  },
};
