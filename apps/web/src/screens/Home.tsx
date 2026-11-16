import type { AnyGame, GameCategory } from '@park/engine';
import { getGame } from '@park/engine';
import { normalizeRoomCode } from '@park/protocol';
import { ArrowRight, Blocks, Dice5, Gamepad2, Grid2x2, LayoutGrid, Play, Settings2, Sparkles, UserRound, Users } from 'lucide-react';
import type { CSSProperties, ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { PlayingCard } from '../components/PlayingCard';
import { PavilionMark } from '../components/Brand';
import { MahjongTile } from '../components/MahjongTile';
import { Avatar } from '../components/Seat';
import { Button, IconButton, toast } from '../components/ui';
import type { GameUI } from '../games';
import { GAME_UIS } from '../games';
import { clearSavedLocal, loadSavedLocal } from '../lib/controller';
import { online, useOnline } from '../lib/online';
import { currentHost, hostAvailable, startHost } from '../lib/localHost';
import { serverUrl, setServerOverride } from '../lib/platform';
import { scanLan, type FoundHost } from '../lib/discover';
import { navigate } from '../lib/router';
import { VERSION_TEXT } from '../lib/version';
import { profile } from '../lib/store';
import { markFreshStart } from './LocalGame';
import { SettingsSheet } from './SettingsSheet';

/** 玩法怎么组队，房号卡片上直接讲清楚，省得进去才发现没有搭档 */
const TEAM_NOTE: Record<string, string> = {
  doudizhu: '地主 vs 两位农民，不结固定搭档',
  guandan: '2v2 同桌，系统自动配队，可能与房主搭档',
  shengji: '对家是搭档，按座位配对',
  mahjong: '各自为战，四家独立计分',
  chess: '一对一，无搭档',
  gomoku: '一对一，无搭档',
};
import { SetupSheet } from './SetupSheet';
import './home.css';


const CATEGORIES: { id: GameCategory; title: string; note?: string }[] = [
  { id: 'poker', title: '扑克' },
  { id: 'mahjong', title: '麻将' },
  { id: 'chess', title: '棋类' },
  { id: 'board', title: '桌游' },
  { id: 'casual', title: '更多玩法', note: 'custom' },
];

function GameArt({ ui }: { ui: GameUI }) {
  if (ui.Art) {
    return (
      <div
        className="gtile__art"
        style={{ '--t1': ui.tint[0], '--t2': ui.tint[1] } as CSSProperties}
      >
        <ui.Art />
      </div>
    );
  }
  if (ui.tiles) {
    return (
      <div
        className="gtile__art"
        style={{ '--t1': ui.tint[0], '--t2': ui.tint[1] } as CSSProperties}
      >
        <div className="gtile__tiles">
          {ui.tiles.map((t, i) => (
            <MahjongTile
              key={t.id}
              tile={t}
              w="clamp(34px, 7vw, 46px)"
              style={{ '--i': i - 1 } as CSSProperties}
            />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="gtile__art" style={{ '--t1': ui.tint[0], '--t2': ui.tint[1] } as CSSProperties}>
      <div className="gtile__fan">
        {ui.showcase.map((c, i) => (
          <PlayingCard
            key={c.id}
            card={c}
            w="clamp(40px, 9vw, 58px)"
            wild={ui.wildIds?.includes(c.id)}
            style={{ '--i': i - (ui.showcase.length - 1) / 2 } as CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}

function GameTile({
  ui,
  def,
  onPick,
}: {
  ui: GameUI;
  def: AnyGame;
  onPick: (mode: 'local' | 'online') => void;
}) {
  return (
    <article className="gtile">
      <GameArt ui={ui} />
      <div className="gtile__body">
        <div className="gtile__head">
          <h3>{def.meta.name}</h3>
          <span className="gtile__people">
            <Users size={13} /> {ui.people}
          </span>
        </div>
        <p className="gtile__tagline">{def.meta.tagline}</p>
        <div className="gtile__actions">
          <Button variant="primary" size="sm" onClick={() => onPick('local')}>
            <Play size={14} /> 单人
          </Button>
          <Button size="sm" onClick={() => onPick('online')}>
            <Users size={14} /> 联机
          </Button>
        </div>
      </div>
      {ui.badge && <span className="gtile__badge">{ui.badge}</span>}
    </article>
  );
}

/** 左栏分类图标：扑克/麻将/棋类/桌游各一个隐喻，不写死颜色 */
function RailIcon({ id }: { id: GameCategory | 'all' }) {
  const map: Record<string, ReactElement> = {
    all: <LayoutGrid size={16} />,
    poker: <Dice5 size={16} />,
    mahjong: <Grid2x2 size={16} />,
    chess: <Sparkles size={16} />,
    board: <Blocks size={16} />,
    casual: <Gamepad2 size={16} />,
  };
  return map[id] ?? <LayoutGrid size={16} />;
}

export function Home() {
  const p = profile.use();
  const net = useOnline();
  const [setup, setSetup] = useState<{ gameId: string; mode: 'local' | 'online' } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [code, setCode] = useState('');
  const [cat, setCat] = useState<GameCategory | 'all'>('all');
  const resume = GAME_UIS.map((g) => (loadSavedLocal(g.id) ? g.id : null)).find(Boolean) ?? null;
  const resumeDef = resume ? getGame(resume) : null;

  const join = () => {
    const c = normalizeRoomCode(code);
    if (c.length === 4) navigate(`/room/${c}`);
  };

  // 房号输入满 4 位就实时问主机：这间房在不在、什么玩法、几个人
  const [room, setRoom] = useState<null | {
    code: string;
    gameId: string;
    seats: number;
    humans: number;
    status: string;
    players?: (string | null)[];
  }>(null);
  const [probing, setProbing] = useState(false);
  useEffect(() => {
    if (code.length !== 4) {
      setRoom(null);
      return;
    }
    let alive = true;
    const look = async () => {
      try {
        const base = new URL(serverUrl().replace(/^ws/, 'http'));
        const origin = `${base.protocol}//${base.host}`;
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 1500);
        const res = await fetch(`${origin}/api/lan?code=${code}`, { cache: 'no-store', signal: ac.signal });
        clearTimeout(timer);
        const data = (await res.json()) as { rooms?: (typeof room)[] };
        if (!alive) return;
        setRoom((data.rooms ?? []).find((r) => r?.code === code) ?? null);
        setProbing(false);
      } catch {
        if (alive) {
          setRoom(null);
          setProbing(false);
        }
      }
    };
    setProbing(true);
    void look();
    const timer = setInterval(look, 2500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [code]);

  // 局域网自发现：谁在开主机，这里就能看到并一键/自动接入
  const [hosts, setHosts] = useState<FoundHost[]>([]);
  const [scanning, setScanning] = useState(false);
  const runScan = async (auto = false) => {
    setScanning(true);
    try {
      const list = await scanLan();
      setHosts(list);
      const current = serverUrl();
      const live = list.filter((h) => h.rooms.length > 0);
      if (live.length === 1 && /127\.0\.0\.1/.test(current) && auto) {
        setServerOverride(`ws://${live[0].ip}:${live[0].port}/ws`);
        online.reconnectNow();
        toast(`已自动连上局域网主机 ${live[0].ip}`);
      }
    } finally {
      setScanning(false);
    }
  };
  useEffect(() => {
    void runScan(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const HOT_IDS = ['doudizhu', 'guandan', 'mahjong', 'texas', 'chess', 'uno'];
  const hot = HOT_IDS.map((id) => GAME_UIS.find((g) => g.id === id))
    .filter((g): g is GameUI => !!g)
    .slice(0, 3);
  const shown =
    cat === 'all' ? GAME_UIS : GAME_UIS.filter((g) => getGame(g.id)?.meta.category === cat);
  const catTitle = CATEGORIES.find((c) => c.id === cat)?.title ?? '全部玩法';
  const groups = CATEGORIES.map((c) => ({
    ...c,
    games: GAME_UIS.filter((g) => getGame(g.id)?.meta.category === c.id),
  })).filter((g) => g.games.length > 0);
  const tile = (ui: GameUI) => (
    <GameTile
      key={ui.id}
      ui={ui}
      def={getGame(ui.id)!}
      onPick={(mode) => setSetup({ gameId: ui.id, mode })}
    />
  );

  return (
    <div className="home lobby">
      <aside className="rail" aria-label="玩法分类">
        <button
          className={`rail__item${cat === 'all' ? ' is-on' : ''}`}
          onClick={() => setCat('all')}
        >
          <span className="rail__ico"><LayoutGrid size={16} /></span>
          <span className="rail__label">全部</span>
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={`rail__item${cat === c.id ? ' is-on' : ''}`}
            onClick={() => setCat(c.id)}
          >
            <span className="rail__ico"><RailIcon id={c.id} /></span>
            <span className="rail__label">{c.title.replace('更多玩法', '更多')}</span>
          </button>
        ))}
        <div className="rail__spacer" />
        <button className="rail__item" onClick={() => navigate('/library')}>
          <span className="rail__ico"><Gamepad2 size={16} /></span>
          <span className="rail__label">游戏库</span>
        </button>
        <button className="rail__item" onClick={() => navigate('/me')}>
          <span className="rail__ico"><UserRound size={16} /></span>
          <span className="rail__label">我的</span>
        </button>
      </aside>

      <div className="main">
        <header className="main__top">
          <div className="brand">
            <PavilionMark size={44} className="brand__mark" />
            <span className="brand__text">
              <strong>闲亭</strong>
              <small>与你的亲友，或 AI，来一局</small>
            </span>
          </div>
          <div className="main__me">
            <button className="me-chip" onClick={() => navigate('/me')} aria-label="个人中心">
              <Avatar name={p.name} avatar={p.avatar} size={26} />
              <span>{p.name}</span>
            </button>
            <IconButton label="设置" onClick={() => setSettingsOpen(true)}>
              <Settings2 size={18} />
            </IconButton>
          </div>
        </header>

        {(scanning || hosts.length > 0) && (
          <section className="lanbar">
            <span className="lanbar__label">
              {scanning ? '正在扫描局域网…' : `局域网发现 ${hosts.length} 台主机`}
            </span>
            {hosts.map((h) => (
              <button
                key={h.ip}
                className="lanbar__chip"
                onClick={() => {
                  setServerOverride(`ws://${h.ip}:${h.port}/ws`);
                  online.reconnectNow();
                  toast(`已连到 ${h.ip}`);
                }}
              >
                <b>{h.ip}</b>
                <small>{h.rooms.length} 间房</small>
              </button>
            ))}
            <button className="lanbar__retry" onClick={() => void runScan()}>
              重扫
            </button>
          </section>
        )}

        <section className="joinwrap">
          <form
            className="join"
            onSubmit={(e) => {
              e.preventDefault();
              join();
            }}
          >
            <input
              value={code}
              onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
              placeholder="输入 4 位房间号"
              inputMode="text"
              autoCapitalize="characters"
              aria-label="房间号"
            />
            <Button variant="primary" type="submit" disabled={code.length !== 4}>
              加入 <ArrowRight size={15} />
            </Button>
          </form>
          {code.length === 4 && (
            <div className={`join-card${room ? ' is-live' : ''}`}>
              {room ? (
                <>
                  <div className="join-card__main">
                    <b>{getGame(room.gameId)?.meta.name ?? '未知玩法'}</b>
                    <span>
                      {room.status === 'playing' ? '对局中，可进去观战' : '等人开局'} ·{' '}
                      {room.humans}/{room.seats} 人
                      {TEAM_NOTE[room.gameId] ? ` · ${TEAM_NOTE[room.gameId]}` : ''}
                    </span>
                  </div>
                  <div className="join-card__who">
                    {(room.players ?? [])
                      .filter((n): n is string => !!n)
                      .join('、') || '还没有人入座'}
                  </div>
                  <Button variant="primary" size="sm" onClick={join}>
                    进入房间 <ArrowRight size={14} />
                  </Button>
                </>
              ) : (
                <span className="join-card__hint">
                  {probing ? '正在问主机…' : '主机上没有这个房号，确认房间号或让房主重开一次'}
                </span>
              )}
            </div>
          )}
        </section>

        {net.room && (
          <section className="resume">
            <div>
              <strong>你在房间 {net.room.code} 中</strong>
              <span>
                {getGame(net.room.gameId)?.meta.name} ·{' '}
                {net.room.status === 'playing' ? '对局进行中' : '等待开局'}
              </span>
            </div>
            <div className="resume__actions">
              <Button variant="ghost" size="sm" onClick={() => online.send({ t: 'leave' })}>
                离开
              </Button>
              <Button variant="primary" size="sm" onClick={() => navigate(`/room/${net.room!.code}`)}>
                回到房间
              </Button>
            </div>
          </section>
        )}

        {resume && resumeDef && (
          <section className="resume">
            <div>
              <strong>继续上次的{resumeDef.meta.name}</strong>
              <span>单人对局已自动保存</span>
            </div>
            <div className="resume__actions">
              <Button variant="ghost" size="sm" onClick={() => clearSavedLocal()}>
                放弃
              </Button>
              <Button variant="primary" size="sm" onClick={() => navigate(`/play/${resume}`)}>
                继续
              </Button>
            </div>
          </section>
        )}

        {cat === 'all' && hot.length > 0 && (
          <section className="hot">
            <h2>
              现在最热
              <small>这三桌随时都有人开</small>
            </h2>
            <div className="hot__row">
              {hot.map((ui, i) => (
                <button
                  key={ui.id}
                  className="hot-card"
                  onClick={() => setSetup({ gameId: ui.id, mode: 'local' })}
                >
                  <span className="hot-card__rank">TOP {i + 1}</span>
                  <GameArt ui={ui} />
                  <span className="hot-card__body">
                    <b>{getGame(ui.id)?.meta.name}</b>
                    <small>{getGame(ui.id)?.meta.tagline}</small>
                  </span>
                  <span className="hot-card__ops">
                    <span
                      className="hot-card__op"
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSetup({ gameId: ui.id, mode: 'local' });
                      }}
                    >
                      <Play size={12} /> 单人
                    </span>
                    <span
                      className="hot-card__op"
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSetup({ gameId: ui.id, mode: 'online' });
                      }}
                    >
                      <Users size={12} /> 联机
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="wall">
          <h2>
            {catTitle}
            <small>{shown.length} 款</small>
          </h2>
          <div className="wall__grid">
            {shown.map((ui) => (
              <button
                key={ui.id}
                className="tomb"
                onClick={() => setSetup({ gameId: ui.id, mode: 'local' })}
                title={`${getGame(ui.id)?.meta.name} · 单人`}
              >
                <GameArt ui={ui} />
                <span className="tomb__name">{getGame(ui.id)?.meta.name}</span>
                <span className="tomb__meta">{ui.people}</span>
                <span
                  className="tomb__link"
                  role="button"
                  aria-label="联机"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSetup({ gameId: ui.id, mode: 'online' });
                  }}
                >
                  <Users size={12} />
                </span>
                {ui.badge && <span className="tomb__badge">{ui.badge}</span>}
              </button>
            ))}
          </div>
        </section>

        <footer className="home__foot">
          <span className="home__ver" aria-label="版本">
            <b>闲亭</b>
            {VERSION_TEXT}
          </span>
        </footer>
      </div>

      {setup && (
        <SetupSheet
          gameId={setup.gameId}
          mode={setup.mode}
          onClose={() => setSetup(null)}
          onStart={() => {
            if (setup.mode === 'local') {
              markFreshStart();
              navigate(`/play/${setup.gameId}`);
            } else {
              navigate('/room/new');
            }
          }}
        />
      )}
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} showProfile />
    </div>
  );
}
