import { settings } from './store';

/**
 * 报牌 / 语音播报：不下载任何语音包，用系统 TTS（WebView 与桌面浏览器都自带 zh-CN）。
 * 音量与音效共用同一个「音效」开关；短句 + 限流，避免连续出牌时叠成一团。
 */
let lastAt = 0;
let lastText = '';

export function primeVoice(): void {
  try {
    globalThis.speechSynthesis?.getVoices();
  } catch {
    /* 老 WebView 没有 TTS，静默降级为只有画面 */
  }
}

export function callout(text: string, opts?: { force?: boolean }): void {
  if (!text) return;
  if (!settings.get().sound && !opts?.force) return;
  const now = Date.now();
  if (text === lastText && now - lastAt < 1200) return;
  if (now - lastAt < 260) return;
  lastAt = now;
  lastText = text;
  try {
    const s = globalThis.speechSynthesis;
    if (!s) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1.12;
    u.pitch = 1.02;
    u.volume = 0.8;
    s.speak(u);
  } catch {
    /* 忽略 */
  }
}
