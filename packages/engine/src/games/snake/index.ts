import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';

/** 贪吃蛇：单人街机，吃到食物变长，撞墙或撞自己结束。 */
export type SnDir = 'up' | 'down' | 'left' | 'right';
export interface SnOptions {
  cols: number;
  rows: number;
}
export type SnAction =
  | { type: 'turn'; dir: SnDir }
  | { type: 'tick' }
  | { type: 'ready' };
export interface SnState {
  options: SnOptions;
  cols: number;
  rows: number;
  snake: number[];
  dir: SnDir;
  food: number;
  score: number;
  over: boolean;
  rng: number;
}
export interface SnView {
  seat: Seat | null;
  cols: number;
  rows: number;
  snake: number[];
  dir: SnDir;
  food: number;
  score: number;
  over: boolean;
}

const DX: Record<SnDir, number> = { up: 0, down: 0, left: -1, right: 1 };
const DY: Record<SnDir, number> = { up: -1, down: 1, left: 0, right: 0 };

function feed(s: SnState): SnState {
  const rng = new Rng(s.rng + 7);
  const free: number[] = [];
  for (let i = 0; i < s.cols * s.rows; i++) if (!s.snake.includes(i)) free.push(i);
  const food = free.length ? free[rng.int(free.length)] : -1;
  return { ...s, food, rng: rng.state };
}

export const snake: GameDefinition<SnState, SnAction, SnView, SnOptions> = {
  meta: {
    id: 'snake',
    category: 'casual',
    name: '贪吃蛇',
    nameEn: 'Snake',
    tagline: '吃食变长，别撞到自己',
    minPlayers: 1,
    maxPlayers: 1,
    defaultPlayers: 1,
    rules: ['蛇按当前方向前进，转向键改变方向。', '吃到食物身体变长、加分。', '撞墙或撞到自己即结束。'],
  },
  defaultOptions: { cols: 16, rows: 16 },
  optionFields: [],
  setup({ options, seed }) {
    const cols = options.cols ?? 16;
    const rows = options.rows ?? 16;
    const mid = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
    return feed({ options: { cols, rows }, cols, rows, snake: [mid, mid - 1, mid - 2], dir: 'right', food: 0, score: 0, over: false, rng: new Rng(seed ?? 11).state });
  },
  activeSeats: (s) => (s.over ? [] : [0]),
  validate(s, _seat, a) {
    if (s.over) return a.type === 'ready' ? null : '本局已结束';
    return null;
  },
  apply(s0, _seat, a) {
    if (a.type === 'ready') {
      return feed({ ...clone(s0), score: 0, over: false, snake: [Math.floor(s0.rows / 2) * s0.cols + Math.floor(s0.cols / 2)], dir: 'right', rng: s0.rng + 3 });
    }
    const s = clone(s0);
    if (a.type === 'turn') {
      const opposite: Record<SnDir, SnDir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
      if (s.dir !== opposite[a.dir]) s.dir = a.dir;
      return s;
    }
    const head = s.snake[0];
    const x = (head % s.cols) + DX[s.dir];
    const y = Math.floor(head / s.cols) + DY[s.dir];
    if (x < 0 || x >= s.cols || y < 0 || y >= s.rows) {
      s.over = true;
      return s;
    }
    const next = y * s.cols + x;
    if (s.snake.includes(next) && next !== s.snake[s.snake.length - 1]) {
      s.over = true;
      return s;
    }
    const ate = next === s.food;
    s.snake.unshift(next);
    if (ate) {
      s.score += 10;
      return feed(s);
    }
    s.snake.pop();
    return s;
  },
  view(s, seat) {
    return { seat, cols: s.cols, rows: s.rows, snake: s.snake, dir: s.dir, food: s.food, score: s.score, over: s.over };
  },
  isOver: (s) => s.over,
  bot() {
    return { type: 'tick' };
  },
};
