import { getGame } from '@park/engine';
import { Bot, Check, ChevronLeft, Copy, Crown, Link2, Plus, UserMinus, X } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { ChatPanel } from '../components/Chat';
import { MyScoreCard, RoomScoreTable } from '../components/ScoreBoard';
import { Avatar } from '../components/Seat';
import { Button, IconButton, Sheet, toast } from '../components/ui';
import { getGameUI } from '../games';
import { useOnlineController } from '../lib/controller';
import { online, useOnline } from '../lib/online';
import { currentHost, hostAvailable, subscribeHost } from '../lib/localHost';
import { httpOrigin } from '../lib/discover';
import { copyText, serverLabel, serverUrl, setServerOverride } from '../lib/platform';
import { inviteText, navigate } from '../lib/router';
import { profile } from '../lib/store';
import { fetchRoomPack, savePack } from '../lib/takeover';
import { OptionsForm, PlayerCountField } from './SetupSheet';
import { TableShell } from './TableShell';
import './room.css';

/**
 * 房间快照缓存：每 15 秒向主机要一份完整快照存到本机。
 * 房主设备下线后，任何成员设备都能凭这份缓存把牌局接过来（自接棒）。
 */
function useRoomPackCache(code: string | null, status: string) {
  useEffect(() => {
    if (!code || status !== 'open') return;
    const origin = httpOrigin(serverUrl());
    const pull = () => {
      void fetchRoomPack(origin, code).then((pack) => {
        if (pack) savePack(pack);
      });
    };
    pull();
    const timer = setInterval(pull, 15_000);
    return () => clearInterval(timer);
  }, [code, status]);
}

export function OnlineRoom({ code }: { code: string }) {
  const net = useOnline();
  const ctl = useOnlineController();
  const creating = code === 'NEW';
  const roomCode = net.room?.code ?? (creating ? null : code);
  useRoomPackCache(roomCode, net.status);

  useEffect(() => {
    online.connect();
    if (!creating) online.send({ t: 'join', code });
  }, [code, creating]);

  useEffect(() => {
    if (creating && net.room) navigate(`/room/${net.room.code}`, true);
  }, [creating, net.room]);

  const room = net.room && (creating || net.room.code === code) ? net.room : null;
  const notFound = !room && net.error && /不存在/.test(net.error.message);

  if (!room) {
    const offline = net.status === 'offline';
    return (
      <div className="room-state">
        {notFound ? (
          <>
            <h2>房间 {code} 不存在</h2>
            <p>可能已经解散，或房间号输入有误。确认房主还在同一 Wi-Fi、或让房主重开一次。</p>
            <Button variant="primary" onClick={() => navigate('/')}>
              返回大厅
            </Button>
          </>
        ) : (
          <>
            <div className="spinner" />
            <p>
              {offline
                ? `连不上 ${serverLabel()}，房间 ${code} 还在这台设备的名下`
                : net.status === 'reconnecting'
                  ? '正在重新连接…'
                  : creating
                    ? '正在创建房间…'
                    : `正在进入房间 ${code}…`}
            </p>
            {offline && (
              <p className="room-state__note">
                {net.rescue
                  ? net.rescue.target
                    ? `已在局域网找到接棒主机 ${net.rescue.target}，正在切过去…`
                    : '正在局域网里寻找持有这间房的主机…'
                  : '如果是房主的设备下线了，同一 Wi-Fi 里任何装了闲亭的设备都可以在牌桌上「接管牌局」。'}
              </p>
            )}
            <div className="room-state__ops">
              {offline && <Button onClick={() => online.reconnectNow()}>重试</Button>}
              <Button variant="ghost" onClick={() => navigate('/')}>
                返回大厅
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  const def = getGame(room.gameId)!;
  const ui = getGameUI(room.gameId)!;
  if (room.status !== 'waiting' && ctl) {
    return (
      <TableShell ctl={ctl} title={def.meta.name}>
        <Suspense fallback={<div className="loading on-felt">正在摆牌…</div>}>
          <ui.Board ctl={ctl} />
        </Suspense>
      </TableShell>
    );
  }
  return <WaitingRoom />;
}

function WaitingRoom() {
  const net = useOnline();
  const room = net.room!;
  const you = net.you!;
  const def = getGame(room.gameId)!;
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  /** 浏览器不允许自动复制时，把内容放进输入框让玩家手动复制 */
  const [manual, setManual] = useState<{ what: 'code' | 'link'; text: string } | null>(null);
  /** 本机正在当主机：把朋友该填的地址亮出来 */
  const [host, setHost] = useState(() => currentHost());
  useEffect(() => subscribeHost(setHost), []);
  const isHost = you.isHost;
  const filled = room.seats.filter((s) => s.kind !== 'empty').length;

  const copy = async (what: 'code' | 'link') => {
    const myName =
      (you.seat !== null ? room.seats[you.seat]?.name : undefined) ?? profile.get().name;
    const text =
      what === 'code'
        ? room.code
        : inviteText({
            from: myName,
            game: def.meta.name,
            code: room.code,
            open: room.seats.filter((s) => s.kind === 'empty').length,
          });
    const ok = await copyText(text);
    if (ok) {
      setCopied(what);
      toast(what === 'code' ? `已复制房间号 ${room.code}` : '已复制邀请，发给好友就能加入');
      setTimeout(() => setCopied(null), 1600);
    } else {
      setManual({ what, text });
    }
  };

  const leave = () => {
    online.send({ t: 'leave' });
    navigate('/');
  };

  return (
    <div className="room">
      <header className="room__top">
        <IconButton label="离开房间" onClick={leave}>
          <ChevronLeft size={22} />
        </IconButton>
        <div className="room__title">
          <span>{def.meta.name}</span>
          <small>等待开局</small>
        </div>
        <span style={{ width: 38 }} />
      </header>

      <section className="room__code">
        <span className="room__label">房间号</span>
        <button className="room__digits" onClick={() => copy('code')} aria-label="复制房间号">
          {room.code.split('').map((ch, i) => (
            <i key={i}>{ch}</i>
          ))}
        </button>
        <div className="room__share">
          <Button size="sm" onClick={() => copy('code')}>
            {copied === 'code' ? <Check size={14} /> : <Copy size={14} />} 复制房间号
          </Button>
          <Button size="sm" onClick={() => copy('link')}>
            {copied === 'link' ? <Check size={14} /> : <Link2 size={14} />} 复制邀请链接
          </Button>
        </div>
        <p className="room__via">
          在 <b>{serverLabel()}</b> 上 · 同一 Wi-Fi 的朋友在大厅输入房间号即可自动找到这桌
        </p>
        {host.running && host.addresses[0] && (
          <p className="room__via room__via--host">
            本机正在当主机，朋友手填地址可用 <b>{host.addresses[0]}</b>
          </p>
        )}
      </section>

      <section className="room__seats">
        {room.seats.map((s, i) => {
          const mine = i === you.seat;
          return (
            <div key={i} className={`rseat is-${s.kind} ${mine ? 'is-mine' : ''}`}>
              {s.kind === 'empty' ? (
                <>
                  <span className="rseat__empty">空位</span>
                  <div className="rseat__ops">
                    {isHost && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => online.send({ t: 'bot', seat: i, add: true })}
                      >
                        <Plus size={14} /> 电脑
                      </Button>
                    )}
                    {!isHost || you.seat === null ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => online.send({ t: 'sit', seat: i })}
                      >
                        坐这里
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => online.send({ t: 'sit', seat: i })}
                      >
                        换到这
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Avatar name={s.name ?? '?'} avatar={s.avatar} size={40} />
                  <div className="rseat__who">
                    <strong>
                      {s.name}
                      {mine && <em>你</em>}
                    </strong>
                    <span>
                      {s.kind === 'bot' ? (
                        <>
                          <Bot size={12} /> 电脑
                        </>
                      ) : s.playerId === room.hostId ? (
                        <>
                          <Crown size={12} /> 房主
                        </>
                      ) : s.connected === false ? (
                        '离线'
                      ) : (
                        '已就位'
                      )}
                    </span>
                  </div>
                  {isHost && !mine && (
                    <IconButton
                      label={s.kind === 'bot' ? '移除电脑' : '请出座位'}
                      onClick={() => online.send({ t: 'bot', seat: i, add: false })}
                    >
                      {s.kind === 'bot' ? <X size={16} /> : <UserMinus size={16} />}
                    </IconButton>
                  )}
                </>
              )}
              <span className="rseat__no">{i + 1}</span>
            </div>
          );
        })}
      </section>

      <section className="room__chat">
        <h3>
          房间聊天<small>{net.chat.filter((m) => m.kind === 'user').length} 条消息</small>
        </h3>
        <div className="room__chatbox">
          <ChatPanel
            messages={net.chat}
            myId={net.playerId}
            onSend={(text) => online.send({ t: 'chat', text })}
            autoFocus
            emotesPinned
            placeholder="和房间里的人打个招呼…"
          />
        </div>
      </section>

      <section className="room__scores">
        <RoomScoreTable
          rows={net.roomScores}
          unit={net.matchScore?.unit ?? '分'}
          title="这一桌的娱乐分"
        />
        <MyScoreCard summary={net.myScore} />
      </section>

      <section className="room__options">
        <h3>
          对局设置<small>{isHost ? '房主可修改' : '仅房主可修改'}</small>
        </h3>
        <PlayerCountField
          def={def}
          value={room.seats.length}
          disabled={!isHost}
          onChange={(n) => online.send({ t: 'configure', seats: n })}
        />
        <OptionsForm
          def={def}
          options={room.options}
          disabled={!isHost}
          onChange={(o) => online.send({ t: 'configure', options: o })}
        />
      </section>

      <footer className="room__foot">
        {isHost ? (
          <>
            <Button variant="primary" size="lg" block onClick={() => online.send({ t: 'start' })}>
              开始对局
            </Button>
            <small>
              {filled < room.seats.length
                ? `还有 ${room.seats.length - filled} 个空位，开局时将由电脑补齐`
                : '人已到齐'}
              {room.spectators > 0 ? ` · ${room.spectators} 人观战` : ''}
            </small>
          </>
        ) : (
          <div className="room__wait">
            <div className="spinner small" /> 等待房主开始…
          </div>
        )}
      </footer>
      <Sheet
        open={!!manual}
        onClose={() => setManual(null)}
        title={manual?.what === 'code' ? '复制房间号' : '复制邀请链接'}
        subtitle="浏览器不允许网页自动复制（通常是因为页面不是 HTTPS），请长按或选中下面的内容手动复制"
        footer={
          <Button variant="primary" block onClick={() => setManual(null)}>
            好的
          </Button>
        }
      >
        <textarea
          className="room__manual"
          readOnly
          rows={manual?.what === 'link' ? 4 : 1}
          value={manual?.text ?? ''}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.currentTarget.select()}
        />
      </Sheet>
    </div>
  );
}
