import { ChevronLeft, Info, MoonStar, RotateCcw, Sun, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Field, Segmented, Switch, toast } from '../components/ui';
import { PixelAvatar } from '../components/pixel/PixelAvatar';
import { clearSavedLocal } from '../lib/controller';
import { navigate } from '../lib/router';
import { profile, settings } from '../lib/store';
import { VERSION_TEXT } from '../lib/version';
import { FELTS, AvatarPicker, ServerSection } from './SettingsSheet';
import './me.css';

/** 个人中心：把「这个人在闲亭里的全部状态」放在一页里 */
export function Me() {
  const p = profile.use();
  const s = settings.use();
  const [showAvatars, setShowAvatars] = useState(false);
  const [draft, setDraft] = useState(p.name);

  return (
    <div className="me">
      <header className="me__top">
        <button className="me__back" onClick={() => navigate('/')} aria-label="回大厅">
          <ChevronLeft size={18} />
          <span>大厅</span>
        </button>
        <h1>我的</h1>
      </header>

      <section className="me__card me__id">
        <PixelAvatar avatar={p.avatar} name={p.name} size={64} />
        <div className="me__id-main">
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
              } else {
                setDraft(p.name);
              }
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <small>这台设备上的玩家 · 联机时朋友看到的就是这个名字</small>
          <button className="me__link" onClick={() => setShowAvatars((v) => !v)}>
            {showAvatars ? '收起形象' : '换一个形象'}
          </button>
        </div>
      </section>

      {showAvatars && (
        <section className="me__card me__avatars">
          <AvatarPicker />
        </section>
      )}

      <section className="me__card">
        <h2>外观与主题</h2>
        <Field label="界面主题" hint="自动：白天浅色，入夜跟随系统切到深色">
          <Segmented
            value={s.theme}
            onChange={(v) => settings.set({ theme: v })}
            options={[
              { value: 'system', label: '自动' },
              { value: 'light', label: '浅色' },
              { value: 'dark', label: '深色' },
            ]}
          />
        </Field>
        <div className="me__theme-hint">
          {s.theme === 'system' ? <MoonStar size={14} /> : s.theme === 'dark' ? <MoonStar size={14} /> : <Sun size={14} />}
          <span>
            {s.theme === 'system'
              ? '当前跟随系统；系统切到夜间时整个界面会自动变深'
              : s.theme === 'dark'
                ? '固定深色，适合夜间'
                : '固定浅色'}
          </span>
        </div>
        <Field label="桌布">
          <div className="felt-picker">
            {FELTS.map((f) => (
              <button
                key={f.value}
                className={s.felt === f.value ? 'is-on' : ''}
                onClick={() => settings.set({ felt: f.value })}
                aria-label={f.label}
              >
                <i style={{ background: f.color }} />
                <span>{f.label}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="四色牌" hint="方块蓝色、梅花绿色">
          <Switch checked={s.fourColor} onChange={(v) => settings.set({ fourColor: v })} />
        </Field>
        <Field label="记牌器" hint="斗地主里显示还剩哪些牌">
          <Switch checked={s.cardCounter} onChange={(v) => settings.set({ cardCounter: v })} />
        </Field>
        <Field label="音效">
          <Switch checked={s.sound} onChange={(v) => settings.set({ sound: v })} />
        </Field>
        <Field label="虚拟形象" hint="牌桌上用全身像素形象代替头像">
          <Switch checked={s.figures} onChange={(v) => settings.set({ figures: v })} />
        </Field>
      </section>

      <section className="me__card">
        <h2>联机与局域网</h2>
        <ServerSection />
        <p className="me__note">
          一台设备跑起服务端（H5 包里的启动脚本即可），其余手机填上它的地址就能进同一间房；
          服务端把房间存到 `data/rooms`，中途关掉再启动、或换一台设备接管，房间和娱乐分都还在。
        </p>
      </section>

      <section className="me__card">
        <h2>数据</h2>
        <Field label="本机对局存档" hint="清理后下次从新的一局开始">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              clearSavedLocal();
              toast('已清理本机存档');
            }}
          >
            <RotateCcw size={15} /> 清理
          </Button>
        </Field>
        <Field label="游戏库" hint="导入的 H5 / 掌机文件只存在这台设备">
          <Button size="sm" variant="ghost" onClick={() => navigate('/library')}>
            <Trash2 size={15} /> 去管理
          </Button>
        </Field>
      </section>

      <p className="me__about">
        <Info size={14} />
        闲亭 DeskPark · {VERSION_TEXT} · 娱乐分只记输赢，不能充值、兑换或转赠。
      </p>

      {/* 横屏/竖屏下都摸得到的一键退出：不靠顶栏那条窄按钮 */}
      <button className="me__exit" onClick={() => navigate('/')}>
        <ChevronLeft size={16} /> 回大厅
      </button>
    </div>
  );
}
