/**
 * 娱乐分结算（纯函数，无 IO、无 DOM、无第三方依赖）。
 *
 * 设计原则：
 * 1. 只读终局 state，不改规则引擎，也不依赖引擎内部的私有字段名（读取前先做类型收窄）；
 * 2. 一律整数、有上限，避免一局把账炸掉；
 * 3. 结算依据（basis）要能讲给桌上的人听，输赢对得上；
 * 4. 产出只有"分差"，发放与累计由服务端负责——本模块永远不产生余额、不产生兑换凭证。
 */

/** 娱乐分：牌桌上的输赢记录，不是钱 */
export const SCORE_CURRENCY = '娱乐分';

/** 展示给玩家的合规说明（客户端原样显示） */
export const SCORE_NOTICE =
  '娱乐分只记录牌局输赢，不能充值，不能兑换现金或实物，不能转赠他人，也不具备任何货币价值。';

/** 单局分差上限：防作弊/防手滑把账写炸 */
export const MAX_ABS_DELTA = 100_000;

export interface SettlementRow {
  seat: number;
  /** 本局分差，可为负 */
  delta: number;
}

export interface Settlement {
  rows: SettlementRow[];
  /** 单位：分 / 级 / 筹码 */
  unit: string;
  /** 结算依据，展示用，例如「地主胜 ×2 倍」 */
  basis: string;
  /** false 表示这套玩法没有可结算的终局数据，本局不计分 */
  counted: boolean;
}

type Rec = Record<string, unknown>;

function rec(v: unknown): Rec | null {
  return typeof v === 'object' && v !== null ? (v as Rec) : null;
}

function arr(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 分差收敛为整数并夹在上限内 */
function clampDelta(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const n = Math.round(v);
  if (n > MAX_ABS_DELTA) return MAX_ABS_DELTA;
  if (n < -MAX_ABS_DELTA) return -MAX_ABS_DELTA;
  return n;
}

/**
 * 生成本局分差行。逐行夹断会破坏零和（例如 [200000,-100000,-100000] →
 * [100000,-100000,-100000]，合计 -100000）；这里在夹断后把差额回填给
 * 「仍有夹断空间且绝对值最大的座位」，保证 ∑delta 恒为 0（除非 seats<=1）。
 * 所有可零和玩法都通过本函数，因此零和不变式集中在此处守护。
 */
function rowsFrom(deltas: number[], seats: number): SettlementRow[] {
  const rows: SettlementRow[] = Array.from({ length: seats }, (_, seat) => ({
    seat,
    delta: clampDelta(deltas[seat] ?? 0),
  }));
  if (seats <= 1) return rows;
  const sum = rows.reduce((a, r) => a + r.delta, 0);
  if (sum === 0) return rows;
  // 把 -sum 的差额回填：优先给同号且未触顶的座位（保持盈亏方向），
  // 否则给任意未触顶的座位。可能需多轮（单个座位夹断空间不足时）。
  let remaining = -sum;
  for (let pass = 0; pass < seats + 1 && remaining !== 0; pass++) {
    // 需要削减总和时 sum>0 → remaining<0，找正分且未触上界的座位扣减；反之补给负分座位
    const needPositive = remaining < 0;
    let pick: SettlementRow | null = null;
    for (const r of rows) {
      const signOk = needPositive ? r.delta > 0 : r.delta < 0;
      const room = needPositive ? r.delta + MAX_ABS_DELTA : MAX_ABS_DELTA - r.delta;
      if (signOk && room > 0 && (!pick || Math.abs(r.delta) > Math.abs(pick.delta))) pick = r;
    }
    if (!pick) {
      // 没有同号可调整座位，退而求其次找任意有空间的座位
      for (const r of rows) {
        const room = needPositive ? r.delta + MAX_ABS_DELTA : MAX_ABS_DELTA - r.delta;
        if (room > 0 && (!pick || Math.abs(r.delta) > Math.abs(pick.delta))) pick = r;
      }
    }
    if (!pick) break;
    const step = needPositive ? Math.max(-MAX_ABS_DELTA, pick.delta + remaining) - pick.delta
                              : Math.min(MAX_ABS_DELTA, pick.delta + remaining) - pick.delta;
    pick.delta += step;
    remaining -= step;
  }
  return rows;
}

function empty(seats: number, unit = '分'): Settlement {
  return { rows: rowsFrom([], seats), unit, basis: '本局没有可结算的数据', counted: false };
}

/** 座位数组型分数（斗地主、四川麻将、单牌、比大小用同一形状） */
function seatsScores(state: Rec | null, seats: number): number[] | null {
  const scores = arr(state?.scores);
  if (!scores || scores.length < seats) return null;
  const out: number[] = [];
  for (let i = 0; i < seats; i++) {
    const v = num(scores[i]);
    if (v === null) return null;
    out.push(v);
  }
  return out;
}

type Rule = (state: Rec, seats: number) => Settlement | null;

const RULES: Record<string, Rule> = {
  doudizhu: (st, seats) => {
    // 必须用本局 result.deltas，而非跨局累计的 state.scores——
    // 后者会被服务端每局 settle() 重复记账，导致分数指数级虚高。
    const result = rec(st.result);
    const roundDeltas = arr(result?.deltas)?.map((v) => num(v)).filter((v): v is number => v !== null);
    const scores = roundDeltas && roundDeltas.length >= seats ? roundDeltas : seatsScores(st, seats);
    if (!scores) return null;
    const multiplier = num(result?.multiplier);
    const landlordWin = result?.landlordWin === true;
    return {
      rows: rowsFrom(scores, seats),
      unit: '分',
      basis: `底分 × 叫分 × 倍数${multiplier ? `（${multiplier} 倍）` : ''}，${landlordWin ? '地主胜' : '农民胜'}`,
      counted: true,
    };
  },

  sichuan: (st, seats) => {
    const result = rec(st.result);
    const roundDeltas = arr(result?.deltas)?.map((v) => num(v)).filter((v): v is number => v !== null);
    const scores = roundDeltas && roundDeltas.length >= seats ? roundDeltas : seatsScores(st, seats);
    if (!scores) return null;
    const wins = arr(result?.wins) ?? [];
    const fan = wins
      .map((w) => num(rec(w)?.fan))
      .filter((x): x is number => x !== null);
    return {
      rows: rowsFrom(scores, seats),
      unit: '分',
      basis: fan.length
        ? `按番数结算${fan.length > 1 ? '（一炮多响）' : ''}，本局 ${fan.join(' / ')} 番`
        : '按番数结算',
      counted: true,
    };
  },

  guandan: (st, seats) => {
    const result = rec(st.result);
    const winTeam = num(result?.winTeam);
    const up = num(result?.up);
    if (winTeam === null || winTeam < 0 || winTeam > 1) return null;
    const step = clampDelta(up ?? 1) || 1;
    const won = winTeam as 0 | 1;
    const deltas = Array.from({ length: seats }, (_, s) => (s % 2 === won ? step : -step));
    return {
      rows: rowsFrom(deltas, seats),
      unit: '分',
      basis: `${won === 0 ? '南家' : '北家'}队胜，升 ${step} 级`,
      counted: true,
    };
  },

  texas: (st, seats) => {
    const players = arr(st.players);
    const opts = rec(st.options);
    const starting = num(opts?.startingStack);
    if (!players || starting === null) return null;
    const deltas: number[] = [];
    for (let i = 0; i < seats; i++) {
      const stack = num(rec(players[i])?.stack);
      if (stack === null) return null;
      deltas.push(stack - starting);
    }
    return {
      rows: rowsFrom(deltas, seats),
      unit: '筹码',
      basis: `按最终筹码与起始筹码（${starting}）之差结算`,
      counted: true,
    };
  },

  chess: (st, seats) => duel(st, seats),
  xiangqi: (st, seats) => duel(st, seats),

  onecard: (st, seats) => {
    const scores = seatsScores(st, seats);
    if (!scores) return null;
    return byRank(scores, seats, '先出完者收走其余人的手牌分，按本局得分排名结账');
  },

  highcard: (st, seats) => {
    const scores = seatsScores(st, seats);
    if (!scores) return null;
    return byRank(scores, seats, '按赢下的墩数排名结账');
  },

  spellstones: (st, seats) => {
    const players = arr(st.players);
    if (!players) return null;
    const scores: number[] = [];
    for (let i = 0; i < seats; i++) {
      const score = num(rec(players[i])?.score);
      if (score === null) return null;
      scores.push(score);
    }
    return byRank(scores, seats, '按回合得分与未猜中的魔法石排名结账');
  },

  hexisle: (st, seats) => ranking(st, seats, '按终局排行榜结算'),

  gemguild: (st, seats) => ranking(st, seats, '按终局积分与贵族数结算'),

  main: () => null,
};

/** 一对一棋类：胜 +1，负 −1，和 0 */
function duel(st: Rec, seats: number): Settlement | null {
  const result = rec(st.result);
  if (!result) return null;
  const winner = num(result.winner);
  if (winner === null) {
    return { rows: rowsFrom([], seats), unit: '分', basis: '和棋，双方不计分', counted: true };
  }
  if (winner < 0 || winner >= seats) return null;
  const deltas = Array.from({ length: seats }, (_, s) => (s === winner ? 1 : -1));
  return {
    rows: rowsFrom(deltas, seats),
    unit: '分',
    basis: `座 ${winner + 1} 胜`,
    counted: true,
  };
}

/** 名次型：第 1 名 +(N−1)，最后一名 −(N−1)，中间线性递减 */
function ranking(st: Rec, seats: number, basis: string): Settlement | null {
  const order = arr(st.ranking);
  if (!order || order.length < seats) return null;
  const deltas = Array.from({ length: seats }, () => 0);
  const n = seats;
  order.slice(0, n).forEach((seatRaw, i) => {
    const seat = num(seatRaw);
    if (seat === null || seat < 0 || seat >= n) return;
    deltas[seat] = n - 1 - 2 * i;
  });
  return { rows: rowsFrom(deltas, seats), unit: '分', basis, counted: true };
}

/**
 * 把"各自累加的得分"换算成名次分，保证桌子上对得上账（零和）。
 * 同分并列取平均名次；四舍五入的误差补在第一名身上，确保总和为 0。
 */
export function rankDeltas(scores: number[], seats: number): number[] {
  const n = seats;
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => (scores[b] ?? 0) - (scores[a] ?? 0),
  );
  const deltas = Array.from({ length: n }, () => 0);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && (scores[order[j + 1]] ?? 0) === (scores[order[i]] ?? 0)) j++;
    const avgPos = (i + j) / 2;
    for (let k = i; k <= j; k++) deltas[order[k]] = n - 1 - Math.round(2 * avgPos);
    i = j + 1;
  }
  const sum = deltas.reduce((a, d) => a + d, 0);
  if (sum !== 0) {
    // 误差补到排名最靠前的座位上，保持零和
    const first = order[0];
    deltas[first] = (deltas[first] ?? 0) - sum;
  }
  return deltas;
}

/** "各自累加"型玩法（接龙、比大小、桌游）：用名次分，别让桌上对不上账 */
function byRank(scores: number[], seats: number, basis: string): Settlement {
  return { rows: rowsFrom(rankDeltas(scores, seats), seats), unit: '分', basis, counted: true };
}

/**
 * 结算一局。
 *
 * @param gameId 玩法 id（`def.meta.id`）
 * @param state  终局状态（引擎的纯数据 state）
 * @param seats  座位数
 */
export function settleMatch(gameId: string, state: unknown, seats: number): Settlement {
  if (!Number.isInteger(seats) || seats <= 0 || seats > 12) return empty(0);
  const st = rec(state);
  if (!st) return empty(seats);

  const rule = RULES[gameId];
  const byRule = rule ? rule(st, seats) : null;
  if (byRule) return byRule;

  // 兜底：按常见字段形状推断，推断不出来就不计分（宁可不记，不能记错）
  const fallbackScores = seatsScores(st, seats);
  if (fallbackScores) return byRank(fallbackScores, seats, '按终局累计分排名结账');
  const players = arr(st.players);
  if (players) {
    const scores: number[] = [];
    for (let i = 0; i < seats; i++) {
      const score = num(rec(players[i])?.score);
      if (score === null) return empty(seats);
      scores.push(score);
    }
    return byRank(scores, seats, '按终局累计分排名结账');
  }
  const byRanking = ranking(st, seats, '按终局名次结算');
  return byRanking ?? empty(seats);
}

/** 一局总分是否守恒（用于测试与线上自检；非零和玩法返回 false） */
export function isZeroSum(settlement: Settlement): boolean {
  return settlement.rows.reduce((a, r) => a + r.delta, 0) === 0;
}

/** 服务端落盘 / 排行榜用的累计结构 */
export interface ScoreTotals {
  total: number;
  matches: number;
  wins: number;
  byGame: Record<string, { total: number; matches: number }>;
}

export function emptyTotals(): ScoreTotals {
  return { total: 0, matches: 0, wins: 0, byGame: {} };
}

/** 把一局的真人分差并入累计（纯函数，返回新对象）。`won` 由调用方判定，避免靠分差猜胜负 */
export function accumulate(
  prev: ScoreTotals,
  gameId: string,
  delta: number,
  won: boolean,
): ScoreTotals {
  const d = clampDelta(delta);
  const byGame = { ...prev.byGame };
  const g = byGame[gameId] ?? { total: 0, matches: 0 };
  byGame[gameId] = {
    total: clampGlobal(g.total + d),
    matches: g.matches + 1,
  };
  return {
    total: clampGlobal(prev.total + d),
    matches: prev.matches + 1,
    wins: prev.wins + (won ? 1 : 0),
    byGame,
  };
}

/** 累计分的绝对值上限（防止长期累积溢出） */
export const MAX_ABS_TOTAL = 10_000_000;

function clampGlobal(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const n = Math.round(v);
  if (n > MAX_ABS_TOTAL) return MAX_ABS_TOTAL;
  if (n < -MAX_ABS_TOTAL) return -MAX_ABS_TOTAL;
  return n;
}
