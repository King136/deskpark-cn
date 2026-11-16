import { useEffect, useState } from 'react';

/**
 * 开屏：群山孤亭的暗影，右侧古画式竖排题字。
 * 纯 SVG，离线可用，随系统主题微微调整底色。
 */
export function Splash() {
  const [gone, setGone] = useState(false);
  const [hide, setHide] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setHide(true), 1600);
    const t2 = setTimeout(() => setGone(true), 2400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (gone) return null;
  return (
    <div className={`splash${hide ? ' is-hide' : ''}`} aria-hidden>
      <svg className="splash__art" viewBox="0 0 100 160" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="sp-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1b1f1c" />
            <stop offset="55%" stopColor="#232a26" />
            <stop offset="100%" stopColor="#121614" />
          </linearGradient>
          <linearGradient id="sp-mist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d7d3c6" stopOpacity="0" />
            <stop offset="100%" stopColor="#d7d3c6" stopOpacity="0.16" />
          </linearGradient>
        </defs>
        <rect width="100" height="160" fill="url(#sp-sky)" />
        <circle cx="30" cy="26" r="5.5" fill="#e8e2cf" opacity="0.16" />
        <path d="M0 96 L16 72 L28 84 L40 62 L54 82 L62 76 L74 90 L100 78 L100 160 L0 160 Z" fill="#0d1210" opacity="0.85" />
        <path d="M0 112 L18 92 L34 104 L48 88 L64 102 L80 94 L100 110 L100 160 L0 160 Z" fill="#0a0e0c" opacity="0.9" />
        <path d="M0 96 L16 72 L28 84 L40 62 L54 82 L62 76 L74 90 L100 78 L100 160 L0 160 Z" fill="url(#sp-mist)" opacity="0.5" />
        <g transform="translate(50 96)" stroke="#060908" fill="#060908">
          <path d="M-9 -2 L9 -2 L7 8 L-7 8 Z" opacity="0.95" />
          <path d="M-7 8 L-9 18 L-7 18 L-5 10 Z" opacity="0.9" />
          <path d="M7 8 L9 18 L7 18 L5 10 Z" opacity="0.9" />
          <path d="M-2 -8 L0 -18 L2 -8 Z" opacity="0.9" />
          <path d="M-11 -1 L-14 -6 M11 -1 L14 -6" strokeWidth="1" opacity="0.8" />
        </g>
      </svg>
      <div className="splash__verse" aria-label="一生负气成今日">一生负气成今日</div>
      <div className="splash__name">闲亭</div>
    </div>
  );
}
