import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';

/** 数独：9×9，单人益智，填满且每行/列/宫不重复即胜。 */
export interface SdOptions {
  blanks: number;
}
export type SdAction =
  | { type: 'set'; index: number; value: number }
  | { type: 'ready' };
export interface SdState {
  options: SdOptions;
  puzzle: number[];
  given: boolean[];
  values: number[];
  errors: number;
  over: boolean;
  win: boolean;
  steps: number;
  rng: number;
}
export interface SdView {
  seat: Seat | null;
  puzzle: number[];
  given: boolean[];
  values: number[];
  errors: number;
  over: boolean;
  win: boolean;
  steps: number;
}

const ROW = (i: number) => Math.floor(i / 9);
const COL = (i: number) => i % 9;
const BOX = (i: number) => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);

function conflict(values: number[], i: number, v: number): boolean {
  for (let k = 0; k < 81; k++) {
    if (k === i || values[k] !== v) continue;
    if (ROW(k) === ROW(i) || COL(k) === COL(i) || BOX(k) === BOX(i)) return true;
  }
  return false;
}

function build(seed: number, blanks: number): SdState {
  const rng = new Rng(seed);
  const puzzle = Array(81).fill(0);
  const put = (i: number, v: number): boolean => {
    if (conflict(puzzle, i, v)) return false;
    puzzle[i] = v;
    return true;
  };
  // 回溯填满一个完整解
  const solve = (i: number): boolean => {
    if (i >= 81) return true;
    const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => rng.int(3) - 1);
    for (const v of nums) {
      if (put(i, v) && solve(i + 1)) return true;
      puzzle[i] = 0;
    }
    return false;
  };
  solve(0);
  const given = Array(81).fill(true);
  const values = puzzle.slice();
  let left = blanks;
  while (left > 0) {
    const i = rng.int(81);
    if (!given[i]) continue;
    given[i] = false;
    values[i] = 0;
    left--;
  }
  return {
    options: { blanks },
    puzzle,
    given,
    values,
    errors: 0,
    over: false,
    win: false,
    steps: 0,
    rng: rng.state,
  };
}

export const sudoku: GameDefinition<SdState, SdAction, SdView, SdOptions> = {
  meta: {
    id: 'sudoku',
    category: 'casual',
    name: '数独',
    nameEn: 'Sudoku',
    tagline: '每行每列每宫，1-9 不重复',
    minPlayers: 1,
    maxPlayers: 1,
    defaultPlayers: 1,
    rules: [
      '在空格里填 1-9，使每行、每列、每个 3×3 宫都不重复。',
      '填错会有提示并计入失误次数。',
      '全部填满且无冲突即通关。',
    ],
  },
  defaultOptions: { blanks: 42 },
  optionFields: [],
  setup({ options, seed }) {
    return build(seed ?? 3, options.blanks ?? 42);
  },
  activeSeats: (s) => (s.over ? [] : [0]),
  validate(s, _seat, a) {
    if (s.over) return a.type === 'ready' ? null : '本局已结束';
    if (a.type === 'ready') return null;
    if (s.given[a.index]) return '这格是题目给定的';
    return null;
  },
  apply(s0, _seat, a) {
    if (a.type === 'ready') return build(s0.rng + 13, s0.options.blanks);
    const s = clone(s0);
    s.steps++;
    s.values[a.index] = a.value;
    if (a.value && conflict(s.values, a.index, a.value)) {
      s.errors++;
      s.values[a.index] = 0;
      return s;
    }
    const full = s.values.every((v) => v > 0);
    if (full && !s.values.some((v, i) => conflict(s.values, i, v))) {
      s.win = true;
      s.over = true;
    }
    return s;
  },
  view(s, seat) {
    return {
      seat,
      puzzle: s.puzzle,
      given: s.given,
      values: s.values,
      errors: s.errors,
      over: s.over,
      win: s.win,
      steps: s.steps,
    };
  },
  isOver: (s) => s.over,
  bot() {
    return { type: 'ready' };
  },
};
