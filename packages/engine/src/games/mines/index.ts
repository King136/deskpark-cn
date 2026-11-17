import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';

/** 扫雷：单人益智，点开安全格、标记雷，扫完全场即胜。 */
export interface MsOptions {
  cols: number;
  rows: number;
  mines: number;
}
export type MsAction =
  | { type: 'reveal'; index: number }
  | { type: 'flag'; index: number }
  | { type: 'ready' };
export interface MsState {
  options: MsOptions;
  cols: number;
  rows: number;
  mines: number;
  cells: number[];
  revealed: boolean[];
  flags: boolean[];
  boom: number | null;
  over: boolean;
  win: boolean;
  steps: number;
  rng: number;
}
export interface MsView {
  seat: Seat | null;
  cols: number;
  rows: number;
  mines: number;
  cells: number[];
  revealed: boolean[];
  flags: boolean[];
  boom: number | null;
  over: boolean;
  win: boolean;
  steps: number;
}

const idx = (x: number, y: number, cols: number) => y * cols + x;

function neighbors(i: number, cols: number, rows: number): number[] {
  const x = i % cols;
  const y = Math.floor(i / cols);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) out.push(idx(nx, ny, cols));
    }
  return out;
}

function lay(st: MsState, seed: number): MsState {
  const rng = new Rng(seed);
  const total = st.cols * st.rows;
  const cells = Array(total).fill(0);
  const pick = new Set<number>();
  while (pick.size < Math.min(st.mines, total - 1)) pick.add(rng.int(total));
  pick.forEach((i) => (cells[i] = -1));
  for (let i = 0; i < total; i++) {
    if (cells[i] === -1) continue;
    cells[i] = neighbors(i, st.cols, st.rows).filter((n) => cells[n] === -1).length;
  }
  return {
    ...st,
    cells,
    revealed: Array(total).fill(false),
    flags: Array(total).fill(false),
    boom: null,
    over: false,
    win: false,
    steps: 0,
    rng: rng.state,
  };
}

export const mines: GameDefinition<MsState, MsAction, MsView, MsOptions> = {
  meta: {
    id: 'mines',
    category: 'casual',
    name: '扫雷',
    nameEn: 'Minesweeper',
    tagline: '点开安全格，标记所有雷',
    minPlayers: 1,
    maxPlayers: 1,
    defaultPlayers: 1,
    rules: [
      '数字表示周围八格里的雷数。',
      '点击翻开格子；长按或切到「插旗」模式标记雷。',
      '踩到雷即失败，把非雷格全部翻开即通关。',
    ],
  },
  defaultOptions: { cols: 9, rows: 9, mines: 10 },
  optionFields: [],
  setup({ options, seed }) {
    const cols = options.cols ?? 9;
    const rows = options.rows ?? 9;
    const m = options.mines ?? 10;
    return lay(
      {
        options: { cols, rows, mines: m },
        cols,
        rows,
        mines: m,
        cells: [],
        revealed: [],
        flags: [],
        boom: null,
        over: false,
        win: false,
        steps: 0,
        rng: 1,
      },
      seed ?? 7,
    );
  },
  activeSeats: (s) => (s.over ? [] : [0]),
  validate(s, _seat, a) {
    if (s.over) return a.type === 'ready' ? null : '本局已结束';
    if (a.type === 'ready') return null;
    const total = s.cols * s.rows;
    if (a.index < 0 || a.index >= total) return '位置不合法';
    if (s.revealed[a.index]) return '这格已经翻开';
    return null;
  },
  apply(s0, _seat, a) {
    if (a.type === 'ready') return lay({ ...clone(s0), steps: 0 }, s0.rng + 11);
    const s = clone(s0);
    if (a.type === 'flag') {
      s.flags[a.index] = !s.flags[a.index];
      return s;
    }
    if (s.flags[a.index]) return s;
    s.steps++;
    const total = s.cols * s.rows;
    if (s.cells[a.index] === -1) {
      s.boom = a.index;
      s.over = true;
      s.revealed = s.revealed.map((_, i) => (s.cells[i] === -1 ? true : s.revealed[i]));
      return s;
    }
    const stack = [a.index];
    while (stack.length) {
      const i = stack.pop()!;
      if (s.revealed[i]) continue;
      s.revealed[i] = true;
      if (s.cells[i] === 0)
        neighbors(i, s.cols, s.rows).forEach((n) => {
          if (!s.revealed[n] && s.cells[n] !== -1) stack.push(n);
        });
    }
    let opened = 0;
    for (let i = 0; i < total; i++) if (s.revealed[i] && s.cells[i] !== -1) opened++;
    if (opened === total - s.mines) {
      s.win = true;
      s.over = true;
    }
    return s;
  },
  view(s, seat) {
    return {
      seat,
      cols: s.cols,
      rows: s.rows,
      mines: s.mines,
      cells: s.cells,
      revealed: s.revealed,
      flags: s.flags,
      boom: s.boom,
      over: s.over,
      win: s.win,
      steps: s.steps,
    };
  },
  isOver: (s) => s.over,
  bot(view) {
    const free = view.cells
      .map((v, i) => (v !== -1 && !view.revealed[i] && !view.flags[i] ? i : -1))
      .filter((i) => i >= 0);
    return { type: 'reveal', index: free[0] ?? 0 };
  },
};
