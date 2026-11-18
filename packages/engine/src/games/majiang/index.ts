import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';

/**
 * 通用麻将内核：136 张（万/条/筒各 9×4 + 字牌 7×4），摸打 + 碰/杠/吃/胡。
 * 地域差异通过规则开关表达，避免"换皮四川麻将"。
 *
 * 状态机（v0.3.1 重写）：
 *   discard —— 轮到 turn 从牌墙摸一张并打出（或自摸胡）
 *   claim   —— 有人打出牌后，其他家可胡/杠/碰/吃（按优先级）；无人响应则下家摸牌
 * 所有动作经 validate 校验，view 严格信息隐藏（他家手牌只给张数）。
 */
export interface MjRuleOptions {
  /** 定缺：出牌前必须先弃一门（四川血战） */
  que: boolean;
  /** 可吃（广东推倒胡 / 国标） */
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
  phase: 'discard' | 'claim';
  /** claim 阶段：打出牌的座位与牌 */
  last: { tile: number; seat: Seat } | null;
  /** claim 阶段仍可响应的座位（pass 后移除） */
  responders: Seat[];
  winner: Seat | null;
  huType: string;
  que: number[];
  over: boolean;
  rng: number;
  /** 本局已经过手数，避免无界空转 */
  turns: number;
}
type Suit = 0 | 1 | 2 | 3;

/** 兼容前端的视图：hands[i] 是自己手牌（真实牌）或他家手牌（长度=张数、值为 -1 占位） */
export interface MjView {
  seat: Seat | null;
  hands: number[][];
  melds: number[][][];
  discards: number[][];
  wall: number;
  turn: Seat;
  phase: 'discard' | 'claim';
  last: { tile: number; seat: Seat } | null;
  winner: Seat | null;
  huType: string;
  que: number[];
  over: boolean;
  can: { peng: boolean; gang: boolean; chi: boolean; hu: boolean };
  options: MjOptions;
  /** 我的吃牌候选（供前端按钮） */
  chiOptions: [number, number][];
}

const suitOf = (t: number): Suit => (t < 9 ? 0 : t < 18 ? 1 : t < 27 ? 2 : 3);
const LAZI = 33; // 红中

/** 面子类：刻子/顺子/杠 */
type Meld = { kind: 'triplet' | 'sequence' | 'quad'; tile: number };

/**
 * 纯手牌能否和牌：把 counts 拆成 (needSets) 组面子 + 1 对将。
 * 支持赖子：赖子可作任意牌，用回溯枚举其替牌（去重避免指数爆炸）。
 */
function winningFromCounts(counts: number[], needSets: number, laiziLeft: number): boolean {
  // 先找第一个非 0 的牌
  let i = 0;
  while (i < 34 && counts[i] === 0) i++;

  // 用赖子把当前牌补成刻子/将/顺子的尝试
  if (i >= 34) {
    // 牌都分光：刚好用完面子且赖子能组成剩余面子
    return needSets === 0 && laiziLeft === 0;
  }

  const canTriplet = counts[i] >= 3;
  const canPair = counts[i] >= 2;
  const canSeq = i < 27 && i % 9 <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0;

  // 普通刻子
  if (canTriplet && needSets > 0) {
    counts[i] -= 3;
    if (winningFromCounts(counts, needSets - 1, laiziLeft)) { counts[i] += 3; return true; }
    counts[i] += 3;
  }
  // 普通顺子
  if (canSeq && needSets > 0) {
    counts[i]--; counts[i + 1]--; counts[i + 2]--;
    if (winningFromCounts(counts, needSets - 1, laiziLeft)) {
      counts[i]++; counts[i + 1]++; counts[i + 2]++; return true;
    }
    counts[i]++; counts[i + 1]++; counts[i + 2]++;
  }
  // 普通将（只一次）
  if (canPair && needSets === 0) {
    // 只在还差"将"这一步时用——用 needSets 传 -1 表示将已定
  }

  // 赖子替牌：把一张赖子当 i，补齐刻子/顺子/对子
  if (laiziLeft > 0) {
    // 当刻子：i 已有 2 张 + 1 赖子
    if (counts[i] === 2 && needSets > 0) {
      counts[i] -= 2;
      if (winningFromCounts(counts, needSets - 1, laiziLeft - 1)) { counts[i] += 2; return true; }
      counts[i] += 2;
    }
    // 当顺子补位
    if (i < 27 && needSets > 0) {
      // 补 i+1：i,i+2 有；补 i+2：i,i+1 有
      for (const off of [1, 2]) {
        const b = i + off;
        if (b >= 27 || i % 9 > 6) continue;
        if (off === 1 && counts[i] > 0 && counts[i + 2] > 0) {
          counts[i]--; counts[i + 2]--;
          if (winningFromCounts(counts, needSets - 1, laiziLeft - 1)) {
            counts[i]++; counts[i + 2]++; return true;
          }
          counts[i]++; counts[i + 2]++;
        }
        if (off === 2 && counts[i] > 0 && counts[i + 1] > 0) {
          counts[i]--; counts[i + 1]--;
          if (winningFromCounts(counts, needSets - 1, laiziLeft - 1)) {
            counts[i]++; counts[i + 1]++; return true;
          }
          counts[i]++; counts[i + 1]++;
        }
      }
    }
    // 两张赖子组成刻子：i 已有 1 张 + 2 赖子
    if (counts[i] === 1 && laiziLeft >= 2 && needSets > 0) {
      counts[i] -= 1;
      if (winningFromCounts(counts, needSets - 1, laiziLeft - 2)) { counts[i] += 1; return true; }
      counts[i] += 1;
    }
    // 三张赖子自成刻子
    if (laiziLeft >= 3 && needSets > 0) {
      if (winningFromCounts(counts, needSets - 1, laiziLeft - 3)) return true;
    }
  }
  return false;
}

/** 手牌（可含赖子）是否和牌。melds 提供的面子不占手牌，故手牌数 = 3k+2。 */
export function isHu(tiles: number[], laizi = -1): boolean {
  // 和牌手牌（含赖子）总张数必须是 3k+2：赖子替任意一张牌不改变张数
  if (tiles.length % 3 !== 2) return false;
  const counts = Array(34).fill(0);
  let laiziLeft = 0;
  for (const t of tiles) {
    if (t === laizi) laiziLeft++;
    else counts[t] = (counts[t] ?? 0) + 1;
  }
  const needSets = Math.floor((tiles.length - 2) / 3);

  // 枚举"将"：可以是两张相同的普通牌、1 普通牌+1 赖子、2 赖子
  const pairCandidates: { take: number[]; useLaizi: number }[] = [];
  for (let p = 0; p < 34; p++) {
    if (p === laizi) continue;
    if (counts[p] >= 2) pairCandidates.push({ take: [p, p], useLaizi: 0 });
    if (counts[p] >= 1 && laiziLeft >= 1) pairCandidates.push({ take: [p], useLaizi: 1 });
  }
  if (laiziLeft >= 2) pairCandidates.push({ take: [], useLaizi: 2 });

  for (const pc of pairCandidates) {
    const c = counts.slice();
    for (const p of pc.take) c[p]--;
    if (winningFromCounts(c, needSets, laiziLeft - pc.useLaizi)) return true;
  }
  return false;
}

/** 是否可以碰/杠：手里有 n 张同牌 */
function countTile(hand: number[], t: number): number {
  return hand.reduce((a, x) => a + (x === t ? 1 : 0), 0);
}

/** 找吃牌候选：手中两张与上家牌组成同花色顺子 */
function chiCandidates(hand: number[], tile: number): [number, number][] {
  if (suitOf(tile) >= 3) return [];
  const out: [number, number][] = [];
  const seen = new Set<string>();
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      const vals = [hand[i], hand[j], tile].sort((a, b) => a - b);
      if (suitOf(vals[0]) !== suitOf(tile) || suitOf(vals[2]) !== suitOf(tile)) continue;
      if (vals[1] - vals[0] !== 1 || vals[2] - vals[1] !== 1) continue;
      const key = `${vals[0]},${vals[2]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([i, j]);
    }
  }
  return out;
}

function canHu(s: MjState, seat: Seat, extra?: number, selfDraw = false): boolean {
  const hand = [...s.hands[seat], ...(extra !== undefined ? [extra] : [])];
  // 定缺：手里还有缺门牌不能胡
  if (s.options.que && s.que[seat] !== undefined) {
    const q = s.que[seat];
    if (hand.some((t) => suitOf(t) === q)) return false;
  }
  const laizi = s.options.laizi ? LAZI : -1;
  return isHu(hand, laizi);
}

function deal(seed: number, players: number, opt: MjOptions): MjState {
  const rng = new Rng(seed);
  const wall = Array.from({ length: 136 }, (_, i) => Math.floor(i / 4));
  for (let i = wall.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [wall[i], wall[j]] = [wall[j], wall[i]];
  }
  const hands = Array.from({ length: players }, () => wall.splice(0, 13));
  const dealer: Seat = 0;
  hands[dealer].push(wall.pop()!); // 庄家 14 张，先出牌
  return {
    options: opt,
    hands,
    melds: Array.from({ length: players }, () => [] as number[][]),
    wall,
    discards: Array.from({ length: players }, () => [] as number[]),
    turn: dealer,
    phase: 'discard',
    last: null,
    responders: [],
    winner: null,
    huType: '',
    que: [],
    over: false,
    rng: rng.state,
    turns: 0,
  };
}

/** 摸牌：牌墙空则流局 */
function draw(s: MjState): void {
  const t = s.wall.pop();
  if (t === undefined) {
    s.over = true;
    s.huType = '流局：牌墙摸完';
    return;
  }
  s.hands[s.turn].push(t);
  s.phase = 'discard';
}

/** claim 阶段：推进到下一位有手牌的玩家摸牌 */
function nextDraw(s: MjState, after: Seat): void {
  for (let d = 1; d <= 4; d++) {
    const t = ((after + d) % 4) as Seat;
    if (s.hands[t].length > 0) {
      s.turn = t;
      draw(s);
      return;
    }
  }
  s.over = true;
  s.huType = '流局：牌墙摸完';
}

/** claim 阶段各座位可做的响应（只计算该座位自己的） */
function responsesFor(s: MjState, seat: Seat) {
  const t = s.last!.tile;
  const hand = s.hands[seat];
  return {
    hu: canHu(s, seat, t),
    gang: countTile(hand, t) >= 3,
    peng: countTile(hand, t) >= 2,
    chi: !!s.options.chi && chiCandidates(hand, t).length > 0,
  };
}

export function makeMahjong(region: MjRegion) {
  const base: Record<MjRegion, { name: string; tagline: string; opt: MjRuleOptions; rules: string[] }> = {
    guangdong: {
      name: '广东麻将',
      tagline: '推倒胡：可吃可碰，先胡先赢',
      opt: { que: false, chi: true, laizi: false, minFan: 0 },
      rules: ['可吃上家的牌，也可碰、杠、胡。', '凑齐四组面子加一对将即可胡。', '先胡的人赢下这局。'],
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
      botDelayMs: [240, 420],
    },
    defaultOptions: { region, ...cfg.opt },
    optionFields: [],
    setup({ seed }) {
      return deal(seed ?? 21, 4, { region, ...cfg.opt });
    },
    activeSeats(s) {
      if (s.over) return [];
      if (s.phase === 'discard') return [s.turn];
      return s.responders.slice();
    },
    validate(s, seat, a) {
      if (s.over) return a.type === 'ready' ? null : '本局已结束';
      if (a.type === 'ready') return null;
      if (s.phase === 'discard') {
        if (seat !== s.turn) return '还没轮到你';
        if (a.type !== 'discard' && a.type !== 'hu') return '请出牌';
        if (a.type === 'hu') {
          if (!s.hands[seat].length) return '不能胡';
          return canHu(s, seat, undefined, true) ? null : '还没听牌';
        }
        if (a.tile < 0 || a.tile >= s.hands[seat].length) return '没有这张牌';
        if (s.options.que && s.que[seat] === undefined) {
          const suit = suitOf(s.hands[seat][a.tile]);
          if (suit === 3) return '字牌不能定缺，请换一张';
        }
        return null;
      }
      // claim 阶段
      if (!s.responders.includes(seat)) return '现在不需要你响应';
      if (a.type === 'discard') return '请等待响应窗口';
      if (a.type === 'pass') return null;
      if (!s.last) return '现在没有可响应的牌';
      const r = responsesFor(s, seat);
      if (a.type === 'hu') return r.hu ? null : '还没听牌';
      if (a.type === 'gang') return r.gang ? null : '杠不了';
      if (a.type === 'peng') return r.peng ? null : '碰不了';
      if (a.type === 'chi') {
        if (!r.chi) return '吃不了';
        const chi = chiCandidates(s.hands[seat], s.last.tile);
        if (!chi.some(([x, y]) => x === a.tiles[0] && y === a.tiles[1])) return '吃法不合法';
        return null;
      }
      return '未知动作';
    },
    apply(s0, seat, a) {
      if (a.type === 'ready') return deal(s0.rng + 47, 4, s0.options);
      const s = clone(s0);
      if (s.phase === 'discard') {
        if (a.type === 'hu') {
          s.over = true;
          s.winner = seat;
          s.huType = '自摸';
          return s;
        }
        // discard（validate 已保证此处 a 为 discard，这里显式收窄以通过类型检查）
        if (a.type !== 'discard') return s;
        const t = s.hands[seat].splice(a.tile, 1)[0];
        s.discards[seat].push(t);
        s.last = { tile: t, seat };
        s.turns++;
        // 定缺首张记录缺门
        if (s.options.que && s.que[seat] === undefined) s.que[seat] = suitOf(t);
        // 打开响应窗口：其他有手牌的座位
        s.responders = ([0, 1, 2, 3] as Seat[]).filter(
          (p) => p !== seat && s.hands[p].length > 0 && Object.values(responsesFor(s, p)).some(Boolean),
        );
        s.phase = 'claim';
        if (s.responders.length === 0) nextDraw(s, seat);
        return s;
      }
      // claim 阶段
      s.responders = s.responders.filter((p) => p !== seat);
      if (a.type === 'pass') {
        if (s.responders.length === 0) nextDraw(s, s.last!.seat);
        return s;
      }
      if (a.type === 'hu') {
        s.over = true;
        s.winner = seat;
        s.huType = `点炮 · ${s.last!.tile}`;
        return s;
      }
      const t = s.last!.tile;
      const hand = s.hands[seat];
      if (a.type === 'peng' || a.type === 'gang') {
        const need = a.type === 'peng' ? 2 : 3;
        let removed = 0;
        for (let i = hand.length - 1; i >= 0 && removed < need; i--) {
          if (hand[i] === t) { hand.splice(i, 1); removed++; }
        }
        s.melds[seat].push(a.type === 'peng' ? [t, t, t] : [t, t, t, t]);
        s.discards[s.last!.seat].pop(); // 被碰/杠的牌从打出者河里移除
        s.last = null;
        s.phase = 'discard';
        s.turn = seat;
        s.responders = [];
        return s;
      }
      if (a.type === 'chi') {
        const pair = [hand[a.tiles[0]], hand[a.tiles[1]]];
        [a.tiles[0], a.tiles[1]].sort((x, y) => y - x).forEach((i) => hand.splice(i, 1));
        s.melds[seat].push([...pair, t]);
        s.discards[s.last!.seat].pop();
        s.last = null;
        s.phase = 'discard';
        s.turn = seat;
        s.responders = [];
        return s;
      }
      return s;
    },
    view(s, seat) {
      const can = { peng: false, gang: false, chi: false, hu: false };
      let chiOptions: [number, number][] = [];
      if (!s.over && seat !== null) {
        if (s.phase === 'discard' && s.turn === seat) {
          can.hu = canHu(s, seat, undefined, true);
        } else if (s.phase === 'claim' && s.responders.includes(seat) && s.last) {
          const r = responsesFor(s, seat);
          Object.assign(can, r);
          if (r.chi) chiOptions = chiCandidates(s.hands[seat], s.last.tile);
        }
      }
      return {
        seat,
        // 信息隐藏：自己手牌给真牌，他家只给"张数"（用 -1 占位，前端只取 length）
        hands: [0, 1, 2, 3].map((p) =>
          p === seat ? s.hands[p].slice() : Array(s.hands[p].length).fill(-1),
        ),
        melds: s.melds,
        discards: s.discards,
        wall: s.wall.length,
        turn: s.turn,
        phase: s.phase,
        last: s.last,
        winner: s.winner,
        huType: s.huType,
        que: s.que,
        over: s.over,
        can,
        options: s.options,
        chiOptions,
      };
    },
    isOver: (s) => s.over,
    bot(view, seat) {
      if (view.over || seat === null) return { type: 'pass' };
      // claim 阶段：按优先级响应
      if (view.phase === 'claim') {
        if (view.can.hu) return { type: 'hu' };
        if (view.can.gang) return { type: 'gang' };
        if (view.can.peng) return { type: 'peng' };
        if (view.can.chi && view.chiOptions.length) return { type: 'chi', tiles: view.chiOptions[0] };
        return { type: 'pass' };
      }
      // discard 阶段：能自摸就胡，否则出一张"最无用"的牌
      if (view.can.hu) return { type: 'hu' };
      const hand = view.hands[seat];
      if (!hand.length) return { type: 'pass' };
      // 启发式：优先打出孤张（同种牌出现次数最少），保留对子与顺子
      const counts = new Map<number, number>();
      hand.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
      let best = 0;
      let bestScore = Infinity;
      for (let i = 0; i < hand.length; i++) {
        const t = hand[i];
        const c = counts.get(t) ?? 0;
        let score = c; // 张数越少越想打
        // 字牌孤张更该先打
        if (suitOf(t) === 3 && c === 1) score -= 1;
        // 边张（1/9）孤张略优先打
        if (suitOf(t) < 3 && (t % 9 === 0 || t % 9 === 8) && c === 1) score -= 0.5;
        // 定缺没定：优先打能定为缺门的那一门中较孤的牌（此处简化，不打字牌以外的约束）
        if (score < bestScore) { bestScore = score; best = i; }
      }
      return { type: 'discard', tile: best };
    },
  };
  return def;
}

export const mjGuangdong = makeMahjong('guangdong');
export const mjChangsha = makeMahjong('changsha');
export const mjGuobiao = makeMahjong('guobiao');
