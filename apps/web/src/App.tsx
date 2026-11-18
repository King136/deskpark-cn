import { Suspense, lazy, useEffect, useState } from 'react';
import { Splash } from './components/Splash';
import { Button, Sheet } from './components/ui';
import { ToastHost, toast } from './components/ui';
import { syncBarColor } from './lib/barcolor';
import { useDeviceForm } from './lib/deviceForm';
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
    const applyBar = () => {
      const darkNow = document.documentElement.dataset.theme === 'dark';
      const name = darkNow ? 'dark' : 'light';
      try {
        const cap = (
          globalThis as {
            Capacitor?: { Plugins?: { ParkHost?: { setBarTheme?: (o: { theme: string }) => Promise<unknown> } } };
            ParkHost?: { setBarTheme?: (t: string) => void };
          }
        ).Capacitor?.Plugins?.ParkHost;
        if (cap?.setBarTheme) void cap.setBarTheme({ theme: name }).catch(() => {});
        else (globalThis as { ParkHost?: { setBarTheme?: (t: string) => void } }).ParkHost?.setBarTheme?.(name);
      } catch {
        /* 浏览器 */
      }
    };

    const apply = () => {
      const dark = s.theme === 'dark' || (s.theme === 'system' && media.matches);
      root.dataset.theme = dark ? 'dark' : 'light';
      const themeName = dark ? 'dark' : 'light';
      root.style.background = dark ? '#121314' : '#f4f1ea';
      if (document.body) document.body.style.background = dark ? '#121314' : '#f4f1ea';
      try {
        const cap = (
          globalThis as {
            Capacitor?: { Plugins?: { ParkHost?: { setBarTheme?: (o: { theme: string }) => Promise<unknown> } } };
            ParkHost?: { setBarTheme?: (t: string) => void };
          }
        ).Capacitor?.Plugins?.ParkHost;
        if (cap?.setBarTheme) void cap.setBarTheme({ theme: themeName }).catch(() => {});
        else (globalThis as { ParkHost?: { setBarTheme?: (t: string) => void } }).ParkHost?.setBarTheme?.(themeName);
      } catch {
        /* 浏览器里没有这个方法 */
      }
      // WebView 起来后插件可能还没挂上，重试几次；回前台也再刷。
      // 统一登记定时器，卸载/主题切换时清理，避免过期回调（L5）。
      for (const delay of [0, 400, 1200]) {
        const h = window.setTimeout(() => {
          timers.delete(h);
          applyBar();
        }, delay);
        timers.add(h);
      }
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#121314' : '#f4f1ea');
    };
    const timers = new Set<number>();
    apply();
    media.addEventListener('change', apply);
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        const h = window.setTimeout(() => {
          timers.delete(h);
          applyBar();
        }, 0);
        timers.add(h);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      media.removeEventListener('change', apply);
      document.removeEventListener('visibilitychange', onVis);
      timers.forEach((h) => window.clearTimeout(h));
      timers.clear();
    };
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
  // 设备形态识别：写入 <html data-device/data-orientation>，驱动 device.css 五形态适配
  useDeviceForm();
  useEffect(() => {
    const t = setTimeout(() => syncBarColor(), 120);
    return () => clearTimeout(t);
  }, [route]);
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

  // 设备画像上报：默认关闭，仅在用户显式开启（localStorage park.profile.optin='1'）后上报。
  // 仅取浏览器可见信息，不含任何权限数据；这是隐私合规的 opt-in 设计（v0.5.0）。
  useEffect(() => {
    if (localStorage.getItem('park.profile.optin') !== '1') return;
    const t = setTimeout(() => {
      try {
        const body = JSON.stringify({
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
