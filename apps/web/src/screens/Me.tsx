import {
  ChevronLeft,
  ChevronRight,
  Grid2x2,
  Info,
  ListChecks,
  MoonStar,
  Palette,
  RotateCcw,
  Sparkles,
  UserRound,
  Volume2,
  Wand2,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, Segmented, Switch, toast } from '../components/ui';
import { PixelAvatar } from '../components/pixel/PixelAvatar';
import { clearSavedLocal } from '../lib/controller';
import { currentHost, hostAvailable, subscribeHost, type HostState } from '../lib/localHost';
import { navigate } from '../lib/router';
import { listRoms } from '../lib/roms';
import { figureHeight, useFigure } from '../lib/characters';
import { CharacterSprite } from '../components/pixel/CharacterSprite';
import { profile, settings } from '../lib/store';
import { VERSION_TEXT } from '../lib/version';
import { FELTS, AvatarStudio, ServerSection, AiSection, SyncSection } from './SettingsSheet';
import './me.css';

/** 一行设置：图标 + 标题 + 说明 + 右侧控件，和系统设置同一套语言 */
function Row({
  icon,
  title,
  note,
  children,
  onClick,
  danger,
}: {
  icon: ReactNode;
  title: string;
  note?: string;
  children?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  const body = (
    <>
      <span className={`me__icon${danger ? ' is-danger' : ''}`}>{icon}</span>
      <span className="me__row-text">
        <b>{title}</b>
        {note && <small>{note}</small>}
      </span>
      <span className="me__row-tail">{children}</span>
    </>
  );
  return onClick ? (
    <button className={`me__row${danger ? ' is-danger' : ''}`} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={`me__row${danger ? ' is-danger' : ''}`}>{body}</div>
  );
}

export function Me() {
  const p = profile.use();
  const s = settings.use();
  const [showAvatars, setShowAvatars] = useState(false);
  const [draft, setDraft] = useState(p.name);
  const [roms, setRoms] = useState(0);
  const [host, setHost] = useState<HostState>(() => currentHost());
  const figure = useFigure(p.avatar, p.name);
  const showFigure = s.figures && !!figure;

  useEffect(() => {
    void listRoms().then((rows) => setRoms(rows.length));
    return subscribeHost(setHost);
  }, []);

  return (
    <div className="me">
      <header className="me__top">
        <button className="me__back" onClick={() => navigate('/')} aria-label="回大厅">
          <ChevronLeft size={18} />
          <span>大厅</span>
        </button>
        <h1>我的</h1>
      </header>

      <section className="me__hero">
        <button
          className="me__avatar"
          onClick={() => setShowAvatars((v) => !v)}
          aria-label="更换形象"
        >
          <PixelAvatar avatar={p.avatar} name={p.name} size={74} />
          <span className="me__avatar-badge">
            <Wand2 size={12} />
          </span>
        </button>
        <div className="me__hero-main">
          <input
            className="me__name"
            value={draft}
            maxLength={12}
            aria-label="昵称"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              const name = [...draft.trim()].slice(0, 12).join('');
              if (name && name !== p.name) {
                profile.set({ name });
                toast('昵称已更新');
              } else setDraft(p.name);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <small>这台设备上的玩家 · 联机时朋友看到的就是这个名字</small>
        </div>
      </section>

      <div className="me__stats">
        <button className="me__stat" onClick={() => navigate('/library')}>
          <b>{roms}</b>
          <small>游戏库</small>
        </button>
        <button className="me__stat" onClick={() => navigate('/')}>
          <b>{host.running ? '开' : '关'}</b>
          <small>本机主机</small>
        </button>
        <div className="me__stat">
          <b>{VERSION_TEXT.split(' ')[0]}</b>
          <small>当前版本</small>
        </div>
      </div>

      <section className="me__group">
        <h2>我的形象</h2>
        <button className="me__look" onClick={() => setShowAvatars((v) => !v)}>
          <span className={`me__look-pic${showFigure ? ' is-figure' : ''}`}>
            {showFigure && figure ? (
              <CharacterSprite character={figure} height={figureHeight(figure, 84)} seed={figure.id} />
            ) : (
              <PixelAvatar avatar={p.avatar} name={p.name} size={54} />
            )}
          </span>
          <span className="me__look-text">
            <b>{showFigure ? (figure?.name ?? '全身形象') : '像素头像'}</b>
            <small>{showFigure ? '牌桌上会以全身立绘走动' : '点这里换成全身立绘或别的头像'}</small>
          </span>
          <span className="me__row-action">{showAvatars ? '收起' : '更换'}</span>
          <ChevronRight size={16} className={`me__chev${showAvatars ? ' is-open' : ''}`} />
        </button>
        {showAvatars && (
          <div className="me__studio">
            <AvatarStudio preview={148} />
          </div>
        )}
      </section>

      <section className="me__group">
        <h2>外观与主题</h2>
        <Row
          icon={<Palette size={16} />}
          title="界面主题"
          note={s.theme === 'system' ? '白天浅色，入夜跟随系统自动变深' : '手动固定，不随系统切换'}
        >
          <Segmented
            value={s.theme}
            onChange={(v) => settings.set({ theme: v })}
            options={[
              { value: 'system', label: '自动' },
              { value: 'light', label: '浅色' },
              { value: 'dark', label: '深色' },
            ]}
          />
        </Row>
        <Row icon={<MoonStar size={16} />} title="桌布" note="牌桌绒布颜色">
          <div className="me__felts">
            {FELTS.map((f) => (
              <button
                key={f.value}
                className={s.felt === f.value ? 'is-on' : ''}
                style={{ background: f.color }}
                onClick={() => settings.set({ felt: f.value })}
                aria-label={f.label}
              />
            ))}
          </div>
        </Row>
        <Row icon={<Grid2x2 size={16} />} title="四色牌" note="方块蓝、梅花绿，花色一眼分清">
          <Switch checked={s.fourColor} onChange={(v) => settings.set({ fourColor: v })} />
        </Row>
        <Row icon={<ListChecks size={16} />} title="记牌器" note="斗地主等玩法显示剩余牌">
          <Switch checked={s.cardCounter} onChange={(v) => settings.set({ cardCounter: v })} />
        </Row>
        <Row icon={<Volume2 size={16} />} title="音效" note="出牌、胡牌、结算提示音">
          <Switch checked={s.sound} onChange={(v) => settings.set({ sound: v })} />
        </Row>
        <Row icon={<UserRound size={16} />} title="虚拟形象" note="牌桌上用全身像素形象代替头像">
          <Switch checked={s.figures} onChange={(v) => settings.set({ figures: v })} />
        </Row>
      </section>

      <section className="me__group">
        <h2>联机与局域网</h2>
        <ServerSection />
      </section>

      <section className="me__group">
        <h2>AI 人机</h2>
        <AiSection />
      </section>

      <section className="me__group">
        <h2>数据同步</h2>
        <SyncSection />
      </section>

      <section className="me__group">
        <h2>数据</h2>
        <Row
          icon={<RotateCcw size={16} />}
          title="本机对局存档"
          note="清理后下次从新的一局开始"
          onClick={() => {
            clearSavedLocal();
            toast('已清理本机存档');
          }}
        >
          <span className="me__row-action">清理</span>
        </Row>
        <Row
          icon={<Sparkles size={16} />}
          title="游戏库"
          note="导入的 H5 / 掌机文件只存在这台设备"
          onClick={() => navigate('/library')}
        >
          <ChevronRight size={16} className="me__chev" />
        </Row>
      </section>

      <section className="me__group">
        <h2>关于</h2>
        <Row icon={<Info size={16} />} title="版本" note="娱乐分只记输赢，不能充值、兑换或转赠">
          <span className="me__row-mono">{VERSION_TEXT}</span>
        </Row>
        {hostAvailable() && (
          <Row icon={<MoonStar size={16} />} title="主机保活" note="开房时前台服务常驻，锁屏不断">
            <span className={`me__row-mono${host.running ? ' is-on' : ''}`}>
              {host.running ? '运行中' : '未开启'}
            </span>
          </Row>
        )}
      </section>

      <Button className="me__exit" variant="secondary" onClick={() => navigate('/')}>
        <ChevronLeft size={16} /> 回大厅
      </Button>
    </div>
  );
}
