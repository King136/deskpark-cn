import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';

/** 2048：单人益智，滑动合并同数字，凑出 2048 即通关。 */

export interface G2Options {
  size: number;
}
export type G2Action = { type: 'move'; dir: 'up' | 'down' | 'left' | 'right' } | { type: 'ready' };
export interface G2State {
  options: G2Options;
  size: number;
  board: number[];
  score: number;
  best: number;
  over: boolean;
  won: boolean;
  moves: number;
  rng: number;
}
export interface G2View {
  seat: Seat | null;
  size: number;
  board: number[];
  score: number;
  best: number;
  over: boolean;
  won: boolean;
  moves: number;
}

const spawn = (board: number[], size: number, rng: Rng) => {
  const empty = board.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
  if (!empty.length) return;
  const idx = empty[rng.int(empty.length)];
  board[idx] = rng.int(10) < 9 ? 2 : 4;
};

function slide(line: number[]): { line: number[]; gained: number } {
  const nums = line.filter((v) => v !== 0);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] === nums[i + 1]) {
      const v = nums[i] * 2;
      out.push(v);
      gained += v;
      i++;
    } else out.push(nums[i]);
  }
  while (out.length < line.length) out.push(0);
  return { line: out, gained };
}

export const g2048: GameDefinition<G2State, G2Action, G2View, G2Options> = {
  meta: {
    id: 'g2048',
    category: 'casual',
    name: '2048',
    nameEn: '2048',
    tagline: '滑动合并，凑出 2048',
    minPlayers: 1,
    maxPlayers: 1,
    defaultPlayers: 1,
    rules: [
      '每次滑动，所有方块朝该方向移动，数字相同的两块合并成两倍并计分。',
      '每次有效滑动后，空格随机出现一个 2 或 4。',
      '拼出 2048 即通关，盘面无法再移动则结束。',
      '四个方向按钮或键盘方向键操作。',
    ],
  },
  defaultOptions: { size: 4 },
  optionFields: [],
  setup({ options, seed }) {
    const size = options.size ?? 4;
    const board = Array(size * size).fill(0);
    const rng = new Rng(seed ?? 1);
    spawn(board, size, rng);
    spawn(board, size, rng);
    return { options: { size }, size, board, score: 0, best: 0, over: false, won: false, moves: 0, rng: rng.state };
  },
  activeSeats: (s) => (s.over ? [] : [0]),
  validate(s, _seat, a) {
    if (s.over) return a.type === 'ready' ? null : '本局已结束';
    return null;
  },
  apply(s0, _seat, a) {
    const s = clone(s0);
    if (a.type === 'ready') {
      const rng = new Rng(s.rng + 7);
      s.board = Array(s.size * s.size).fill(0);
      spawn(s.board, s.size, rng);
      spawn(s.board, s.size, rng);
      s.score = 0;
      s.over = false;
      s.won = false;
      s.moves = 0;
      s.rng = rng.state;
      return s;
    }
    const rng = new Rng(s.rng + 3);
    const n = s.size;
    let gained = 0;
    let moved = false;
    const idxs = (i: number, j: number) => {
      switch (a.dir) {
        case 'left': return i * n + j;
        case 'right': return i * n + (n - 1 - j);
        case 'up': return j * n + i;
        default: return (n - 1 - j) * n + i;
      }
    };
    for (let i = 0; i < n; i++) {
      const cells = Array.from({ length: n }, (_, j) => s.board[idxs(i, j)]);
      const res = slide(cells);
      gained += res.gained;
      res.line.forEach((v, j) => {
        const at = idxs(i, j);
        if (s.board[at] !== v) moved = true;
        s.board[at] = v;
      });
    }
    if (moved) {
      s.moves++;
      s.score += gained;
      s.best = Math.max(s.best, s.score);
      spawn(s.board, n, rng);
      s.rng = rng.state;
      if (s.board.includes(2048)) s.won = true;
      const canMove = [0, 1, 2, 3].some((d) => {
        const dir = (['left', 'right', 'up', 'down'] as const)[d];
        for (let i = 0; i < n; i++) {
          const cells = Array.from({ length: n }, (_, j) =>
            dir === 'left' ? s.board[i * n + j]
              : dir === 'right' ? s.board[i * n + (n - 1 - j)]
              : dir === 'up' ? s.board[j * n + i]
              : s.board[(n - 1 - j) * n + i],
          );
          const res = slide(cells);
          if (res.gained > 0 || cells.some((v, j) => v !== res.line[j])) return true;
        }
        return false;
      });
      if (!canMove) s.over = true;
    }
    return s;
  },
  view(s, seat) {
    return {
      seat,
      size: s.size,
      board: s.board,
      score: s.score,
      best: s.best,
      over: s.over,
      won: s.won,
      moves: s.moves,
    };
  },
  isOver: (s) => s.over,
  bot(view) {
    const dirs = ['left', 'down', 'right', 'up'] as const;
    return { type: 'move', dir: dirs[(view.moves + 1) % 4] };
  },
};
