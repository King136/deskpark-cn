import type { ChatMessage } from '@park/protocol';
import { EMOTES } from '@park/protocol';
import { ChevronDown, GripHorizontal, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { GameController } from '../lib/controller';
import { activeSeat, phaseText, seatCounts, seatScores, secondsLeft } from '../lib/hudFacts';
import { useOnline } from '../lib/online';
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
  /** 打开战绩面板（座位/积分详情都收在那里，交互区只留一行） */
  onStats?: () => void;
}

/** 一排座位：头像 + 名字 + 张数/分数，替代原来占半屏的两张卡 */
function SeatStrip({ ctl }: { ctl: GameController }) {
  const v = (ctl.view ?? {}) as Record<string, unknown>;
  const scores = seatScores(v);
  const counts = seatCounts(v);
  const turn = activeSeat(v);
  return (
    <div className="hud__seats" role="list">
      {ctl.players.map((p, i) => (
        <div
          key={i}
          role="listitem"
          className={`hud__seat${p.isMe ? ' is-me' : ''}${turn === i && !ctl.over ? ' is-turn' : ''}`}
        >
          <PixelAvatar avatar={p.avatar} name={p.name} size={26} />
          <span className="hud__seat-text">
            <b>{p.name}</b>
            <small>
              {!p.connected
                ? '掉线'
                : p.auto
                  ? '托管'
                  : counts
                    ? `${counts[i] ?? '—'} 张`
                    : scores
                      ? `${signed(scores[i] ?? 0)} 分`
                      : p.thinking
                        ? '思考中'
                        : '在座'}
            </small>
          </span>
          {p.isMe && <i className="hud__tag">我</i>}
        </div>
      ))}
    </div>
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
  onStats,
}: TableHudProps) {
  const online_ = useOnline();
  const onEmote = chat.onEmote;
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
          <span className={`hud__dot${turn != null && !ctl.over ? ' is-on' : ''}`} />
          <span className={`hud__head-note ${turn != null && !ctl.over ? 'is-turn' : ''}`}>
            {note}
          </span>
          {onStats && (
            <button className="hud__head-btn" onClick={onStats} aria-label="战绩" title="战绩">
              <Trophy size={15} />
            </button>
          )}
          {online_ && ctl.seat !== null && chat.unread > 0 && (
            <span className="hud__badge num" title="未读消息">{chat.unread}</span>
          )}
          <button className="hud__head-btn hud__head-btn--toggle" onClick={onToggle} aria-label="收起或展开交互区">
            {dock === 'open' ? '收起' : '展开'}
            <ChevronDown size={14} className={`hud__chev ${dock !== 'open' ? 'is-up' : ''}`} />
          </button>
        </header>

        {online_ && (
          <div className="hud__emotes" aria-label="快捷表情">
            {EMOTES.map((e) => (
              <button key={e} onClick={() => onEmote?.(e)} title={`发送 ${e}`}>
                {e}
              </button>
            ))}
          </div>
        )}

        <SeatStrip ctl={ctl} />

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
