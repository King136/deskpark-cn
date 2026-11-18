import { useState } from 'react';
import { Button, Field, Segmented, Sheet, Switch, toast } from '../components/ui';
import { callout } from '../lib/callout';
import { testConnection } from '../lib/ai/agent';
import type { AiProtocol } from '../lib/ai/settings';
import { AI_DEFAULTS, aiSettings } from '../lib/ai/settings';
import { Avatar } from '../components/Seat';
import type { AvatarTheme } from '../components/pixel/characters';
import { CHARACTERS, THEME_NAME, getCharacter } from '../components/pixel/characters';
import { CharacterSprite } from '../components/pixel/CharacterSprite';
import { PixelAvatar } from '../components/pixel/PixelAvatar';
import type { VirtualCharacter } from '../lib/characters';
import { figureFor, figureHeight, findCharacter, useCharacters } from '../lib/characters';
import { profile, settings } from '../lib/store';
import type { FeltTheme } from '../lib/store';
import { online } from '../lib/online';
import { getServerOverride, isWebview, serverUrl, setServerOverride } from '../lib/platform';
import { guessLanPrefix, scanLan, type FoundHost } from '../lib/discover';
import {
  DAV_DEFAULT,
  davDownload,
  davStat,
  davTest,
  davUpload,
  fmtTime,
  getDavConfig,
  setDavConfig,
  applyPack,
  type BackupPack,
  type DavConfig,
} from '../lib/webdav';
import {
  currentHost,
  hostAvailable,
  localWsUrl,
  startHost,
  stopHost,
  type HostState,
} from '../lib/localHost';
import './settings.css';

export const FELTS: { value: FeltTheme; label: string; color: string }[] = [
  { value: 'jade', label: '墨绿', color: '#2a6152' },
  { value: 'indigo', label: '黛蓝', color: '#2f4a72' },
  { value: 'wine', label: '酒红', color: '#6a2f3b' },
  { value: 'graphite', label: '石墨', color: '#3b3d40' },
];

export function NameEditor() {
  const p = profile.use();
  const [draft, setDraft] = useState(p.name);
  const commit = () => {
    const name = [...draft.trim()].slice(0, 12).join('');
    if (name) profile.set({ name });
    else setDraft(p.name);
  };
  return (
    <div className="name-editor">
      <Avatar name={draft || p.name} avatar={p.avatar} size={44} />
      <input
        value={draft}
        maxLength={12}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label="昵称"
        placeholder="你的昵称"
      />
    </div>
  );
}

/** 形象选择：按主题分组 */
export function AvatarPicker() {
  const p = profile.use();
  return (
    <div className="avatar-picker">
      {(Object.keys(THEME_NAME) as AvatarTheme[]).map((theme) => (
        <div key={theme} className="avatar-picker__group">
          <span className="avatar-picker__title">{THEME_NAME[theme]}</span>
          <div className="avatar-picker__grid">
            {CHARACTERS.filter((c) => c.theme === theme).map((c) => (
              <button
                key={c.id}
                className={p.avatar === c.id ? 'is-on' : ''}
                onClick={() => profile.set({ avatar: c.id })}
                aria-label={c.name}
                title={c.name}
              >
                <PixelAvatar avatar={c.id} name={c.name} size={46} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FigureButton({ c, on, onPick }: { c: VirtualCharacter; on: boolean; onPick: () => void }) {
  return (
    <button
      className={`is-vc ${on ? 'is-on' : ''}`}
      onClick={onPick}
      aria-label={c.name}
      title={c.name}
    >
      <CharacterSprite character={c} height={figureHeight(c, 96)} seed={c.id} />
      <span>{c.name}</span>
    </button>
  );
}

/** 虚拟形象选择：与像素头像一一对应的全身像 + 额外角色 */
export function FigurePicker() {
  const p = profile.use();
  const list = useCharacters();
  const byAvatar = new Map(list.filter((c) => c.avatar).map((c) => [c.avatar, c]));
  const extras = list.filter((c) => !c.avatar);
  return (
    <div className="avatar-picker">
      {(Object.keys(THEME_NAME) as AvatarTheme[]).map((theme) => {
        const items = CHARACTERS.filter((a) => a.theme === theme && byAvatar.has(a.id));
        if (!items.length) return null;
        return (
          <div key={theme} className="avatar-picker__group">
            <span className="avatar-picker__title">{THEME_NAME[theme]}</span>
            <div className="avatar-picker__grid">
              {items.map((a) => (
                <FigureButton
                  key={a.id}
                  c={byAvatar.get(a.id)!}
                  on={p.avatar === a.id}
                  onPick={() => profile.set({ avatar: a.id })}
                />
              ))}
            </div>
          </div>
        );
      })}
      {extras.length > 0 && (
        <div className="avatar-picker__group">
          <span className="avatar-picker__title">特别角色</span>
          <div className="avatar-picker__grid">
            {extras.map((c) => (
              <FigureButton
                key={c.id}
                c={c}
                on={p.avatar === `vc:${c.id}`}
                onPick={() => profile.set({ avatar: `vc:${c.id}` })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 头像 / 虚拟形象 模式切换（显示偏好，只影响自己看到的牌桌） */
export function FigureModeSwitch() {
  const s = settings.use();
  const list = useCharacters();
  if (!list.length) return null;
  return (
    <Segmented
      value={s.figures ? 'figure' : 'pixel'}
      onChange={(m) => settings.set({ figures: m === 'figure' })}
      options={[
        { value: 'pixel', label: '像素头像' },
        { value: 'figure', label: '全身形象' },
      ]}
    />
  );
}

/**
 * 形象工作室：一个地方同时看见「现在长什么样」和「还能换成谁」。
 * 之前「我的 → 更换形象」只留了像素头像，全身立绘入口被漏掉，就是这个组件的意义。
 */
export function AvatarStudio({ preview = 132 }: { preview?: number }) {
  const p = profile.use();
  const s = settings.use();
  const list = useCharacters();
  const figures = list.length > 0;
  const showFigure = s.figures && figures;
  const fig = findCharacter(list, p.avatar) ?? figureFor(list, p.avatar, p.name);
  const pixelName = getCharacter(p.avatar)?.name ?? '像素头像';
  return (
    <div className="studio">
      <div className={`studio__preview${showFigure ? ' is-figure' : ''}`}>
        <div className="studio__stage">
          {showFigure && fig ? (
            <CharacterSprite character={fig} height={figureHeight(fig, preview)} seed={fig.id} />
          ) : (
            <PixelAvatar avatar={p.avatar} name={p.name} size={preview * 0.72} />
          )}
        </div>
        <div className="studio__meta">
          <b>{showFigure ? (fig?.name ?? '虚拟形象') : pixelName}</b>
          <small>
            {showFigure
              ? '牌桌上以全身立绘显示，走动、抬手都会动'
              : '牌桌与聊天里使用的小头像，像素风'}
          </small>
          {figures && (
            <span className={`studio__switch${s.figures ? ' is-on' : ''}`}>
              {showFigure ? '全身形象已开启' : '当前使用像素头像'}
            </span>
          )}
        </div>
      </div>
      {figures && <FigureModeSwitch />}
      {showFigure ? <FigurePicker /> : <AvatarPicker />}
    </div>
  );
}

function AvatarSection() {
  return (
    <div className="field field--stack">
      <div className="field__label">
        <span>形象</span>
        <small>像素头像与全身立绘，随时切换</small>
      </div>
      <AvatarStudio preview={116} />
      <p className="field__note">开启全身形象后，牌桌上所有人（包括电脑）都会以立绘显示。</p>
    </div>
  );
}

/** AI 人机：接口设置（只保存在本机浏览器） */
function AiSection() {
  const a = aiSettings.use();
  const d = AI_DEFAULTS[a.protocol];
  const [testing, setTesting] = useState(false);
  const test = async () => {
    setTesting(true);
    try {
      const reply = await testConnection();
      toast(`连接成功：${reply}`);
    } catch (e) {
      toast(`连接失败：${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setTesting(false);
    }
  };
  return (
    <div className="field field--stack ai-settings">
      <div className="field__label">
        <span>AI 人机</span>
        <small>点电脑玩家头像上方的 ✨ 唤醒，由大模型接管它出牌和聊天</small>
      </div>
      <Segmented<AiProtocol>
        value={a.protocol}
        onChange={(protocol) => aiSettings.set({ protocol })}
        options={[
          { value: 'anthropic', label: 'Anthropic' },
          { value: 'openai', label: 'OpenAI 兼容' },
        ]}
      />
      <label className="ai-input">
        <span>接口地址</span>
        <input
          value={a.baseUrl}
          placeholder={d.baseUrl}
          onChange={(e) => aiSettings.set({ baseUrl: e.target.value })}
          spellCheck={false}
          inputMode="url"
        />
      </label>
      <label className="ai-input">
        <span>API Key</span>
        <input
          type="password"
          value={a.apiKey}
          placeholder={a.protocol === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
          onChange={(e) => aiSettings.set({ apiKey: e.target.value })}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label className="ai-input">
        <span>模型</span>
        <input
          value={a.model}
          placeholder={d.model || '例如 deepseek-chat、qwen-plus'}
          onChange={(e) => aiSettings.set({ model: e.target.value })}
          spellCheck={false}
        />
      </label>
      <div className="ai-row">
        <span>发言</span>
        <Segmented<number>
          value={a.chat}
          onChange={(chat) => aiSettings.set({ chat: chat as 0 | 1 | 2 | 3 })}
          options={[
            { value: 0, label: '不说话' },
            { value: 1, label: '偶尔' },
            { value: 2, label: '适中' },
            { value: 3, label: '话痨' },
          ]}
        />
      </div>
      <div className="ai-row">
        <span>
          经服务器转发
          <small>浏览器直连被跨域拦截时开启（需要部署了闲亭服务器）</small>
        </span>
        <Switch checked={a.proxy} onChange={(proxy) => aiSettings.set({ proxy })} />
      </div>
      <Button variant="secondary" size="sm" onClick={test} disabled={testing || !a.apiKey.trim()}>
        {testing ? '测试中…' : '测试连接'}
      </Button>
      <p className="field__note">
        Key
        只保存在这台设备的浏览器里；对局信息只发给你填写的接口（开启转发时经本站服务器中转，服务器不保存）。
      </p>
    </div>
  );
}

/* ---------- 联机服务器地址：App 壳里没有同源服务器，局域网/公网部署也要手填 ---------- */
export function ServerSection() {
  const [value, setValue] = useState(() => getServerOverride());
  const [now, setNow] = useState(() => getServerOverride());
  const [probe, setProbe] = useState('');
  const [host, setHost] = useState<HostState>(() => currentHost());
  const [prefix, setPrefix] = useState(() => guessLanPrefix());
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState<FoundHost[]>([]);
  const native = isWebview();

  /* 局域网自发现：浏览器拿不到本机 IP，默认扫页面所在网段，也允许手填 */
  const scan = async () => {
    setScanning(true);
    setFound([]);
    try {
      const list = await scanLan(prefix);
      setFound(list);
      if (!list.length) toast('这个网段没扫到主机，确认对方已开「本机当主机」', 'error');
    } finally {
      setScanning(false);
    }
  };

  /* 局域网自发现：问一句这台主机「你在吗、有几间房」 */
  const probeHost = async () => {
    const u = new URL(serverUrl().replace(/^ws/, 'http'));
    const base = `${u.protocol}//${u.host}`;
    setProbe('正在探测…');
    try {
      const res = await fetch(`${base}/api/lan`, { cache: 'no-store' });
      const data = (await res.json()) as { name?: string; rooms?: unknown[] };
      setProbe(`主机在线 · ${data.name ?? '闲亭'} · 当前 ${data.rooms?.length ?? 0} 间房`);
    } catch {
      setProbe('这个地址没有应答，确认主机在跑、并且在同一网络');
    }
  };

  const apply = (text: string) => {
    setServerOverride(text);
    const saved = getServerOverride();
    setNow(saved);
    setValue(saved);
    online.reconnectNow();
    toast(saved ? `联机地址已保存：${saved}` : '已恢复默认（与网页同源）');
  };

  return (
    <div className="field field--stack server-block">
      <div className="field__label">
        <span>联机服务器</span>
        <small>
          {native
            ? 'App 里必须填写能访问到的服务器，例如 192.168.1.9:8787（官方模拟器可用 10.0.2.2:8787）'
            : '留空即用当前网页所在的服务器；跨设备联机、或网页与服务器分开部署时填写'}
        </small>
      </div>
      <div className="field__control server-field">
        <input
          value={value}
          placeholder="192.168.1.9:8787 或 wss://game.example.com/ws"
          inputMode="url"
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply(value)}
          aria-label="联机服务器地址"
        />
        <div className="server-field__ops">
          <Button size="sm" variant="primary" onClick={() => apply(value)}>
            保存并重连
          </Button>
          {now && (
            <Button size="sm" variant="ghost" onClick={() => apply('')}>
              恢复默认
            </Button>
          )}
          {/* 探测与保存同属「这个地址通不通」，放一行省 60px 高度 */}
          <Button size="sm" variant="secondary" onClick={() => void probeHost()}>
            探测主机
          </Button>
        </div>

        {/* 局域网自发现：扫同网段里所有开着「本机当主机」的设备，点一下就直接连过去 */}
        <div className="server-lan">
          <div className="server-lan__row">
            <input
              value={prefix}
              placeholder="网段，如 192.168.1"
              inputMode="numeric"
              spellCheck={false}
              onChange={(e) => setPrefix(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void scan()}
              aria-label="局域网网段"
            />
            <Button size="sm" variant="secondary" disabled={scanning} onClick={() => void scan()}>
              {scanning ? '扫描中…' : '扫描局域网'}
            </Button>
          </div>
          {found.length > 0 && (
            <div className="server-lan__list">
              {found.map((h) => (
                <button
                  key={h.ip}
                  className="server-lan__chip"
                  onClick={() => {
                    apply(`ws://${h.ip}:${h.port}/ws`);
                    toast(`已连到 ${h.ip}`);
                  }}
                >
                  <b>{h.ip}</b>
                  <small>
                    {h.name} · {h.rooms.length} 间房
                  </small>
                </button>
              ))}
            </div>
          )}
          {!scanning && found.length === 0 && (
            <small className="server-field__now">
              同一 Wi-Fi 下，只要有一台设备开着「本机当主机」，这里就能扫到它
            </small>
          )}
        </div>
        {hostAvailable() && (
          <div className="server-host">
            <div className="server-host__row">
              <span>
                本机当主机
                <small>{host.running ? '正在跑房间，朋友填下面的地址' : '没有服务端时，让这台手机来开房'}</small>
              </span>
              <Button
                size="sm"
                variant={host.running ? 'ghost' : 'primary'}
                onClick={() => {
                  if (host.running) {
                    void stopHost().then(() => {
                      setHost(currentHost());
                      if (serverUrl().includes('127.0.0.1')) apply('');
                      toast('主机已停止');
                    });
                    return;
                  }
                  void startHost(8787)
                    .then((st) => {
                      setHost(st);
                      apply(localWsUrl(st.port));
                      toast(`主机已开：${st.addresses[0] ?? ''}`);
                    })
                    .catch((e: unknown) => toast(`开主机失败：${(e as Error).message}`, 'error'));
                }}
              >
                {host.running ? '停止' : '把本机变成主机'}
              </Button>
            </div>
            {host.running && (
              <div className="server-host__addr">
                <p>
                  朋友在自己手机的「联机服务器」里填：<b>{host.addresses[0] ?? '—'}</b>
                </p>
                {host.addresses.length > 1 && (
                  <p className="is-sub">备用：{host.addresses.slice(1).join(' / ')}</p>
                )}
                <p className="is-sub">
                  两台手机要连同一个 Wi-Fi（关闭 VPN / 热点隔离），本机 IP 变了就重新看一眼这里。
                  {host.rooms.length > 0 && `当前 ${host.rooms.length} 间房。`}
                </p>
              </div>
            )}
          </div>
        )}
        {probe && <small className="server-field__now">{probe}</small>}
        <small className="server-field__now">
          当前：{serverUrl()}
          {native && !now ? '（App 内通常连不上，请先填地址）' : ''}
        </small>
      </div>
    </div>
  );
}

/** WebDAV 数据同步：把设置/形象/存档整包搬到自己的网盘 */
export function SyncSection() {
  const [cfg, setCfg] = useState<DavConfig>(() => getDavConfig());
  const [busy, setBusy] = useState<'test' | 'up' | 'down' | ''>('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<BackupPack | null>(null);
  const patch = (p: Partial<DavConfig>) => setCfg(setDavConfig(p));

  const err = (e: unknown) => setNote(e instanceof Error ? e.message : String(e));

  const test = async () => {
    setBusy('test');
    setNote('正在探测…');
    try {
      const info = await davTest(cfg);
      const st = await davStat(cfg);
      setNote(
        `连上了：${info}${st ? ` · 云端备份 ${fmtTime(st.modified)} · ${(st.size / 1024).toFixed(1)} KB` : ' · 云端还没有备份'}`,
      );
    } catch (e) {
      err(e);
    } finally {
      setBusy('');
    }
  };

  const upload = async () => {
    setBusy('up');
    setNote('正在上传…');
    try {
      const { pack, bytes } = await davUpload(cfg, navigator.platform || 'web');
      setNote(`已备份 ${Object.keys(pack.data).length} 项 · ${(bytes / 1024).toFixed(1)} KB · ${fmtTime(pack.exportedAt)}`);
    } catch (e) {
      err(e);
    } finally {
      setBusy('');
    }
  };

  const pull = async () => {
    setBusy('down');
    setNote('正在读取云端…');
    try {
      const pack = await davDownload(cfg);
      setPending(pack);
      setNote(`云端备份来自 ${fmtTime(pack.exportedAt)} · ${Object.keys(pack.data).length} 项`);
    } catch (e) {
      err(e);
    } finally {
      setBusy('');
    }
  };

  const doRestore = () => {
    if (!pending) return;
    const n = applyPack(pending);
    setPending(null);
    toast(`已恢复 ${n} 项，重启后全部生效`);
    // 存储是模块级单例，重新加载最稳，避免各 store 内存值与 localStorage 不一致
    window.setTimeout(() => location.reload(), 700);
  };

  return (
    /* 用 field--stack 而不是默认横排 Field：默认布局 label 与内容同行，
       内容只剩半屏宽会被 input 的固有宽度撑到 460px，整个 Sheet 横向溢出 */
    <div className="field field--stack dav-block">
      <div className="field__label">
        <span>数据同步（WebDAV）</span>
        <small>坚果云 / Nextcloud / 群晖都行。填目录地址和账号，就能把设置、形象、存档整包备份</small>
      </div>
      <div className="field__control">
        <div className="dav">
        <input
          className="dav__input"
          value={cfg.url}
          placeholder="https://dav.jianguoyun.com/dav/闲亭"
          inputMode="url"
          spellCheck={false}
          onChange={(e) => patch({ url: e.target.value })}
          aria-label="WebDAV 目录地址"
        />
        <div className="dav__row">
          <input
            className="dav__input"
            value={cfg.user}
            placeholder="账号"
            autoComplete="username"
            spellCheck={false}
            onChange={(e) => patch({ user: e.target.value })}
            aria-label="WebDAV 账号"
          />
          <input
            className="dav__input"
            value={cfg.pass}
            placeholder="密码 / 应用密码"
            type="password"
            autoComplete="current-password"
            onChange={(e) => patch({ pass: e.target.value })}
            aria-label="WebDAV 密码"
          />
        </div>
        <div className="dav__row">
          <input
            className="dav__input"
            value={cfg.file}
            placeholder={DAV_DEFAULT.file}
            spellCheck={false}
            onChange={(e) => patch({ file: e.target.value })}
            aria-label="备份文件名"
          />
          <Button size="sm" variant="secondary" disabled={busy === 'test'} onClick={() => void test()}>
            {busy === 'test' ? '探测中…' : '测试连接'}
          </Button>
        </div>

        <div className="dav__ops">
          <Button size="sm" variant="primary" disabled={busy === 'up'} onClick={() => void upload()}>
            {busy === 'up' ? '上传中…' : '备份到云端'}
          </Button>
          <Button size="sm" variant="secondary" disabled={busy === 'down'} onClick={() => void pull()}>
            {busy === 'down' ? '读取中…' : '从云端恢复'}
          </Button>
        </div>

        <div className="dav__toggles">
          <span className="dav__toggle">
            记住密码
            <Switch checked={cfg.remember} onChange={(v) => patch({ remember: v })} />
          </span>
          <span className="dav__toggle">
            启动自动比对
            <Switch checked={cfg.auto} onChange={(v) => patch({ auto: v })} />
          </span>
        </div>

        {pending && (
          <div className="dav__confirm">
            <p>
              将用云端 {fmtTime(pending.exportedAt)} 的备份覆盖本机
              {pending.device ? `（来自 ${pending.device}）` : ''}，本机当前数据会被替换。
            </p>
            <div className="dav__ops">
              <Button size="sm" variant="primary" onClick={doRestore}>
                确认覆盖
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setPending(null); setNote(''); }}>
                取消
              </Button>
            </div>
          </div>
        )}

        {note && <small className="dav__note">{note}</small>}
        {!cfg.remember && <small className="dav__hint">未记住密码：关掉页面后需要重新输入</small>}
        </div>
      </div>
    </div>
  );
}

export function SettingsSheet({
  open,
  onClose,
  showProfile,
}: {
  open: boolean;
  onClose: () => void;
  showProfile?: boolean;
}) {
  const s = settings.use();
  const hasFigures = useCharacters().length > 0;
  return (
    <Sheet open={open} onClose={onClose} title={showProfile ? '设置' : '外观'}>
      {showProfile && (
        <>
          <Field label="昵称" hint="联机时其他玩家看到的名字">
            <NameEditor />
          </Field>
          <AvatarSection />
        </>
      )}
      <AiSection />
      <ServerSection />
      <SyncSection />
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
      {!showProfile && hasFigures && (
        <Field label="虚拟形象" hint="牌桌上所有人以全身像素形象显示">
          <Switch checked={s.figures} onChange={(v) => settings.set({ figures: v })} />
        </Field>
      )}
      <Field label="四色牌" hint="方块蓝色、梅花绿色">
        <Switch checked={s.fourColor} onChange={(v) => settings.set({ fourColor: v })} />
      </Field>
      <Field label="记牌器" hint="斗地主中显示剩余的牌">
        <Switch checked={s.cardCounter} onChange={(v) => settings.set({ cardCounter: v })} />
      </Field>
      <Field label="音效" hint="报牌语音与操作音">
        <Switch checked={s.sound} onChange={(v) => settings.set({ sound: v })} />
      </Field>
      <Field label="试听报牌" hint="听不到声音时点这里自测">
        <Button
          variant="secondary"
          onClick={() => {
            callout('炸弹', { force: true });
            toast('应当听到「炸弹」两个字');
          }}
        >
          播放「炸弹」
        </Button>
      </Field>
      <Field label="界面">
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
    </Sheet>
  );
}
