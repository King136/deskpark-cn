import { memo } from 'react';
import type { CSSProperties, HTMLAttributes } from 'react';

/**
 * 立体点数骰子（跨平台一致的矢量绘制）：
 * 象牙面 + 凹陷圆点 + 顶光侧影，1-6 点按标准骰面排布。
 */

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [27, 27],
    [73, 73],
  ],
  3: [
    [25, 25],
    [50, 50],
    [75, 75],
  ],
  4: [
    [27, 27],
    [73, 27],
    [27, 73],
    [73, 73],
  ],
  5: [
    [27, 27],
    [73, 27],
    [50, 50],
    [27, 73],
    [73, 73],
  ],
  6: [
    [27, 24],
    [73, 24],
    [27, 50],
    [73, 50],
    [27, 76],
    [73, 76],
  ],
};

export interface DiceProps extends HTMLAttributes<HTMLSpanElement> {
  /** 1-6；0 或未传表示未掷（显示问号纹面） */
  value?: number;
  /** 尺寸（CSS 长度），默认 var(--dice, 56px) */
  size?: string;
  rolling?: boolean;
}

export const Dice = memo(function Dice({ value, size, rolling, className = '', style, ...rest }: DiceProps) {
  const v = value && value >= 1 && value <= 6 ? value : 0;
  const s = { '--dice': size, ...style } as CSSProperties;
  return (
    <span className={`dice${rolling ? ' is-rolling' : ''} ${className}`} style={s} role="img" aria-label={v ? `骰子 ${v} 点` : '骰子'} {...rest}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id="dice-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fffcf3" />
            <stop offset="0.62" stopColor="#f4ecda" />
            <stop offset="1" stopColor="#e7dcc2" />
          </linearGradient>
        </defs>
        <rect x={6} y={6} width={88} height={88} rx={20} fill="url(#dice-face)" />
        <rect x={6} y={6} width={88} height={88} rx={20} fill="none" stroke="rgba(120,98,60,0.35)" strokeWidth={1.6} />
        {/* 顶光 */}
        <rect x={13} y={10} width={74} height={30} rx={14} fill="#ffffff" opacity={0.5} />
        {v === 0 ? (
          <text x={50} y={64} fontSize={40} fontWeight={800} textAnchor="middle" fill="rgba(90,74,44,0.55)" fontFamily="inherit">
            ?
          </text>
        ) : (
          PIPS[v].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y + 1.6} r={8.6} fill="rgba(60,42,20,0.28)" />
              <circle cx={x} cy={y} r={8.2} fill="#3d2f1a" />
              <circle cx={x - 2.4} cy={y - 2.6} r={2.6} fill="rgba(255,255,255,0.55)" />
            </g>
          ))
        )}
      </svg>
    </span>
  );
});
