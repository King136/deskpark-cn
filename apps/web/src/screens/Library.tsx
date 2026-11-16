import { ChevronLeft, Download, FolderOpen, Gamepad2, MoreHorizontal, Play, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, IconButton, Segmented, Sheet, toast } from '../components/ui';
import { navigate } from '../lib/router';
import { serverUrl } from '../lib/platform';
import type { Platform, RomItem } from '../lib/roms';
import {
  PLATFORM_LABEL,
  addRom,
  formatSize,
  listRoms,
  removeRom,
  romPlayUrl,
  updateRom,
} from '../lib/roms';
import './library.css';

type Tab = 'all' | 'web' | 'handheld' | 'other';

const HANDHELD: Platform[] = ['fc', 'gb', 'gba'];

export function Library() {
  const [items, setItems] = useState<RomItem[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<RomItem | null>(null);
  const [play, setPlay] = useState<{ url: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reload = () => {
    void listRoms().then(setItems);
  };
  useEffect(reload, []);

  // 主机（NAS / 手机）上的共享游戏库：以服务端为准，各设备按需拉一份
  const [hostLib, setHostLib] = useState<{ name: string; size: number; url: string }[]>([]);
  const loadHostLib = async () => {
    try {
      const base = new URL(serverUrl().replace(/^ws/, 'http'));
      const origin = `${base.protocol}//${base.host}`;
      const res = await fetch(`${origin}/api/library`, { cache: 'no-store' });
      const data = (await res.json()) as { files?: { name: string; size: number; url: string }[] };
      setHostLib(data.files ?? []);
    } catch {
      setHostLib([]);
    }
  };
  useEffect(() => {
    void loadHostLib();
  }, []);
  const pull = async (f: { name: string; url: string }) => {
    setBusy(true);
    try {
      const base = new URL(serverUrl().replace(/^ws/, 'http'));
      const blob = await (await fetch(`${base.protocol}//${base.host}${f.url}`)).blob();
      await addRom(new File([blob], f.name));
      reload();
      toast(`已从主机导入 ${f.name}`);
    } catch {
      toast('主机库拉取失败，确认地址和网络', 'error');
    } finally {
      setBusy(false);
    }
  };

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await addRom(f);
      reload();
      toast(`已导入 ${files.length} 个文件`);
    } catch {
      toast('导入失败，可能空间不足', 'error');
    } finally {
      setBusy(false);
    }
  };

  const launch = async (item: RomItem) => {
    if (item.platform === 'h5' || item.platform === 'cocos') {
      const url = await romPlayUrl(item);
      if (!url) return toast('这个包读不出来，先确认里面有 index.html', 'error');
      setPlay({ url, name: item.name });
      return;
    }
    setDetail(item);
  };

  const filtered = items.filter((i) =>
    tab === 'all'
      ? true
      : tab === 'web'
        ? i.platform === 'h5' || i.platform === 'cocos'
        : tab === 'handheld'
          ? HANDHELD.includes(i.platform)
          : !['h5', 'cocos', ...HANDHELD].includes(i.platform),
  );

  return (
    <div className="lib">
      <header className="lib__top">
        <button className="lib__back" onClick={() => navigate('/')} aria-label="回大厅">
          <ChevronLeft size={18} />
          <span>大厅</span>
        </button>
        <h1>游戏库</h1>
        <IconButton label="导入游戏" onClick={() => fileRef.current?.click()}>
          <Download size={19} />
        </IconButton>
      </header>

      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void pick(e.target.files);
          e.target.value = '';
        }}
      />

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'all', label: '全部' },
          { value: 'web', label: 'H5 / Cocos' },
          { value: 'handheld', label: '掌机' },
          { value: 'other', label: '其它' },
        ]}
      />

      <button className="lib__drop" onClick={() => fileRef.current?.click()} disabled={busy}>
        <FolderOpen size={20} />
        <span>{busy ? '正在导入…' : '导入游戏文件'}</span>
        <small>html / zip / nes / gb / gba，文件只存在这台设备上</small>
      </button>

      {filtered.length === 0 ? (
        <p className="lib__empty">还没有导入过游戏。H5 与 Cocos 可直接在这里打开，掌机 ROM 交给模拟器。</p>
      ) : (
        <ul className="lib__list">
          {filtered.map((it) => (
            <li key={it.id}>
              <button className="lib__card" onClick={() => void launch(it)}>
                <span className={`lib__badge is-${it.platform}`}>
                  {PLATFORM_LABEL[it.platform]}
                </span>
                <span className="lib__name">{it.name}</span>
                <small>{formatSize(it.size)}</small>
                <span className="lib__go">
                  <Play size={15} />
                </span>
              </button>
              <IconButton label="更多" onClick={() => setDetail(it)}>
                <MoreHorizontal size={17} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {hostLib.length > 0 && (
        <section className="lib__host">
          <header>
            <b>主机游戏库</b>
            <small>{hostLib.length} 个文件 · 以服务端为准</small>
            <Button size="sm" variant="ghost" onClick={() => void loadHostLib()}>
              刷新
            </Button>
          </header>
          <ul>
            {hostLib.map((f) => (
              <li key={f.name}>
                <span className="lib__name">{f.name}</span>
                <small>{formatSize(f.size)}</small>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void pull(f)}>
                  导入
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="lib__row">
        <Gamepad2 size={16} />
        <span>想要更多玩法？回大厅开一桌扑克、麻将或棋类。</span>
        <Button size="sm" variant="ghost" onClick={() => navigate('/')}>
          去大厅
        </Button>
      </section>

      {play && (
        <div className="lib__player">
          <header>
            <button onClick={() => setPlay(null)} aria-label="退出游戏">
              <ChevronLeft size={18} /> 返回
            </button>
            <span>{play.name}</span>
            <button onClick={() => setPlay(null)} aria-label="关闭">
              关闭
            </button>
          </header>
          <iframe
            key={play.url}
            src={play.url}
            title={play.name}
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-pointer-lock"
          />
        </div>
      )}

      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail?.name ?? ''} wide>
        {detail && (
          <div className="lib__detail">
            <p>
              平台：{PLATFORM_LABEL[detail.platform]}
              <br />
              文件：{detail.fileName}（{formatSize(detail.size)}）
            </p>
            {(detail.platform === 'h5' || detail.platform === 'cocos') && (
              <Button variant="primary" size="sm" onClick={() => void launch(detail)}>
                打开游戏
              </Button>
            )}
            {HANDHELD.includes(detail.platform) && (
              <>
                <p className="lib__hint">
                  掌机 ROM 需要模拟器来跑：把这台设备上的文件（或重新导入的原文件）交给
                  RetroArch、My Boy、Pizza Boy 等模拟器打开即可。闲亭负责整理、归档和一键跳转。
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard?.writeText(detail.fileName);
                    toast('文件名已复制，去模拟器里选择它');
                  }}
                >
                  复制文件名
                </Button>
              </>
            )}
            <div className="lib__rename">
              <input
                defaultValue={detail.name}
                maxLength={40}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== detail.name) {
                    void updateRom(detail.id, { name }).then(reload);
                    toast('已改名');
                  }
                }}
                aria-label="改名"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void removeRom(detail.id).then(() => {
                  reload();
                  setDetail(null);
                  toast('已删除');
                });
              }}
            >
              <Trash2 size={15} /> 删除
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
