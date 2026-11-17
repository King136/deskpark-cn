import { Suspense, lazy, useEffect, useState } from 'react';
import { Splash } from './components/Splash';
import { Button, Sheet } from './components/ui';
import { ToastHost, toast } from './components/ui';
import { useOnline } from './lib/online';
import { useRoute } from './lib/router';
import { settings } from './lib/store';
import { Home } from './screens/Home';
import { Library } from './screens/Library';
import { LocalGame } from './screens/LocalGame';
import { Me } from './screens/Me';
import { OnlineRoom } from './screens/OnlineRoom';

const Gallery = import.meta.env.DEV ? lazy(() => import('./screens/Gallery')) : null;

function useThemeSync() {
  const s = settings.use();
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = s.theme === 'dark' || (s.theme === 'system' && media.matches);
      root.dataset.theme = dark ? 'dark' : 'light';
      try {
        (globalThis as { ParkHost?: { setBarTheme?: (t: string) => void } }).ParkHost?.setBarTheme?.(
          dark ? 'dark' : 'light',
        );
      } catch {
        /* 浏览器里没有这个方法 */
      }
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#121314' : '#f4f1ea');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [s.theme]);
  useEffect(() => {
    if (s.fourColor) document.documentElement.setAttribute('data-four-color', '');
    else document.documentElement.removeAttribute('data-four-color');
  }, [s.fourColor]);
}

function useOnlineErrors() {
  const net = useOnline();
  useEffect(() => {
    if (net.error && !/不存在/.test(net.error.message)) toast(net.error.message, 'error');
  }, [net.error]);
}

export function App() {
  const route = useRoute();
  const [askExit, setAskExit] = useState(false);
  useThemeSync();
  useOnlineErrors();

  // 返回键：先退一层，回到大厅后再按才提示确认退出，避免误触变大退
  useEffect(() => {
    const onBack = () => {
      if (window.location.hash && window.location.hash !== '#/' && window.location.hash !== '') {
        window.location.hash = '#/';
        return;
      }
      setAskExit(true);
    };
    window.addEventListener('park:back', onBack);
    return () => window.removeEventListener('park:back', onBack);
  }, []);

  // 上报告用画像（不需要任何系统权限，只取浏览器可见信息）
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const body = JSON.stringify({
          deviceId: localStorage.getItem('park.device') ?? undefined,
          screen: `${window.screen.width}x${window.screen.height}`,
          dpr: window.devicePixelRatio,
          lang: navigator.language,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ua: navigator.userAgent,
          platform: navigator.platform,
        });
        void fetch('/api/profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      } catch {
        /* ignore */
      }
    }, 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <Splash />
      {route.name === 'home' && <Home />}
      {route.name === 'play' && <LocalGame key={route.gameId} gameId={route.gameId} />}
      {route.name === 'room' && <OnlineRoom key={route.code} code={route.code} />}
      {route.name === 'library' && <Library />}
      {route.name === 'me' && <Me />}
      {route.name === 'gallery' && Gallery && (
        <Suspense fallback={null}>
          <Gallery />
        </Suspense>
      )}
      <ToastHost />
      <Sheet
        open={askExit}
        onClose={() => setAskExit(false)}
        title="要离开闲亭吗？"
        subtitle="牌桌会留在主机上，下次回来还能接着打"
        footer={
          <>
            <Button onClick={() => setAskExit(false)}>再玩一会儿</Button>
            <Button
              variant="primary"
              onClick={() => {
                const host = (globalThis as { ParkHost?: { exit?: () => void } }).ParkHost;
                if (host?.exit) host.exit();
                else setAskExit(false);
              }}
            >
              退出应用
            </Button>
          </>
        }
      >
        <p className="exit-hint">安卓返回键已改为「先退一层」，只有在大厅按返回才会问你要不要退出。</p>
      </Sheet>
    </>
  );
}
