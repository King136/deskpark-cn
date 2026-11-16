import type { GameController } from './controller';

export interface HudFact {
  label: string;
  value: string;
  /** 用金色强调（倍数、筹码这类关键数字） */
  gold?: boolean;
}

const PHASE_TEXT: Record<string, string> = {
  bidding: '叫分',
  playing: '出牌中',
  play: '对局中',
  choose: '选牌',
  exchange: '换牌',
  discard: '出牌中',
  draw: '摸牌中',
  turn: '行动中',
  over: '本局结束',
  settle: '结算中',
  waiting: '等待开始',
  deal: '发牌中',
  buy: '交易中',
  build: '建造中',
  use: '使用道具',
  move: '走子',
};

/** 相位的中文说明 */
export function phaseText(phase: unknown): string {
  if (typeof phase !== 'string') return '对局中';
  return PHASE_TEXT[phase] ?? '对局中';
}

/** 把 view 里各玩法都会出现的关键数字抽出来，作为交互区的「关键信息」 */
export function hudFacts(
  ctl: GameController,
  view: Record<string, unknown> | null | undefined,
): HudFact[] {
  const facts: HudFact[] = [];
  const v = (view ?? {}) as Record<string, unknown>;
  const options = (v.options ?? {}) as Record<string, unknown>;

  if (typeof v.round === 'number') {
    const total = typeof options.rounds === 'number' ? options.rounds : 0;
    facts.push({ label: '局数', value: total ? `${v.round}/${total}` : `第 ${v.round} 局` });
  }
  if (typeof v.multiplier === 'number') {
    facts.push({ label: '倍数', value: `×${v.multiplier}`, gold: true });
  }
  if (typeof v.baseScore === 'number') {
    const bid = typeof v.currentBid === 'number' ? Math.max(1, v.currentBid) : 1;
    facts.push({ label: '底分', value: String(v.baseScore * bid), gold: true });
  }
  if (typeof v.pot === 'number') facts.push({ label: '底池', value: String(v.pot), gold: true });
  if (typeof v.level === 'number') facts.push({ label: '级牌', value: String(v.level) });
  if (Array.isArray(v.levels)) {
    facts.push({ label: '双方级', value: (v.levels as number[]).join(' / ') });
  }
  if (typeof v.blind === 'number') facts.push({ label: '盲注', value: String(v.blind) });
  if (typeof v.turnNo === 'number') facts.push({ label: '回合', value: String(v.turnNo) });
  if (typeof v.ply === 'number') facts.push({ label: '步数', value: String(v.ply) });

  if (!facts.length && ctl.last) {
    facts.push({ label: '上一步', value: ACTION_TEXT[ctl.last.type] ?? ctl.last.type });
  }
  return facts.slice(0, 4);
}

const ACTION_TEXT: Record<string, string> = {
  play: '出牌',
  pass: '不出',
  fold: '弃牌',
  check: '过牌',
  bid: '叫分',
  call: '跟注',
  raise: '加注',
  allin: '全下',
  discard: '舍牌',
  exchange: '换牌',
  move: '走子',
  que: '听牌',
  draw: '摸牌',
};

/** 当前该谁行动（各玩法的 view 都有 turn 字段；棋类没有 turn，用 activeSeats 兜底） */
export function activeSeat(view: unknown): number | null {
  const v = (view ?? {}) as Record<string, unknown>;
  if (typeof v.turn === 'number') return v.turn;
  return null;
}

/** 每个座位的分数（不是所有玩法都记分） */
export function seatScores(view: unknown): number[] | null {
  const v = (view ?? {}) as Record<string, unknown>;
  if (Array.isArray(v.scores) && (v.scores as unknown[]).every((x) => typeof x === 'number')) {
    return v.scores as number[];
  }
  return null;
}

/** 手牌/剩余牌数，用于座位副信息 */
export function seatCounts(view: unknown): number[] | null {
  const v = (view ?? {}) as Record<string, unknown>;
  const keys = ['counts', 'handCounts', 'remaining'] as const;
  for (const k of keys) {
    const arr = v[k];
    if (Array.isArray(arr) && arr.every((x) => typeof x === 'number')) return arr as number[];
  }
  return null;
}

/** 距离某个座位超时还有几秒 */
export function secondsLeft(deadline: number | undefined): number | null {
  if (!deadline) return null;
  const left = Math.max(0, deadline - Date.now());
  return Math.ceil(left / 1000);
}
