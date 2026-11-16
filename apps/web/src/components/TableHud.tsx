import type { ChatMessage } from '@park/protocol';
import { EMOTES } from '@park/protocol';
import { ChevronDown, GripHorizontal, Smile } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { GameController } from '../lib/controller';
import { activeSeat, phaseText, seatCounts, seatScores, secondsLeft } from '../lib/hudFacts';
import { online, useOnline } from '../lib/online';
import { ChatPanel } from './Chat';
import { PixelAvatar } from './pixel/PixelAvatar';
import { signed } from '../lib/format';
import './hud.css';

export interface TableHudProps {
  ctl: GameController;
  dock: 'open' | 'peek' | 'hidden';
  vertical: boolean;
  /** 交互区像素尺寸（竖屏是高度、横屏是宽度），由外壳按 1/3 与拖拽实时给出 */
  sizePx: number;
  chat: {
    messages: ChatMessage[];
    myId: string | null;
    onSend: (text: string) => void;
    onEmote?: (emote: string) => void;
    unread: number;
  };
  onToggle: () => void;
  onGrab: (e: React.PointerEvent<HTMLDivElement>) => void;
}

/** 牌友状态：谁在场、谁托管、剩多少张牌 */
function SeatCard({ ctl }: { ctl: GameController }) {
  const v = (ctl.view ?? {}) as Record<string, unknown>;
  const scores = seatScores(v);
  const counts = seatCounts(v);
  const turn = activeSeat(v);

  return (
    <section className="hud__card">
      <h4>牌友状态</h4>
      <ul>
        {ctl.players.map((p, i) => (
          <li key={i} className={`${p.isMe ? 'is-me' : ''} ${turn === i && !ctl.over ? 'is-turn' : ''}`}>
            <PixelAvatar avatar={p.avatar} name={p.name} size={20} />
            <span className="hud__card-name">{p.name}</span>
            {p.isMe && <i className="hud__tag">我</i>}
            <span className="hud__card-meta">
              {p.auto ? '托管' : p.thinking ? '思考中' : !p.connected ? '掉线' : ''}
              {counts ? `${counts[i] ?? '—'} 张` : scores ? `${scores[i] ?? '—'} 分` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 本房娱乐分：联机用房间累计，单机用本局积分 */
function ScoreCard({ ctl }: { ctl: GameController }) {
  const online_ = useOnline();
  const rows = online_.roomScores;
  const local = seatScores(ctl.view);

  return (
    <section className="hud__card">
      <h4>
        本房娱乐分
        {online_.roomScores.length > 0 && <small>进房以来</small>}
      </h4>
      {rows.length > 0 ? (
        <ul>
          {rows.map((r) => (
            <li key={r.seat}>
              <PixelAvatar avatar={r.avatar} name={r.name ?? '?'} size={20} />
              <span className="hud__card-name">{r.name ?? `座 ${r.seat + 1}`}</span>
              <b className={r.session > 0 ? 'pos' : r.session < 0 ? 'neg' : ''}>
                {signed(r.session)}
              </b>
            </li>
          ))}
        </ul>
      ) : local ? (
        <ul>
          {ctl.players.map((p, i) => (
            <li key={i} className={p.isMe ? 'is-me' : ''}>
              <PixelAvatar avatar={p.avatar} name={p.name} size={20} />
              <span className="hud__card-name">{p.name}</span>
              <b className={(local[i] ?? 0) > 0 ? 'pos' : (local[i] ?? 0) < 0 ? 'neg' : ''}>
                {signed(local[i] ?? 0)}
              </b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hud__card-empty">单人练习不计娱乐分</p>
      )}
      <footer>仅记输赢，不能充值或兑换</footer>
    </section>
  );
}

export function TableHud({
  ctl,
  dock,
  vertical,
  sizePx,
  chat,
  onToggle,
  onGrab,
}: TableHudProps) {
  const online_ = useOnline();
  const onEmote = chat.onEmote;
  const [emoji, setEmoji] = useState(false);
  const v = (ctl.view ?? {}) as Record<string, unknown>;
  const turn = activeSeat(v);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const left = turn != null ? secondsLeft(ctl.deadlines[turn]) : null;

  const note = ctl.over
    ? '本局已结束'
    : turn != null
      ? `轮到 ${ctl.players[turn]?.name ?? `${turn + 1} 号位`}${ctl.seat === turn ? '（你）' : ''}${
          left != null ? ` · ${left}s` : ''
        }`
      : phaseText(v.phase);

  return (
    <div
      className={`hud hud--${vertical ? 'bottom' : 'right'} hud--${dock}`}
      style={vertical ? { height: sizePx } : { width: sizePx }}
      aria-label="对局交互区"
    >
      <div
        className="hud__grip"
        onPointerDown={onGrab}
        role="button"
        tabIndex={0}
        aria-label={dock === 'open' ? '收起交互区' : '展开交互区'}
        title="上下拖动可调高度，轻点展开或收起"
      >
        <GripHorizontal size={15} />
      </div>

      <div className="hud__sheet">
        <header className="hud__head">
          <span className="hud__head-title">牌桌信息</span>
          <span className={`hud__head-note ${turn != null && !ctl.over ? 'is-turn' : ''}`}>
            {note}
          </span>
          {online_ && ctl.seat !== null && (
            <button
              className={`hud__head-btn ${emoji ? 'is-on' : ''}`}
              onClick={() => setEmoji((x) => !x)}
              aria-label="表情"
              title="表情"
            >
              <Smile size={16} />
              {chat.unread > 0 && <span className="hud__badge num">{chat.unread}</span>}
            </button>
          )}
          <button className="hud__head-btn" onClick={onToggle} aria-label="收起或展开交互区">
            {dock === 'open' ? '收起' : '展开'}
            <ChevronDown size={14} className={`hud__chev ${dock !== 'open' ? 'is-up' : ''}`} />
          </button>
        </header>

        {emoji && online_ && (
          <div className="hud__emotes">
            {EMOTES.map((e) => (
              <button
                key={e}
                onClick={() => {
                  onEmote?.(e);
                  setEmoji(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}

        <div className="hud__cards">
          <SeatCard ctl={ctl} />
          <ScoreCard ctl={ctl} />
        </div>

        <div className="hud__chat">
          <ChatPanel
            tone="paper"
            messages={chat.messages}
            myId={chat.myId}
            onSend={chat.onSend}
            placeholder={
              ctl.mode === 'online'
                ? '说点什么…'
                : ctl.players.some((p) => p.ai?.on)
                  ? '和 AI 人机聊几句'
                  : '唤醒 AI 后电脑才会说话'
            }
          />
        </div>
      </div>
    </div>
  );
}
