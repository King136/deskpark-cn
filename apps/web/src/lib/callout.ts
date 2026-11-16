import { settings } from './store';

/**
 * 报牌 / 语音播报。
 * 优先走 App 内置的原生 TTS（WebView 本身不实现 SpeechSynthesis），
 * 退回系统 TTS；两条都没有时，画面上的报牌气泡仍然会出，不会静默失败。
 */
let lastAt = 0;
let lastText = '';
let seq = 0;

export interface Cue {
  id: number;
  text: string;
}

const subs = new Set<(c: Cue) => void>();
let latest: Cue | null = null;

export function subscribeCallout(fn: (c: Cue) => void): () => void {
  subs.add(fn);
  if (latest) fn(latest);
  return () => subs.delete(fn);
}

export function currentCue(): Cue | null {
  return latest;
}

interface NativeVoice {
  speak?: (text: string) => void;
}

interface CapPlugins {
  Capacitor?: {
    Plugins?: {
      ParkHost?: { speak?: (o: { text: string; key?: string }) => Promise<{ ok?: boolean } | void> };
    };
  };
}

/**
 * 走 Capacitor 插件通道朗读。返回 true 表示"这座桥在且报成功"；
 * 插件存在但 TTS 引擎不可用时返回 false，让调用方退到兜底音，避免静默。
 */
/** 把报牌文案映射到内置音频片段，命中就直接播，零延迟、离线可用 */
const CLIP_RULES: [RegExp, string][] = [
  [/王炸/, 'wangzha'],
  [/炸弹|炸/, 'zhadan'],
  [/飞机/, 'feiji'],
  [/连对/, 'liandui'],
  [/顺子/, 'shun'],
  [/三带/, 'sandai'],
  [/三条|三张/, 'tiao'],
  [/对子|一对/, 'dui'],
  [/单张/, 'dan'],
  [/报单/, 'baodan'],
  [/报双/, 'baoshuang'],
  [/不要|过/, 'bujiao'],
  [/五连/, 'five'],
  [/落子/, 'place'],
  [/轮到你/, 'turn'],
  [/赢了|拿下/, 'win'],
  [/输了/, 'lose'],
  [/开始/, 'ready'],
];

function clipKey(text: string): string {
  for (const [re, key] of CLIP_RULES) if (re.test(text)) return key;
  return '';
}

/** 网页端直接播内置 mp3（APK 里就是 assets/public/clips） */
function playClip(key: string): boolean {
  if (!key || !settings.get().sound) return false;
  try {
    const a = new Audio(`/clips/${key}.mp3`);
    a.volume = 1;
    void a.play();
    return true;
  } catch {
    return false;
  }
}

function pluginSpeak(text: string, key = ''): boolean {
  const p = (globalThis as CapPlugins).Capacitor?.Plugins?.ParkHost;
  try {
    if (!p?.speak) return false;
    void p.speak({ text, key }).then(
      (r) => {
        if (r && r.ok === false) fallbackTone();
      },
      () => fallbackTone(),
    );
    return true;
  } catch {
    return false;
  }
}

function nativeSpeak(text: string): boolean {
  const host = (globalThis as { ParkHost?: NativeVoice }).ParkHost;
  try {
    if (host?.speak) {
      host.speak(text);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

let beep: AudioContext | null = null;
function fallbackTone(): void {
  try {
    if (!settings.get().sound) return;
    beep = beep ?? new AudioContext();
    const ac = beep;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 740;
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.14, ac.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.12);
    osc.connect(g).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + 0.14);
  } catch {
    /* 没有音频上下文也不影响文字 */
  }
}

/** 屏幕上的报牌气泡：直接创建 DOM，任何页面外壳都看得到 */
function showBalloon(text: string): void {
  try {
    const doc = document;
    let layer = doc.getElementById('park-cue-layer');
    if (!layer) {
      layer = doc.createElement('div');
      layer.id = 'park-cue-layer';
      doc.body.appendChild(layer);
    }
    const node = doc.createElement('div');
    node.className = 'park-cue';
    node.textContent = text;
    layer.appendChild(node);
    setTimeout(() => node.remove(), 1600);
    if (layer.childElementCount > 3) layer.firstElementChild?.remove();
  } catch {
    /* SSR / 无 DOM 时忽略 */
  }
}

export function primeVoice(): void {
  try {
    globalThis.speechSynthesis?.getVoices();
  } catch {
    /* 没有 TTS 也不影响画面 */
  }
}

export function callout(text: string, opts?: { force?: boolean }): void {
  if (!text) return;
  const now = Date.now();
  if (text === lastText && now - lastAt < 1200) return;
  if (now - lastAt < 260) return;
  lastAt = now;
  lastText = text;

  // 画面上的报牌气泡：任何时候都出，保证「看得见」
  latest = { id: ++seq, text };
  for (const f of subs) f(latest);
  showBalloon(text);

  if (!settings.get().sound && !opts?.force) return;
  const key = clipKey(text);
  if (pluginSpeak(text, key) || nativeSpeak(text) || playClip(key)) return;
  try {
    const s = globalThis.speechSynthesis;
    if (!s) {
      fallbackTone();
      return;
    }
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1.12;
    u.pitch = 1.02;
    u.volume = 0.85;
    s.speak(u);
    // 有些 WebView 有接口但不出声：同时给一声轻提示，保证「有反应」
    fallbackTone();
  } catch {
    fallbackTone();
  }
}
