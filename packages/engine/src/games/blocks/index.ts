import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';

/** 落块（俄罗斯方块）：单人街机，格子下落、消行计分。 */
export interface BkOptions {
  cols: number;
  rows: number;
}
export type BkAction =
  | { type: 'move'; dx: -1 | 1 }
  | { type: 'rotate' }
  | { type: 'drop' }
  | { type: 'tick' }
  | { type: 'ready' };
export interface BkPiece {
  cells: [number, number][];
  x: number;
  y: number;
  kind: number;
}
export interface BkState {
  options: BkOptions;
  cols: number;
  rows: number;
  board: number[];
  cur: BkPiece | null;
  next: number;
  score: number;
  lines: number;
  over: boolean;
  rng: number;
}

const BASE: [number, number][][] = [
  [[0, 0], [1, 0], [2, 0], [3, 0]], // I
  [[0, 0], [1, 0], [0, 1], [1, 1]], // O
  [[1, 0], [0, 1], [1, 1], [2, 1]], // T
  [[1, 0], [2, 0], [0, 1], [1, 1]], // S
  [[0, 0], [1, 0], [1, 1], [2, 1]], // Z
  [[0, 0], [0, 1], [0, 2], [1, 2]], // J
  [[1, 0], [1, 1], [1, 2], [0, 2]], // L
];

function rotateCells(cells: [number, number][]): [number, number][] {
  const maxX = Math.max(...cells.map((c) => c[0])) + 1;
  const maxY = Math.max(...cells.map((c) => c[1])) + 1;
  const n = Math.max(maxX, maxY);
  return cells.map(([x, y]) => [n - 1 - y, x] as [number, number]);
}

const fits = (s: BkState, piece: BkPiece, cells = piece.cells): boolean =>
  cells.every(([cx, cy]) => {
    const x = piece.x + cx;
    const y = piece.y + cy;
    if (x < 0 || x >= s.cols || y < 0 || y >= s.rows) return false;
    return s.board[y * s.cols + x] === 0;
  });

function spawn(s: BkState): BkState {
  const rng = new Rng(s.rng + 5);
  const kind = s.next ?? rng.int(7);
  const piece: BkPiece = { cells: BASE[kind], x: Math.floor((s.cols - 4) / 2), y: 0, kind };
  const st = { ...s, cur: piece, next: rng.int(7), rng: rng.state };
  if (!fits(st, piece)) st.over = true;
  return st;
}

export const blocks: GameDefinition<BkState, BkAction, BkState, BkOptions> = {
  meta: {
    id: 'blocks',
    category: 'casual',
    name: '俄罗斯方块',
    nameEn: 'Tetris',
    tagline: '经典七种方块，消行升级越玩越快',
    minPlayers: 1,
    maxPlayers: 1,
    defaultPlayers: 1,
    rules: [
      '← → 左右移动，↑ 旋转，↓ 软降，空格一键落地；手机可滑动操作。',
      '摆满一行即消除，一次消多行得分更高（100/300/500/800）。',
      '每消 10 行升一级，下落速度随之加快；堆到顶部即结束。',
      '虚线是落点预览，右上角可看下一个方块。',
    ],
  },
  defaultOptions: { cols: 10, rows: 18 },
  optionFields: [],
  setup({ options, seed }) {
    const cols = options.cols ?? 10;
    const rows = options.rows ?? 18;
    const base: BkState = {
      options: { cols, rows },
      cols,
      rows,
      board: Array(cols * rows).fill(0),
      cur: null,
      next: 0,
      score: 0,
      lines: 0,
      over: false,
      rng: new Rng(seed ?? 9).state,
    };
    return spawn(spawn(base));
  },
  activeSeats: (s) => (s.over ? [] : [0]),
  validate(s, _seat, a) {
    if (s.over) return a.type === 'ready' ? null : '本局已结束';
    return null;
  },
  apply(s0, _seat, a) {
    if (a.type === 'ready') {
      const fresh: BkState = {
        ...s0,
        board: Array(s0.cols * s0.rows).fill(0),
        cur: null,
        score: 0,
        lines: 0,
        over: false,
        rng: s0.rng + 17,
      };
      return spawn(spawn(fresh));
    }
    const s = clone(s0);
    const p = s.cur;
    if (!p) return s;
    if (a.type === 'move') {
      const moved = { ...p, x: p.x + a.dx };
      if (fits(s, moved)) s.cur = moved;
      return s;
    }
    if (a.type === 'rotate') {
      const rotated = { ...p, cells: rotateCells(p.cells) };
      if (fits(s, rotated)) s.cur = rotated;
      return s;
    }
    if (a.type === 'drop') {
      while (true) {
        const down = { ...s.cur!, y: s.cur!.y + 1 };
        if (!fits(s, down)) break;
        s.cur = down;
      }
    }
    // tick / drop 落到底：锁定并结算
    const down = { ...s.cur!, y: s.cur!.y + 1 };
    if (a.type === 'tick') {
      if (fits(s, down)) {
        s.cur = down;
        return s;
      }
    }
    s.cur!.cells.forEach(([cx, cy]) => {
      const x = s.cur!.x + cx;
      const y = s.cur!.y + cy;
      if (y >= 0 && y < s.rows && x >= 0 && x < s.cols) s.board[y * s.cols + x] = s.cur!.kind + 1;
    });
    let cleared = 0;
    for (let y = s.rows - 1; y >= 0; y--) {
      const full = Array.from({ length: s.cols }, (_, x) => s.board[y * s.cols + x]).every((v) => v > 0);
      if (!full) continue;
      cleared++;
      for (let yy = y; yy > 0; yy--)
        for (let x = 0; x < s.cols; x++) s.board[yy * s.cols + x] = s.board[(yy - 1) * s.cols + x];
      for (let x = 0; x < s.cols; x++) s.board[x] = 0;
      y++;
    }
    s.lines += cleared;
    s.score += [0, 100, 300, 500, 800][cleared] ?? 800;
    return spawn(s);
  },
  view(s) {
    return s;
  },
  isOver: (s) => s.over,
  bot() {
    return { type: 'tick' };
  },
};
