import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';

/**
 * 通用麻将内核（简版）：136 张，摸打 + 碰/杠/吃/胡。
 * 地域差异通过规则开关表达，避免"换皮四川麻将"。
 */
export interface MjRuleOptions {
  /** 定缺：出牌前必须先弃一门（四川血战） */
  que: boolean;
  /** 可吃（广东推倒胡） */
  chi: boolean;
  /** 红中可作赖子（长沙红中） */
  laizi: boolean;
  /** 起胡门槛：0 不限 */
  minFan: number;
}
export type MjRegion = 'guangdong' | 'changsha' | 'guobiao';
export interface MjOptions extends MjRuleOptions {
  region: MjRegion;
}
export type MjAction =
  | { type: 'discard'; tile: number }
  | { type: 'peng' }
  | { type: 'gang' }
  | { type: 'chi'; tiles: [number, number] }
  | { type: 'hu' }
  | { type: 'pass' }
  | { type: 'ready' };

export interface MjState {
  options: MjOptions;
  hands: number[][];
  melds: number[][][];
  wall: number[];
  discards: number[][];
  turn: Seat;
  phase: 'discard' | 'wait';
  last: { tile: number; seat: Seat } | null;
  winner: Seat | null;
  huType: string;
  que: MjSuitLike[];
  over: boolean;
  rng: number;
}
type MjSuitLike = 0 | 1 | 2;

export interface MjView {
  seat: Seat | null;
  hands: number[][];
  melds: number[][][];
  discards: number[][];
  wall: number;
  turn: Seat;
  phase: 'discard' | 'wait';
  last: { tile: number; seat: Seat } | null;
  winner: Seat | null;
  huType: string;
  que: number[];
  over: boolean;
  can: { peng: boolean; gang: boolean; chi: boolean; hu: boolean };
  options: MjOptions;
}

const suitOf = (t: number): 0 | 1 | 2 | 3 => (t < 9 ? 0 : t < 18 ? 1 : t < 27 ? 2 : 3);

/** 14 张能否分成 4 组面子 + 1 对将 */
export function isHu(tiles: number[], laizi = -1): boolean {
  const counts = Array(34).fill(0);
  tiles.forEach((t) => counts[t]++);
  const dig = (i: number, needSets: number, pair: boolean): boolean => {
    while (i < 34 && counts[i] === 0) i++;
    if (i >= 34) return needSets === 0 && pair;
    if (counts[i] >= 3) {
      counts[i] -= 3;
      if (dig(i, needSets - 1, pair)) return (counts[i] += 3), true;
      counts[i] += 3;
    }
    if (!pair && counts[i] >= 2) {
      counts[i] -= 2;
      if (dig(i, needSets, true)) return (counts[i] += 2), true;
      counts[i] += 2;
    }
    if (suitOf(i) < 3 && i % 9 <= 6 && counts[i] > 0 && counts[i + 1] > 0 && counts[i + 2] > 0) {
      counts[i]--;
      counts[i + 1]--;
      counts[i + 2]--;
      if (dig(i, needSets - 1, pair)) {
        counts[i]++;
        counts[i + 1]++;
        counts[i + 2]++;
        return true;
      }
      counts[i]++;
      counts[i + 1]++;
      counts[i + 2]++;
    }
    return false;
  };
  const laiziCount = laizi >= 0 ? counts[laizi] ?? 0 : 0;
  if (laiziCount > 0) counts[laizi] = 0;
  // 赖子逐张补成最需要的牌：简化处理为「去掉赖子后能胡」或「赖子当万用」
  const core = tiles.filter((t) => t !== laizi);
  const use = (n: number): boolean => {
    for (let t = 0; t < 34; t++) {
      const trial = [...core, ...Array(n).fill(t)];
      if (trial.length >= 2 && isHuNoLaizi(trial)) return true;
    }
    return false;
  };
  if (laiziCount > 0) return use(laiziCount);
  return isHuNoLaizi(tiles);
}

function isHuNoLaizi(tiles: number[]): boolean {
  if (tiles.length % 3 !== 2) return false;
  const c = Array(34).fill(0);
  tiles.forEach((t) => c[t]++);
  const rec = (needSets: number, pairDone: boolean): boolean => {
    let i = 0;
    while (i < 34 && c[i] === 0) i++;
    if (i >= 34) return needSets === 0 && pairDone;
    if (c[i] >= 3) {
      c[i] -= 3;
      if (rec(needSets - 1, pairDone)) return (c[i] += 3), true;
      c[i] += 3;
    }
    if (!pairDone && c[i] >= 2) {
      c[i] -= 2;
      if (rec(needSets, true)) return (c[i] += 2), true;
      c[i] += 2;
    }
    if (i < 27 && i % 9 <= 6 && c[i] > 0 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      if (rec(needSets - 1, pairDone)) { c[i]++; c[i + 1]++; c[i + 2]++; return true; }
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
    return false;
  };
  return rec(4, false);
}

function deal(seed: number, players: number, opt: MjOptions): MjState {
  const rng = new Rng(seed);
  const wall = Array.from({ length: 136 }, (_, i) => Math.floor(i / 4));
  for (let i = wall.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [wall[i], wall[j]] = [wall[j], wall[i]];
  }
  const hands = Array.from({ length: players }, () => wall.splice(0, 13));
  const dealer = 0;
  hands[dealer].push(wall.pop()!);
  return {
    options: opt,
    hands,
    melds: Array.from({ length: players }, () => [] as number[][]),
    wall,
    discards: Array.from({ length: players }, () => [] as number[]),
    turn: dealer,
    phase: 'discard',
    last: null,
    winner: null,
    huType: '',
    que: [],
    over: false,
    rng: rng.state,
  };
}

const LAZI = 33; // 红中

function canHuHand(s: MjState, seat: Seat, extra?: number): boolean {
  const tiles = [...s.hands[seat], ...(extra !== undefined ? [extra] : [])];
  const laizi = s.options.laizi ? LAZI : -1;
  // 四川定缺：手里还有缺门牌则不能胡
  if (s.options.que && s.que[seat] !== undefined) {
    const q = s.que[seat] as unknown as number;
    if (tiles.some((t) => suitOf(t) === q)) return false;
  }
  return isHu(tiles, laizi);
}

export function makeMahjong(region: MjRegion) {
  const base: Record<MjRegion, { name: string; tagline: string; opt: MjRuleOptions; rules: string[] }> = {
    guangdong: {
      name: '广东麻将',
      tagline: '推倒胡：可吃可碰，先胡先赢',
      opt: { que: false, chi: true, laizi: false, minFan: 0 },
      rules: ['可吃上家的牌，也可碰、杠。', '凑齐四组面子加一对将即可胡。', '先胡的人赢下这局。'],
    },
    changsha: {
      name: '长沙麻将',
      tagline: '红中赖子，可当任意牌',
      opt: { que: false, chi: false, laizi: true, minFan: 0 },
      rules: ['红中为赖子，可当任意一张牌用。', '可碰、可杠，不可吃。', '凑齐四组面子加一对将即可胡。'],
    },
    guobiao: {
      name: '国标麻将',
      tagline: '简版规则，四组面子加将',
      opt: { que: false, chi: true, laizi: false, minFan: 0 },
      rules: ['可吃可碰可杠。', '以标准四面子一将判定胡牌。', '番种计分为简化版，仅用于记录。'],
    },
  };
  const cfg = base[region];
  const def: GameDefinition<MjState, MjAction, MjView, MjOptions> = {
    meta: {
      id: `mj_${region}`,
      category: 'mahjong',
      name: cfg.name,
      nameEn: region,
      tagline: cfg.tagline,
      minPlayers: 4,
      maxPlayers: 4,
      defaultPlayers: 4,
      rules: cfg.rules,
    },
    defaultOptions: { region, ...cfg.opt },
    optionFields: [],
    setup({ seed }) {
      return deal(seed ?? 21, 4, { region, ...cfg.opt });
    },
    activeSeats: (s) => (s.over ? [] : [s.turn]),
    validate(s, seat, a) {
      if (s.over) return a.type === 'ready' ? null : '本局已结束';
      if (a.type === 'ready') return null;
      if (seat !== s.turn) return '还没轮到你';
      if (a.type === 'discard') {
        if (a.tile < 0 || a.tile >= s.hands[seat].length) return '没有这张牌';
        if (s.options.que && s.que[seat] === undefined) {
          const suit = suitOf(s.hands[seat][a.tile]);
          if (suit === 3) return '请先定缺一门（万/条/筒）';
        }
        return null;
      }
      if (a.type === 'pass') return null;
      if (!s.last) return '现在没有可响应的牌';
      const t = s.last.tile;
      if (a.type === 'peng') {
        if (s.hands[seat].filter((x) => x === t).length < 2) return '碰不了';
        return null;
      }
      if (a.type === 'gang') {
        if (s.hands[seat].filter((x) => x === t).length < 3) return '杠不了';
        return null;
      }
      if (a.type === 'chi') {
        if (!s.options.chi) return '这桌不吃牌';
        const [x, y] = a.tiles;
        const h = s.hands[seat];
        if (!h[x] || !h[y]) return '牌不合法';
        const vals = [h[x], h[y], t].sort((p, q) => p - q);
        if (suitOf(t) > 2 || suitOf(vals[1]) !== suitOf(t) || vals[1] - vals[0] !== 1 || vals[2] - vals[1] !== 1)
          return '吃不了';
        return null;
      }
      if (!canHuHand(s, seat, t)) return '还没听牌';
      return null;
    },
    apply(s0, seat, a) {
      if (a.type === 'ready') return deal(s0.rng + 47, 4, s0.options);
      const s = clone(s0);
      if (a.type === 'pass') {
        s.last = null;
        return stepDraw(s);
      }
      if (a.type === 'discard') {
        const t = s.hands[seat].splice(a.tile, 1)[0];
        s.discards[seat].push(t);
        s.last = { tile: t, seat };
        s.phase = 'wait';
        // 轮询其他家是否胡（简化：只判断下家能胡则等其行动）
        s.turn = ((seat + 1) % 4) as Seat;
        return s;
      }
      const t = s.last!.tile;
      if (a.type === 'peng') {
        const idx = s.hands[seat].map((v, i) => (v === t ? i : -1)).filter((i) => i >= 0).slice(0, 2);
        idx.sort((x, y) => y - x).forEach((i) => s.hands[seat].splice(i, 1));
        s.melds[seat].push([t, t, t]);
        s.discards[s.last!.seat].pop();
        s.turn = seat;
        s.last = null;
        s.phase = 'discard';
        return s;
      }
      if (a.type === 'gang') {
        const idx = s.hands[seat].map((v, i) => (v === t ? i : -1)).filter((i) => i >= 0).slice(0, 3);
        idx.sort((x, y) => y - x).forEach((i) => s.hands[seat].splice(i, 1));
        s.melds[seat].push([t, t, t, t]);
        s.discards[s.last!.seat].pop();
        s.turn = seat;
        s.last = null;
        s.phase = 'discard';
        return s;
      }
      if (a.type === 'chi') {
        const [x, y] = a.tiles;
        const pair = [s.hands[seat][x], s.hands[seat][y]];
        [x, y].sort((p, q) => q - p).forEach((i) => s.hands[seat].splice(i, 1));
        s.melds[seat].push([...pair, t]);
        s.discards[s.last!.seat].pop();
        s.turn = seat;
        s.last = null;
        s.phase = 'discard';
        return s;
      }
      s.over = true;
      s.winner = seat;
      s.huType = `点炮 · ${t}`;
      return s;
    },
    view(s, seat) {
      const t = s.last?.tile;
      const can = {
        peng: t !== undefined && seat !== null && s.hands[seat].filter((x) => x === t).length >= 2,
        gang: t !== undefined && seat !== null && s.hands[seat].filter((x) => x === t).length >= 3,
        chi: !!s.options.chi && t !== undefined && seat !== null && suitOf(t) < 3,
        hu: t !== undefined && seat !== null && canHuHand(s, seat, t),
      };
      return {
        seat,
        hands: s.hands,
        melds: s.melds,
        discards: s.discards,
        wall: s.wall.length,
        turn: s.turn,
        phase: s.phase,
        last: s.last,
        winner: s.winner,
        huType: s.huType,
        que: s.que as unknown as number[],
        over: s.over,
        can,
        options: s.options,
      };
    },
    isOver: (s) => s.over,
    bot(view, seat) {
      if (view.can.hu) return { type: 'hu' };
      return { type: 'pass' };
    },
  };
  return def;
}

function stepDraw(s: MjState): MjState {
  const t = s.wall.pop();
  if (t === undefined) {
    s.over = true;
    return s;
  }
  s.hands[s.turn].push(t);
  s.phase = 'discard';
  return s;
}

export const mjGuangdong = makeMahjong('guangdong');
export const mjChangsha = makeMahjong('changsha');
export const mjGuobiao = makeMahjong('guobiao');
