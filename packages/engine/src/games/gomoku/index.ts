import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';

/**
 * 五子棋：15×15，黑先，先连成五子（横/竖/斜）者胜。
 * 规则电脑用「双向威胁 + 堵四」的简单评估，够家庭局用。
 */

export interface GmOptions {
  size: number;
}

export type GmAction = { type: 'place'; x: number; y: number } | { type: 'ready' };

export interface GmState {
  options: GmOptions;
  size: number;
  board: (Seat | null)[];
  turn: Seat;
  last: { x: number; y: number; seat: Seat } | null;
  winner: Seat | null;
  line: number[];
  over: boolean;
  round: number;
  scores: number[];
  ready: boolean[];
  moves: number;
}

export interface GmView {
  seat: Seat | null;
  size: number;
  board: (Seat | null)[];
  turn: Seat | null;
  last: { x: number; y: number; seat: Seat } | null;
  winner: Seat | null;
  line: number[];
  over: boolean;
  round: number;
  scores: number[];
  ready: boolean[];
  moves: number;
}

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

function lineAt(board: (Seat | null)[], size: number, x: number, y: number): number[] {
  const who = board[y * size + x];
  if (who === null) return [];
  for (const [dx, dy] of DIRS) {
    const cells = [y * size + x];
    for (const sign of [1, -1]) {
      let nx = x + dx * sign;
      let ny = y + dy * sign;
      while (nx >= 0 && ny >= 0 && nx < size && ny < size && board[ny * size + nx] === who) {
        cells.push(ny * size + nx);
        nx += dx * sign;
        ny += dy * sign;
      }
    }
    if (cells.length >= 5) return cells.sort((a, b) => a - b);
  }
  return [];
}

const empty = (board: (Seat | null)[], size: number) =>
  board.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);

/** 某点对某方的「连子潜力」：四个方向各数一遍，取前三名之和 */
function potential(board: (Seat | null)[], size: number, idx: number, who: Seat): number {
  const x = idx % size;
  const y = Math.floor(idx / size);
  let score = 0;
  for (const [dx, dy] of DIRS) {
    let count = 1;
    let open = 0;
    for (const sign of [1, -1]) {
      let nx = x + dx * sign;
      let ny = y + dy * sign;
      while (nx >= 0 && ny >= 0 && nx < size && ny < size && board[ny * size + nx] === who) {
        count++;
        nx += dx * sign;
        ny += dy * sign;
      }
      if (nx >= 0 && ny >= 0 && nx < size && ny < size && board[ny * size + nx] === null) open++;
    }
    if (count >= 5) score += 100000;
    else score += Math.pow(10, count) + open * 5;
  }
  return score;
}

export const gomoku: GameDefinition<GmState, GmAction, GmView, GmOptions> = {
  meta: {
    id: 'gomoku',
    category: 'chess',
    name: '五子棋',
    nameEn: 'Gomoku',
    tagline: '横竖斜连成五子，先手是黑',
    minPlayers: 2,
    maxPlayers: 2,
    defaultPlayers: 2,
    rules: [
      '黑棋先行，双方轮流在交叉点落子。',
      '横、竖、斜任意方向先连成五子（或多于五子）者获胜。',
      '棋盘下满仍无五连则判和。',
      '点击棋盘空点落子，落子后不能移动或撤回。',
    ],
  },
  defaultOptions: { size: 15 },
  optionFields: [],
  setup({ options, players }) {
    const size = options.size ?? 15;
    return {
      options: { size },
      size,
      board: Array(size * size).fill(null),
      turn: 0,
      last: null,
      winner: null,
      line: [],
      over: false,
      round: 1,
      scores: players.map(() => 0),
      ready: players.map(() => false),
      moves: 0,
    };
  },
  activeSeats: (s) => (s.over ? [] : [s.turn]),
  validate(s, seat, a) {
    if (s.over) return a.type === 'ready' ? null : '本局已结束';
    if (a.type === 'ready') return null;
    if (seat !== s.turn) return '还没轮到你';
    if (a.x < 0 || a.y < 0 || a.x >= s.size || a.y >= s.size) return '这个点不在棋盘上';
    if (s.board[a.y * s.size + a.x] !== null) return '这里已经有子了';
    return null;
  },
  apply(s0, seat, a) {
    const s = clone(s0);
    if (a.type === 'ready') {
      s.ready[seat] = true;
      if (s.ready.every(Boolean)) {
        s.board = Array(s.size * s.size).fill(null);
        s.turn = s.round % 2 === 0 ? 1 : 0;
        s.round++;
        s.over = false;
        s.winner = null;
        s.line = [];
        s.last = null;
        s.moves = 0;
        s.ready = s.ready.map(() => false);
      }
      return s;
    }
    const idx = a.y * s.size + a.x;
    s.board[idx] = seat;
    s.last = { x: a.x, y: a.y, seat };
    s.moves++;
    const line = lineAt(s.board, s.size, a.x, a.y);
    if (line.length >= 5) {
      s.winner = seat;
      s.line = line;
      s.over = true;
      s.scores[seat] += 1;
      return s;
    }
    if (s.moves >= s.size * s.size) {
      s.over = true;
      s.winner = null;
      return s;
    }
    s.turn = s.turn === 0 ? 1 : 0;
    return s;
  },
  view(s, seat) {
    return {
      seat,
      size: s.size,
      board: s.board,
      turn: s.over ? null : s.turn,
      last: s.last,
      winner: s.winner,
      line: s.line,
      over: s.over,
      round: s.round,
      scores: s.scores,
      ready: s.ready,
      moves: s.moves,
    };
  },
  isOver: (s) => s.over,
  bot(view, seat) {
    const { board, size } = view;
    const spots = empty(board, size);
    if (!spots.length) return { type: 'place', x: 0, y: 0 };
    const me = seat;
    const rival: Seat = seat === 0 ? 1 : 0;
    // 1) 自己能成五 → 直接下；2) 对手要成五 → 堵
    for (const i of spots) if (potential(board, size, i, me) >= 100000) {
      return { type: 'place', x: i % size, y: Math.floor(i / size) };
    }
    for (const i of spots) if (potential(board, size, i, rival) >= 100000) {
      return { type: 'place', x: i % size, y: Math.floor(i / size) };
    }
    let best = spots[0];
    let bestScore = -1;
    for (const i of spots) {
      const mine = potential(board, size, i, me);
      const theirs = potential(board, size, i, rival);
      // 靠近中心更优先，避免开局贴边
      const cx = i % size;
      const cy = Math.floor(i / size);
      const center = size / 2;
      const bias = -(Math.abs(cx - center) + Math.abs(cy - center));
      const score = mine * 1.1 + theirs + bias;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return { type: 'place', x: best % size, y: Math.floor(best / size) };
  },
};
