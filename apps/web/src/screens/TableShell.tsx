import type { ChatMessage } from '@park/protocol';
import { cleanChatText } from '@park/protocol';
import {
  BookOpen,
  Bot,
  ChevronLeft,
  RotateCw,
  Palette,
  Trophy,
  UserPlus,
  Volume2,
  VolumeX,
  WifiOff,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { MatchScoreCard, MyScoreCard, RoomScoreTable } from '../components/ScoreBoard';
import { TableHud } from '../components/TableHud';
import { ResultOverlay } from '../components/ResultOverlay';
import { callout } from '../lib/callout';
import { narrate, type Narration } from '../lib/actionNarrator';
import { SeatPlaysContext, type SeatPlayMap } from '../lib/seatPlays';
import { syncBarColor } from '../lib/barcolor';
import { Button, Sheet, toast } from '../components/ui';
import { replyChat } from '../lib/ai/agent';
import { aiEvents, aiSpeech } from '../lib/ai/events';
import { aiReady } from '../lib/ai/settings';
import { characterName } from '../lib/ai/turn';
import type { GameController } from '../lib/controller';
import {
  attachHostBridge,
  hasNativeOrientation,
  initialChrome,
  installHostApi,
  notifyHost,
  onHostChrome,
} from '../lib/host';
import { online, useOnline } from '../lib/online';
import { currentHost, hostAvailable, localWsUrl, startHost } from '../lib/localHost';
import { canTakeover, seedHostPersist } from '../lib/takeover';
import { setServerOverride } from '../lib/platform';
import { playSound } from '../lib/sound';
import { settings } from '../lib/store';
import { SettingsSheet } from './SettingsSheet';

const LAST_SOUND: Record<string, Parameters<typeof playSound>[0]> = {
  play: 'play',
  choose: 'play',
  pass: 'pass',
  fold: 'pass',
  check: 'pass',
  bid: 'select',
  call: 'chip',
  raise: 'chip',
  allin: 'chip',
  return: 'play',
  discard: 'play',
  exchange: 'deal',
  que: 'select',
};

const LOCAL_ID = 'local-me';
/** 交互区收起到"只留信息头"时的高度 */
const PEEK = 56;

type DockState = 'open' | 'peek' | 'hidden';

export function TableShell({
  ctl,
  title,
  children,
}: {
  ctl: GameController;
  title: string;
  children: ReactNode;
}) {
  const s = settings.use();
  const [rules, setRules] = useState(false);
  const [look, setLook] = useState(false);
  const [stats, setStats] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  /** 已经关掉结算卡的局号 */
  const [dismissedScore, setDismissedScore] = useState(0);
  const net = useOnline();
  const online_ = ctl.mode === 'online';

  /* 逐手动作播报：完整动作写入聊天留痕；每个座位的最新一手展示在头像下方 */
  const [actionLog, setActionLog] = useState<ChatMessage[]>([]);
  const [seatPlays, setSeatPlays] = useState<SeatPlayMap>({});
  const actionSeq = useRef(0);

  /* ---------------- 宿主交权 / 屏幕旋转 ---------------- */
  /** 工具条与交互区是否由本页自己画；宿主可用 postMessage 关掉 */
  const [chrome, setChrome] = useState(initialChrome);
  /** 顺时针旋转：0=原本，1=顺时针 90°，2=180°，3=270°；每点一次 +90° */
  const [turns, setTurns] = useState(0);
  /** 物理视口尺寸（跟随设备方向） */
  const [vp, setVp] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  /** 旋转后画面逻辑上是横是竖：奇数档位把屏幕宽高对调 */
  const landscape = turns % 2 === 1 ? vp.h > vp.w : vp.w > vp.h;

  useEffect(() => attachHostBridge(), []);
  // 牌桌顶栏是绒布渐变：进入/切换桌布/旋转后都把同一种颜色刷到状态栏
  useEffect(() => {
    const hs = [0, 160, 560].map((d) => window.setTimeout(() => syncBarColor(), d));
    return () => hs.forEach((h) => window.clearTimeout(h));
  }, [s.felt, turns]);
  useEffect(() => onHostChrome(setChrome), []);
  useEffect(() => {
    installHostApi({
      setChrome: (tools, dock) => setChrome({ tools, dock }),
      // 宿主想要某个方向：直接换档位，比锁系统方向更可控
      setOrientation: (mode) => setTurns(mode === 'landscape' ? 1 : 0),
      notify: notifyHost,
    });
    notifyHost({ type: 'ready', host: hasNativeOrientation() ? 'native' : 'web' });
  }, []);

  /* ---------------- 交互区：三态 + 拖动 ---------------- */
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [body, setBody] = useState({ w: 0, h: 0 });
  // 聊天交互区默认展开（含输入框与常驻表情），玩家可向上/下拖动调整高度
  const [dock, setDock] = useState<DockState>('open');
  const [dragPx, setDragPx] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setBody({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** 交互区展开后的尺寸：竖屏上限 268px（约屏高 1/3），横屏按 1/3 宽；
      默认只露出 56px 信息头，牌桌因此能多拿回 200px 左右的可视高度 */
  const fullPx = landscape
    ? Math.min(360, body.w / 3)
    : Math.min(268, Math.max(196, body.h * 0.3));
  const peekPx = landscape ? 96 : PEEK;
  /** 宿主把交互区收走后，牌桌独占整块 */
  const dockPx = !chrome.dock
    ? 0
    : (dragPx ?? (dock === 'open' ? fullPx : dock === 'peek' ? peekPx : 0));

  const onGrab = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (fullPx <= 0) return;
    const startPos = landscape ? e.clientX : e.clientY;
    const st = { startPos, base: dockPx, lastPx: dockPx, lastT: performance.now(), v: 0 };
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const cur = landscape ? ev.clientX : ev.clientY;
      // 向上（竖屏）/ 向左（横屏）拖 = 交互区变大
      const next = Math.max(0, Math.min(fullPx, st.base + (st.startPos - cur)));
      const now = performance.now();
      const dt = now - st.lastT;
      if (dt > 0) st.v = (next - st.lastPx) / dt;
      st.lastPx = next;
      st.lastT = now;
      setDragPx(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDragging(false);
      setDragPx(null);
      const px = st.lastPx;
      const v = st.v;
      const order: Array<{ at: number; state: DockState }> = [
        { at: 0, state: 'hidden' },
        { at: peekPx, state: 'peek' },
        { at: fullPx, state: 'open' },
      ];
      // 甩得够快就沿速度方向跳到相邻档
      if (Math.abs(v) > 0.45) {
        const target =
          v > 0
            ? [...order].reverse().find((o) => o.at > px + 1)
            : order.find((o) => o.at < px - 1);
        if (target) return setDock(target.state);
      }
      let best = order[0];
      for (const o of order) if (Math.abs(px - o.at) < Math.abs(px - best.at)) best = o;
      setDock(best.state);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const toggleDock = () => setDock((d) => (d === 'open' ? 'peek' : 'open'));

  /* 牌桌铺满画面区（不含交互区）的两种做法：
     竖屏：高度够，直接重排进上方 2/3，元素自然变大；
     横屏：手机高度矮（约 340），重排会把出牌区挤出画面，所以按宽度定缩放系数，
           再用"缩放后能占满的高度"当画布高度，等比缩放后正好铺满左侧 2/3。 */
  /* 牌桌铺满画面区（不含交互区）：
     先按"受限的那一轴"算缩放系数——竖屏是高度、横屏是宽度；
     另一轴的画布按比例放大，缩回来正好铺满，既不留黑边，也不会因为空间变小把座位排挤到一起。
     画布永远不窄于原来的设计尺寸，所以 12 个玩法都不会重叠或被裁切。 */
  /** 交互区收起时，牌桌左上角的出牌提示（原生壳交权时也留着，玩家才不会漏拍） */
  const turnView = (ctl.view ?? {}) as Record<string, unknown>;
  const turnSeat = typeof turnView.turn === 'number' ? (turnView.turn as number) : null;
  const turnName =
    turnSeat != null
      ? `${ctl.players[turnSeat]?.name ?? `${turnSeat + 1} 号位`}${ctl.seat === turnSeat ? '（你）' : ''}`
      : null;
  const turnHand = Array.isArray(turnView.handCounts)
    ? (turnView.handCounts as number[])[turnSeat ?? 0]
    : Array.isArray(turnView.counts)
      ? (turnView.counts as number[])[turnSeat ?? 0]
      : null;
  // 信息头已经写着轮到谁；只有交互区完全收起时才用悬浮提示条补位
  const showTurnRibbon = (!chrome.dock || dock === 'hidden') && !ctl.over && turnName != null;

  /** 收起态顶部给"轮到谁"留一条 28px 窄带（舞台整体下移，永不压到牌桌内容） */
  const TOP_PAD = showTurnRibbon ? 28 : 0;
  const availW = landscape ? Math.max(0, body.w - dockPx) : body.w;
  const availH = landscape
    ? Math.max(0, body.h - TOP_PAD)
    : Math.max(0, body.h - dockPx - TOP_PAD);
  let stageStyle: React.CSSProperties;
  if (body.w > 0 && body.h > 0) {
    // 竖屏：先按"舒适高度"给画布，再只缩到刚好放进剩余空间，避免把牌面缩得太小
    const COMFORT_H = 640;
    const k = landscape
      ? availW / body.w
      : Math.min(1, availH / COMFORT_H);
    const canvasW = landscape ? body.w : k > 0 ? availW / k : availW;
    const canvasH = k > 0 ? availH / k : availH;
    stageStyle = {
      width: canvasW,
      height: canvasH,
      top: TOP_PAD,
      transform: `scale(${k})`,
      transformOrigin: 'top left',
    };
  } else {
    stageStyle = { width: '100%', height: '100%', top: TOP_PAD };
  }

  /* ---------------- 聊天 ---------------- */
  const [localChat, setLocalChat] = useState<ChatMessage[]>([]);
  // 动作留痕与用户聊天合并：动作是 system 消息，排在对应时刻之后
  const chatMessages = online_ ? [...net.chat, ...actionLog] : [...localChat, ...actionLog];
  const myChatId = online_ ? net.playerId : LOCAL_ID;
  const ctlRef = useRef(ctl);
  ctlRef.current = ctl;
  const pushLocal = (seat: number, text: string) => {
    const p = ctlRef.current.players[seat];
    if (!p) return;
    setLocalChat((list) => [
      ...list.slice(-59),
      {
        id: (list.at(-1)?.id ?? 0) + 1,
        kind: 'user',
        text: cleanChatText(text),
        at: Date.now(),
        name: p.name,
        avatar: p.avatar,
        playerId: p.isMe ? LOCAL_ID : `bot-${seat}`,
        seat,
      },
    ]);
  };
  const aiBots = ctl.players.flatMap((p, i) => (p.ai?.on ? [i] : []));
  const sendChat = (text: string) => {
    if (online_) {
      online.send({ t: 'chat', text });
      return;
    }
    pushLocal(ctl.seat ?? 0, text);
    // 有 AI 人机时，挑一位回话（点名优先）
    if (!aiBots.length || !aiReady()) return;
    const named = aiBots.find((i) => text.includes(ctl.players[i].name));
    const seat = named ?? aiBots[Math.floor(Math.random() * aiBots.length)];
    if (named === undefined && Math.random() < 0.25) return;
    const p = ctl.players[seat];
    const recent = [...localChat.slice(-6), { name: ctl.players[ctl.seat ?? 0].name, text }].map(
      (m) => ({
        name: 'name' in m ? (m.name ?? '?') : '?',
        text: m.text,
      }),
    );
    replyChat(ctl.def.meta.name, { name: p.name, character: characterName(p.avatar) }, recent)
      .then((reply) => {
        if (!reply) return;
        pushLocal(seat, reply);
        aiSpeech.say(seat, reply);
      })
      .catch(() => {});
  };
  // AI 事件：发言写进聊天记录；出错时提示（同类提示 20 秒内只出现一次）
  const lastErr = useRef(0);
  useEffect(() => {
    if (online_) return;
    return aiEvents.on((e) => {
      if (e.type === 'say') pushLocal(e.seat, e.text);
      else if (e.type === 'needConfig') {
        toast('先在「外观 → AI 人机」里填写接口地址和 Key');
        setLook(true);
      } else if (e.type === 'error' && Date.now() - lastErr.current > 20_000) {
        lastErr.current = Date.now();
        toast(`AI 出错：${e.message}，这一步由规则电脑代打`, 'error');
      }
    });
  }, [online_]);

  const lastChatId = chatMessages.at(-1)?.id ?? 0;
  // 交互区露出时聊天内容直接可见，视为已读
  const [seenChat, setSeenChat] = useState(lastChatId);
  useEffect(() => {
    if (dock === 'open') setSeenChat(lastChatId);
  }, [dock, lastChatId]);
  const incoming = chatMessages.filter(
    (m) => m.kind === 'user' && m.id > seenChat && m.playerId !== myChatId,
  );
  // 新消息提示音
  const chatSound = useRef(lastChatId);
  useEffect(() => {
    if (lastChatId > chatSound.current && incoming.length) playSound('select');
    chatSound.current = lastChatId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastChatId]);

  // 动作音效 + 逐手播报（同一动作只处理一次）
  const lastKey = useRef('');
  useEffect(() => {
    if (!ctl.last) return;
    const key = `${ctl.version}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    const snd = LAST_SOUND[ctl.last.type];
    if (snd) playSound(snd);

    // 从 view 提取公开的最近一手，生成可读文案：写入聊天留痕 + 更新该座位的"本手"展示
    const n: Narration | null = narrate(ctl);
    if (!n) return;
    if (n.seat != null && n.seat >= 0) {
      setSeatPlays((prev) => ({
        ...prev,
        [n.seat!]: {
          label: n.label ?? n.short,
          cards: n.cards,
          notation: n.notation,
          version: ctl.version,
        },
      }));
    }
    setActionLog((list) => [
      ...list.slice(-39),
      {
        id: -100000 - ++actionSeq.current,
        kind: 'system',
        text: n.text,
        at: Date.now(),
        seat: n.seat,
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl.version, ctl.last]);

  // 新开一局（版本回退到 1）时清空上一局各座位的本手展示
  const prevVersion = useRef(ctl.version);
  useEffect(() => {
    if (ctl.version < prevVersion.current) setSeatPlays({});
    prevVersion.current = ctl.version;
  }, [ctl.version]);

  const onBack = () => {
    if (ctl.mode === 'online' && !ctl.over) setConfirmLeave(true);
    else ctl.leave();
  };

  const invite = async () => {
    const code = net.room?.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast(`房号 ${code} 已复制，发给朋友即可加入`);
    } catch {
      toast(`房号 ${code}，发给朋友即可加入`);
    }
  };

  const [bursts, setBursts] = useState<{ emote: string; name: string; at: number }[]>([]);
  const burstTimers = useRef<Set<number>>(new Set());
  useEffect(() => () => {
    // 卸载时清理未触发的表情动画定时器，避免离桌后仍 setState（L5）
    burstTimers.current.forEach((h) => window.clearTimeout(h));
    burstTimers.current.clear();
  }, []);
  const fireBurst = (emote: string, name: string) => {
    const at = Date.now();
    setBursts((b) => [...b, { emote, name, at }].slice(-3));
    const h = window.setTimeout(() => {
      burstTimers.current.delete(h);
      setBursts((b) => b.filter((x) => x.at !== at));
    }, 1800);
    burstTimers.current.add(h);
  };
  // 通用轮次播报：所有玩法都适用（掼蛋/德州/麻将/象棋等此前完全没有报牌）
  const turnCueSpoken = useRef('');
  useEffect(() => {
    const v = ctl.view as unknown as { turn?: number | null; over?: boolean } | null;
    if (!v || v.over || ctl.seat === null) return;
    const mine = v.turn === ctl.seat;
    const sig = mine ? `me:${(ctl as unknown as { round?: number }).round ?? ''}` : '';
    if (mine && turnCueSpoken.current !== sig) {
      turnCueSpoken.current = sig;
      callout('轮到你');
    } else if (!mine) {
      turnCueSpoken.current = '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl.view]);

  const offline = ctl.mode === 'online' && net.status !== 'open';
  const emotes = ctl.mode === 'online' ? net.emotes.filter((e) => Date.now() - e.at < 3500) : [];

  /** 自接棒：房主设备下线后，把牌局连人一起搬到本机来当主机 */
  const takeOver = async () => {
    const code = net.room?.code;
    if (!code) return;
    if (!canTakeover(code)) {
      toast('本机没有这间房的快照，接不了棒；让打过这局的设备来接管', 'error');
      return;
    }
    seedHostPersist(code);
    try {
      if (!currentHost().running) await startHost(8787);
    } catch (e) {
      toast(`开主机失败：${(e as Error).message}`, 'error');
      return;
    }
    setServerOverride(localWsUrl(currentHost().port));
    toast(`牌局已接到本机，房号 ${code} 不变，其他设备会自动连过来`);
    online.reconnectNow();
    online.send({ t: 'join', code });
  };

  return (
    <div
      className={`table ${landscape ? 'is-landscape' : 'is-portrait'} ${
        dragging ? 'is-grabbing' : ''
      } is-turn-${turns}`}
      data-felt={s.felt}
    >
      {chrome.tools && (
      <header className="table__top">
        <div className="table__tools">
          <div className="tool-identity">
            <button className="tool-identity__back" onClick={onBack} aria-label="回大厅" title="返回大厅">
              <ChevronLeft size={21} strokeWidth={2.4} />
            </button>
            <div className="tool-identity__text" title={title}>
              <span className="tool-identity__name">{title}</span>
              {online_ && net.room && <em className="tool-identity__code">{net.room.code}</em>}
            </div>
          </div>
          <div className="table__tools-gap" />
          <div className="tool-row">
            <button
              className="tool"
              onClick={() => setLook(true)}
              aria-label="牌面与桌布"
              title="牌面与桌布"
            >
              <Palette size={18} />
            </button>
            {ctl.seat !== null && !ctl.over && (
              <button
                className={`tool ${ctl.auto ? 'is-on' : ''}`}
                onClick={() => ctl.setAuto(!ctl.auto)}
                aria-label={ctl.auto ? '取消托管' : '托管'}
                title={ctl.auto ? '取消托管' : '托管'}
              >
                <Bot size={18} />
              </button>
            )}
            {online_ && net.room && (
              <button
                className="tool"
                onClick={() => void invite()}
                aria-label="邀请牌友"
                title={`邀请牌友（房号 ${net.room.code}）`}
              >
                <UserPlus size={18} />
              </button>
            )}
            <button className="tool" onClick={() => setStats(true)} aria-label="战绩" title="战绩 · 娱乐分">
              <Trophy size={18} />
            </button>
            <button className="tool" onClick={() => setRules(true)} aria-label="规则" title="规则">
              <BookOpen size={18} />
            </button>
            <button
              className="tool"
              onClick={() => setTurns((t) => (t + 1) % 4)}
              aria-label="旋转"
              title={turns % 2 === 1 ? '转回竖屏' : '转横屏'}
            >
              <RotateCw size={17} style={{ transform: `rotate(${turns * 90}deg)` }} />
            </button>
            <button
              className={`tool ${s.sound ? '' : 'is-off'}`}
              onClick={() => settings.set({ sound: !s.sound })}
              aria-label={s.sound ? '静音' : '打开音效'}
              title={s.sound ? '静音' : '打开音效'}
            >
              {s.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          </div>
        </div>
      </header>
      )}

      <div className="table__body" ref={bodyRef}>
        {ctl.auto && (
          <div className="auto-banner">
            <Bot size={15} /> 托管中，电脑正在替你出牌
            <button onClick={() => ctl.setAuto(false)}>取消托管</button>
          </div>
        )}
        {offline && (
          <div className="net-banner">
            <WifiOff size={15} />{' '}
            {net.status === 'offline' ? '与房主的连接断了' : '正在重新连接…'}
            {net.status === 'offline' && net.rescue && (
              <em className="net-banner__rescue">
                {net.rescue.target
                  ? `找到接棒主机 ${net.rescue.target}，正在切过去…`
                  : '正在局域网里寻找持有这间房的主机…'}
              </em>
            )}
            {net.status === 'offline' && (
              <>
                <button onClick={() => online.reconnectNow()}>重试</button>
                {hostAvailable() && net.room && (
                  <button
                    className="net-banner__takeover"
                    onClick={() => void takeOver()}
                    disabled={!canTakeover(net.room!.code)}
                    title={
                      canTakeover(net.room!.code)
                        ? '把牌局接到本机继续当主机'
                        : '本机没有这间房的快照'
                    }
                  >
                    接管牌局
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <main className="board">
          {showTurnRibbon && (
            <div className="turn-ribbon" role="status" aria-live="polite">
              <i className="turn-ribbon__dot" />
              <span className="turn-ribbon__text">
                轮到 <b>{turnName}</b>
              </span>
              {turnHand != null && <small>{turnHand} 张</small>}
            </div>
          )}
          <div className="board__stage" style={stageStyle}>
            <SeatPlaysContext.Provider value={seatPlays}>{children}</SeatPlaysContext.Provider>
          </div>
        </main>

        {chrome.dock && (
        <TableHud
          ctl={ctl}
          dock={dock}
          vertical={!landscape}
          sizePx={dockPx}
          chat={{
            messages: chatMessages,
            myId: myChatId,
            onSend: sendChat,
            onEmote: (emote) => {
              fireBurst(emote, ctl.players[ctl.seat ?? 0]?.name ?? '');
              pushLocal(ctl.seat ?? 0, emote);
              if (online_ && net.status === 'open') online.send({ t: 'emote', emote });
            },
            unread: dock === 'open' ? 0 : incoming.length,
          }}
          onToggle={toggleDock}
          onGrab={onGrab}
          onStats={() => setStats(true)}
        />
        )}
      </div>

      {chrome.dock && dock === 'hidden' && (
        <button
          className="dock-summon"
          onClick={() => setDock('open')}
          aria-label="展开交互区"
          title="展开交互区"
        >
          <ChevronLeft size={20} style={{ rotate: '180deg' }} />
        </button>
      )}

      {ctl.over && <ResultOverlay ctl={ctl} />}

      <div className="emote-layer">
        {[...emotes, ...bursts].map((e) => {
          // 每条表情在画布上炸开 7 个方向，位置由时间戳散列，保证每次都不同
          const seed = e.at % 97;
          return (
            <div key={e.at + e.name} className="emote-burst">
              {Array.from({ length: 7 }, (_, i) => {
                const a = ((seed + i * 51) % 360) * (Math.PI / 180);
                const r = 26 + ((seed + i * 13) % 40);
                return (
                  <span
                    key={i}
                    className="emote-spark"
                    style={
                      {
                        '--x': `${Math.cos(a) * r}vmin`,
                        '--y': `${Math.sin(a) * r - 8}vmin`,
                        '--r': `${((seed + i * 29) % 60) - 30}deg`,
                        '--d': `${i * 60}ms`,
                        '--s': `${0.9 + ((seed + i * 7) % 5) / 10}`,
                      } as React.CSSProperties
                    }
                  >
                    {e.emote}
                  </span>
                );
              })}
              <small className="emote-who">{e.name}</small>
            </div>
          );
        })}
      </div>

      {online_ && net.matchScore && net.matchScore.matchNo !== dismissedScore && (
        <div className="table__scorecard">
          <MatchScoreCard
            match={net.matchScore}
            seat={ctl.seat}
            onDismiss={() => setDismissedScore(net.matchScore?.matchNo ?? 0)}
          />
        </div>
      )}

      <Sheet open={rules} onClose={() => setRules(false)} title={`${ctl.def.meta.name} · 规则`} wide>
        <ol className="rules-list">
          {ctl.def.meta.rules.map((r: string, i: number) => (
            <li key={i}>{r}</li>
          ))}
        </ol>
      </Sheet>

      <Sheet open={stats} onClose={() => setStats(false)} title="牌友战绩" wide>
        {online_ ? (
          <>
            <RoomScoreTable rows={net.roomScores} title="本房娱乐分" />
            <MyScoreCard summary={net.myScore} />
          </>
        ) : (
          <>
            <p className="ready-note">单人练习不计娱乐分，联机对局才会记录。</p>
            <MyScoreCard summary={null} />
          </>
        )}
      </Sheet>

      <SettingsSheet open={look} onClose={() => setLook(false)} />

      <Sheet
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="离开对局？"
        subtitle="离开后你的座位将由电脑接替，对局会继续进行。"
        footer={
          <>
            <Button onClick={() => setConfirmLeave(false)}>再想想</Button>
            <Button variant="danger" onClick={() => ctl.leave()}>
              离开
            </Button>
          </>
        }
      />
    </div>
  );
}
