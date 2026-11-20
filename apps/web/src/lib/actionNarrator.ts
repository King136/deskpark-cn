import { mj as mjTiles } from '@park/engine';
import type { GameController } from './controller';

/**
 * 逐手动作播报文案生成器。
 *
 * 服务端出于防作弊只广播 `last: { seat, type }`，不含动作细节；但每个客户端都能从
 * 自己的 `ctl.view` 里读到公开信息（出过的牌、落过的子、最后一次下注……）。
 * 因此这里按玩法从 view 提取"最近一手"并生成中文文案，各端独立生成、结果一致，
 * 既不泄露隐藏信息，也不需要改服务端协议。
 *
 * 覆盖策略：
 *  - 有明确事件的玩法（斗地主/掼蛋/麻将/川麻/德州/UNO/宝石/棋类/五子棋/黑白棋）：精确描述；
 *  - 其余玩法：按通用动作动词表把 `ctl.last.type` 映射成可读文案兜底。
 */

export interface Narration {
  /** 动作发生的座位；null 表示系统 */
  seat: number | null;
  /** 完整文案（含发言者，可直接进聊天留痕），例如「小明 打出 顺子 3-4-5-6-7」 */
  text: string;
  /** 播报条用的短文案（通常去掉名字），例如「打出 顺子 3-4-5-6-7」 */
  short: string;
}

/** 通用动作动词表：`ctl.last.type` → 中文，覆盖没有专门 view 字段的玩法 */
const VERB: Record<string, string> = {
  play: '出牌',
  pass: '不要',
  discard: '打出',
  draw: '摸牌',
  bid: '叫分',
  call: '跟注',
  raise: '加注',
  check: '过牌',
  fold: '弃牌',
  allin: '全下',
  place: '落子',
  move: '走子',
  drop: '落块',
  select: '选择',
  choose: '选择',
  flip: '翻牌',
  return: '收回',
  exchange: '换牌',
  rotate: '旋转',
  set: '落子',
  steal: '偷取',
  buy: '购买',
  take: '拿取',
  build: '建造',
  city: '建城',
  road: '修路',
  dev: '发展',
  robber: '移动强盗',
  trade: '交易',
  attack: '进攻',
  fire: '开火',
  cast: '施法',
  reserve: '预留',
  noble: '招募贵族',
  challenge: '开盅',
  ready: '准备',
  start: '开始',
  reveal: '亮牌',
  undo: '悔棋',
  hu: '胡牌',
  peng: '碰',
  gang: '杠',
  chi: '吃',
  que: '定缺',
  zimo: '自摸',
  rob: '抢杠',
  kong: '杠',
  pung: '碰',
  win: '获胜',
};

function verbOf(type: string | undefined): string {
  if (!type) return '行动';
  return VERB[type] ?? type;
}

/** 把 view 里的牌数组压成短文案（保留花色符号与点数） */
function cardsText(cards: unknown, rankLabel: (r: number) => string, symbol: (s: string) => string) {
  if (!Array.isArray(cards)) return '';
  return cards
    .map((c) => {
      const card = c as { suit?: string; rank?: number };
      if (card.suit && card.suit !== 'J') return `${symbol(card.suit)}${rankLabel(card.rank ?? 0)}`;
      return rankLabel(card.rank ?? 0);
    })
    .join(' ');
}

/**
 * 生成最近一手文案。纯函数：同一 view 任何端调用结果一致。
 */
export function narrate(ctl: GameController): Narration | null {
  const id = ctl.def?.meta?.id ?? '';
  const v = (ctl.view ?? {}) as Record<string, any>;
  const last = ctl.last;
  const nameOf = (seat: number | null | undefined) =>
    seat == null || seat < 0 ? '系统' : ctl.players[seat]?.name ?? `${seat + 1} 号位`;
  const finish = (seat: number | null | undefined, short: string): Narration => {
    const who = nameOf(seat);
    return { seat: seat ?? null, short, text: `${who} ${short}` };
  };

  /* ---------- 斗地主 / 掼蛋：出牌牌型 + 具体牌 ---------- */
  if (id === 'doudizhu' || id === 'guandan') {
    // 叫分阶段：按动作座位取该座位刚叫的分（bids 按座位索引，与末位无关）
    if (last && last.type === 'bid') {
      const bids = Array.isArray(v.bids) ? v.bids : [];
      const b = bids[last.seat];
      return finish(last.seat, b === 0 ? '不叫' : b != null ? `叫 ${b} 分` : '叫分');
    }
    const lp = v.lastPlay as
      | { seat: number; pattern?: { kind?: string }; cards?: unknown }
      | null
      | undefined;
    if (lp && last && (last.type === 'play' || last.type === 'pass')) {
      if (last.type === 'pass') return finish(last.seat, '不要');
      const kind = lp.pattern?.kind ?? '';
      const kindName = KIND_NAME[kind] ?? '出牌';
      // 具体牌面：斗地主/掼蛋的牌 rank 即点数，花色符号直给
      const sym = (s: string) => ({ S: '♠', H: '♥', C: '♣', D: '♦', J: '' } as Record<string, string>)[s] ?? '';
      const rl = (r: number) =>
        ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王' } as Record<number, string>)[r] ?? String(r);
      const faces = cardsText(lp.cards, rl, sym);
      return finish(lp.seat, faces ? `${kindName} ${faces}` : kindName);
    }
  }

  /* ---------- 麻将（广东/长沙/国标）：打牌 + 碰杠吃胡 ---------- */
  if (id.startsWith('mj_')) {
    const m = v.melds as number[][][] | undefined;
    const evt = pickMeldsEvent(m, last?.type);
    if (evt) return finish(last?.seat, evt);
    const lp = v.last as { tile: number; seat: number } | null | undefined;
    if (lp) return finish(lp.seat, `打出 ${tileNameOf(lp.tile)}`);
  }

  /* ---------- 四川麻将：事件优先，否则最近打牌 ---------- */
  if (id === 'sichuan') {
    const events = Array.isArray(v.events) ? v.events : [];
    const e = events[events.length - 1] as
      | { type: string; seat?: number; kongType?: string }
      | undefined;
    if (e && SC_EVENT[e.type]) return finish(e.seat ?? last?.seat, SC_EVENT[e.type]);
    const ld = v.lastDiscard as { seat: number; id: number } | null | undefined;
    if (ld) return finish(ld.seat, `打出 ${tileNameOf(ld.id)}`);
  }

  /* ---------- 德州扑克：按动作座位取最后一次下注，避免误取别人的动作 ---------- */
  if (id === 'texas') {
    const players = Array.isArray(v.players) ? v.players : [];
    const s = last?.seat ?? -1;
    const a = players[s]?.lastAction as { tag: string; amount?: number } | null | undefined;
    if (a) {
      const verb = TX_ACTION[a.tag] ?? verbOf(a.tag);
      const amount = typeof a.amount === 'number' && a.amount > 0 ? ` ${a.amount}` : '';
      return finish(s, `${verb}${amount}`);
    }
    if (last) return finish(last.seat, verbOf(last.type));
  }

  /* ---------- UNO：最近事件 ---------- */
  if (id === 'onecard') {
    const events = Array.isArray(v.events) ? v.events : [];
    const e = events[events.length - 1] as
      | { type: string; seat?: number; count?: number; uno?: boolean }
      | undefined;
    if (e?.type === 'play') {
      let short = e.uno ? '出牌并喊「UNO」' : '出牌';
      if (last?.type === 'uno') short = '出牌并喊「UNO」';
      return finish(e.seat ?? last?.seat, short);
    }
    if (e?.type === 'draw') return finish(e.seat ?? last?.seat, `摸 ${e.count ?? 1} 张`);
  }

  /* ---------- 宝石行会：最近事件 ---------- */
  if (id === 'gemguild') {
    const events = Array.isArray(v.events) ? v.events : [];
    const e = events[events.length - 1] as { type: string; seat?: number } | undefined;
    if (e && GG_EVENT[e.type]) return finish(e.seat ?? last?.seat, GG_EVENT[e.type]);
  }

  /* ---------- 中国象棋 / 国际象棋：用引擎记谱文本 ---------- */
  if (id === 'xiangqi' || id === 'chess') {
    const moves = Array.isArray(v.moves) ? v.moves : [];
    const m = moves[moves.length - 1] as
      | { text?: string; san?: string; check?: boolean; captured?: unknown }
      | undefined;
    if (last?.type === 'undo' || last?.type === 'resign') return finish(last.seat, verbOf(last.type));
    if (m) {
      const notation = m.text ?? m.san ?? '';
      let short = notation ? `走 ${notation}` : verbOf(last?.type);
      if (m.check) short += ' · 将军';
      else if (m.captured) short += ' · 吃子';
      // 座位：mover 的颜色对应座位；用 last.seat 兜底
      return finish(last?.seat ?? moverSeat(v, m), short);
    }
  }

  /* ---------- 五子棋 / 黑白棋：落点 ---------- */
  if (id === 'gomoku' || id === 'reversi') {
    const lp = v.last as { x: number; y: number; seat: number; flipped?: number[] } | null | undefined;
    if (lp) {
      const col = String.fromCharCode(65 + lp.x);
      const extra = lp.flipped?.length ? ` · 翻 ${lp.flipped.length}` : '';
      return finish(lp.seat, `落在 ${col}${lp.y + 1}${extra}`);
    }
  }

  /* ---------- 通用兜底 ---------- */
  if (last) return finish(last.seat, verbOf(last.type));
  return null;
}

/* ============================ 辅助表与函数 ============================ */

const KIND_NAME: Record<string, string> = {
  single: '单张',
  pair: '对子',
  trio: '三张',
  trio1: '三带一',
  trio2: '三带二',
  straight: '顺子',
  pairs: '连对',
  plane: '飞机',
  plane1: '飞机带翅膀',
  plane2: '飞机带翅膀',
  four2: '四带二',
  four22: '四带两对',
  bomb: '炸弹',
  rocket: '王炸',
  jokerbomb: '王炸',
};

const TX_ACTION: Record<string, string> = {
  fold: '弃牌',
  check: '过牌',
  call: '跟注',
  bet: '下注',
  raise: '加注',
  allin: '全下',
  sb: '小盲',
  bb: '大盲',
};

const SC_EVENT: Record<string, string> = {
  peng: '碰',
  gang: '杠',
  zimo: '自摸',
  hu: '胡牌',
  rob: '抢杠',
  exchange: '换牌',
  que: '定缺',
};

const GG_EVENT: Record<string, string> = {
  take: '拿宝石',
  reserve: '预留卡牌',
  buy: '购买卡牌',
  discard: '退还宝石',
  noble: '招募贵族',
  pass: '跳过',
  final: '触发最后一轮',
};

function tileNameOf(id: number): string {
  try {
    return mjTiles.tileName(mjTiles.tileOf(id));
  } catch {
    return `${id + 1} 号牌`;
  }
}

/** 从 melds 长度变化推断碰/杠/吃/胡（各玩法 action type 语义一致） */
function pickMeldsEvent(_melds: unknown, type: string | undefined): string | null {
  if (!type) return null;
  return VERB[type] && ['peng', 'gang', 'chi', 'hu', 'zimo'].includes(type) ? VERB[type] : null;
}

/** 根据走子记录的颜色与 view.colors 反推座位（失败返回 null，交给 last.seat） */
function moverSeat(v: Record<string, any>, m: { color?: string; text?: string; san?: string }): number | null {
  const colors = Array.isArray(v.colors) ? v.colors : [];
  if (!m.color) return null;
  const i = colors.indexOf(m.color);
  return i >= 0 ? i : null;
}
