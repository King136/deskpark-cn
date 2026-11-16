import type { AnyGame, GameCategory } from '@park/engine';
import { getGame } from '@park/engine';
import { normalizeRoomCode } from '@park/protocol';
import { ArrowRight, Gamepad2, Play, Settings2, Users } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { PlayingCard } from '../components/PlayingCard';
import { PavilionMark } from '../components/Brand';
import { MahjongTile } from '../components/MahjongTile';
import { Avatar } from '../components/Seat';
import { Button, IconButton } from '../components/ui';
import type { GameUI } from '../games';
import { GAME_UIS } from '../games';
import { clearSavedLocal, loadSavedLocal } from '../lib/controller';
import { online, useOnline } from '../lib/online';
import { serverUrl } from '../lib/platform';
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

export function Home() {
  const p = profile.use();
  const net = useOnline();
  const [setup, setSetup] = useState<{ gameId: string; mode: 'local' | 'online' } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [code, setCode] = useState('');
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
        const res = await fetch(`${origin}/api/lan?code=${code}`, { cache: 'no-store' });
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
    <div className="home">
      <header className="home__top">
        <div className="brand">
          <PavilionMark size={34} className="brand__mark" />
          <span className="brand__text">
            <strong>闲亭</strong>
            <small>DESKPARK</small>
          </span>
        </div>
        <div className="home__me">
          <IconButton label="游戏库" onClick={() => navigate('/library')}>
            <Gamepad2 size={19} />
          </IconButton>
          <button className="me-chip" onClick={() => navigate('/me')} aria-label="个人中心">
            <Avatar name={p.name} avatar={p.avatar} size={28} />
            <span>{p.name}</span>
          </button>
          <IconButton label="设置" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={19} />
          </IconButton>
        </div>
      </header>

      <section className="hero">
        <h1>
          与朋友，或与电脑，
          <br />
          来一局。
        </h1>
        <p>扑克、麻将与更多桌面游戏。打开网页即玩，无需下载。</p>
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                online.send({ t: 'leave' });
              }}
            >
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

      {groups.map((g) => (
        <section className={`games-group ${g.note ? 'is-more' : ''}`} key={g.id}>
          <h2>{g.title}</h2>
          <div className={`games ${g.note ? 'games--small' : ''}`}>{g.games.map(tile)}</div>
          {g.note && (
            <p className="more__note">玩法以插件形式实现，新增一个小游戏只需实现规则接口与牌桌界面。</p>
          )}
        </section>
      ))}

      <footer className="home__foot">
        <span className="home__ver" aria-label="版本">
          <b>闲亭</b>
          {VERSION_TEXT}
        </span>
      </footer>

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
