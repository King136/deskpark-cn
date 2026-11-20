import type { ChatMessage } from '@park/protocol';
import { CHAT_MAX_LENGTH, QUICK_PHRASES } from '@park/protocol';
import { MessageSquareText, SendHorizontal, Smile } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PixelAvatar } from './pixel/PixelAvatar';
import './chat.css';

/** 牌局常用表情：一屏放得下（6×3），点击即发 */
export const CHAT_EMOTES = [
  '😄', '😂', '🤔', '😮', '😅', '🥳',
  '👍', '👏', '🤝', '💪', '🙏', '🫡',
  '🎉', '🏆', '🔥', '💥', '🍀', '🍻',
  '🀄', '♠️', '♥️', '♣️', '♦️', '🃏',
];

function timeText(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ChatBubble({ m, mine }: { m: ChatMessage; mine: boolean }) {
  if (m.kind === 'system') {
    return (
      <div className="chat-msg is-system">
        <span>{m.text}</span>
      </div>
    );
  }
  return (
    <div className={`chat-msg ${mine ? 'is-mine' : ''}`} title={timeText(m.at)}>
      <PixelAvatar avatar={m.avatar} name={m.name ?? '?'} size={28} />
      <div className="chat-msg__body">
        {!mine && (
          <span className="chat-msg__name">
            {m.name}
            {m.seat == null && <em>观战</em>}
          </span>
        )}
        <span className="chat-msg__text">{m.text}</span>
      </div>
    </div>
  );
}

export function ChatPanel({
  messages,
  myId,
  onSend,
  tone = 'paper',
  autoFocus,
  placeholder = '说点什么…',
}: {
  messages: ChatMessage[];
  myId: string | null;
  onSend: (text: string) => void;
  tone?: 'paper' | 'felt';
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const [quick, setQuick] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastId = messages.at(-1)?.id ?? 0;

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setDraft('');
    setQuick(false);
    setEmoteOpen(false);
  };

  return (
    <div className={`chat tone-${tone}`}>
      <div className="chat__list" ref={listRef} aria-live="polite">
        {messages.length === 0 && <div className="chat__empty">还没有人说话，打个招呼吧</div>}
        {messages.map((m) => (
          <ChatBubble key={m.id} m={m} mine={!!myId && m.playerId === myId} />
        ))}
      </div>
      {quick && (
        <div className="chat__quick">
          {QUICK_PHRASES.map((p) => (
            <button key={p} onClick={() => send(p)}>
              {p}
            </button>
          ))}
        </div>
      )}
      {emoteOpen && (
        <div className="chat__emotes">
          {CHAT_EMOTES.map((e) => (
            <button key={e} onClick={() => send(e)} aria-label={`发送 ${e}`}>
              {e}
            </button>
          ))}
        </div>
      )}
      <form
        className="chat__form"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <button
          type="button"
          className={`chat__icon ${emoteOpen ? 'is-on' : ''}`}
          aria-label="表情"
          title="表情"
          onClick={() => {
            setEmoteOpen((x) => !x);
            setQuick(false);
          }}
        >
          <Smile size={18} />
        </button>
        <button
          type="button"
          className={`chat__icon ${quick ? 'is-on' : ''}`}
          aria-label="快捷语"
          title="快捷语"
          onClick={() => {
            setQuick((x) => !x);
            setEmoteOpen(false);
          }}
        >
          <MessageSquareText size={18} />
        </button>
        <input
          ref={inputRef}
          value={draft}
          maxLength={CHAT_MAX_LENGTH}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label="聊天内容"
          enterKeyHint="send"
        />
        {draft.length > CHAT_MAX_LENGTH * 0.8 && (
          <span className="chat__count num">{CHAT_MAX_LENGTH - [...draft].length}</span>
        )}
        <button type="submit" className="chat__send" disabled={!draft.trim()} aria-label="发送">
          <SendHorizontal size={17} />
        </button>
      </form>
    </div>
  );
}
