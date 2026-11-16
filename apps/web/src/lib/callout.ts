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

  if (!settings.get().sound && !opts?.force) return;
  if (nativeSpeak(text)) return;
  try {
    const s = globalThis.speechSynthesis;
    if (!s) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1.12;
    u.pitch = 1.02;
    u.volume = 0.85;
    s.speak(u);
  } catch {
    /* 忽略 */
  }
}
