import { useEffect, useMemo } from 'react';
import type { GameController } from '../lib/controller';
import './resultOverlay.css';

type Verdict = 'win' | 'lose' | 'draw';

/** 从各玩法 view 里尽量读出的胜负：优先 winner / winners，其次 win / result，最后按分数 */
function verdictOf(ctl: GameController): Verdict {
  const v = (ctl.view ?? {}) as Record<string, any>;
  const seat = ctl.seat ?? 0;
  if (v.winner != null) return v.winner === seat ? 'win' : 'lose';
  if (Array.isArray(v.winners)) return v.winners.includes(seat) ? 'win' : 'lose';
  if (typeof v.win === 'boolean' && v.players == null) return v.win ? 'win' : 'lose';
  if (v.result && typeof v.result === 'object') {
    const r = v.result;
    if (r.winner != null) return r.winner === seat ? 'win' : 'lose';
    if (typeof r.landlordWin === 'boolean') {
      const iAmLandlord = r.landlord === seat;
      return iAmLandlord === r.landlordWin ? 'win' : 'lose';
    }
  }
  // 单人通关类：有 won 字段
  if (typeof v.won === 'boolean') return v.won ? 'win' : 'lose';
  // 棋类和棋牌：可从分数判断（我最高分=赢）
  const scores = v.scores ?? v.chips ?? v.roundDeltas;
  if (Array.isArray(scores) && scores.length > seat) {
    const mine = scores[seat] ?? 0;
    const best = Math.max(...scores);
    if (mine >= best && mine > 0) return 'win';
  }
  // 单人跌局（扫雷踩雷/贪吃蛇撞墙/俄罗斯方块堆顶）没有胜者字段，按"未通关"作失败处理
  return 'lose';
}

const VERDICT_TEXT: Record<Verdict, { title: string; sub: string }> = {
  win: { title: '旗开得胜', sub: '这一局，赢得漂亮' },
  lose: { title: '再来一局', sub: '别急，好牌总在后头' },
  draw: { title: '握手言和', sub: '势均力敌，棋逢对手' },
};

/** 一朵向日葵：headUp=true 抬头（开心），false 低头（沮丧） */
function Sunflower({ up, style, seed }: { up: boolean; style: React.CSSProperties; seed: number }) {
  const petals = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div className={`sf-flower${up ? ' is-up' : ' is-down'}`} style={style} aria-hidden="true">
      <div className="sf-flower__head">
        <div className="sf-flower__petals">
          {petals.map((i) => (
            <i key={i} style={{ transform: `rotate(${(360 / petals.length) * i + seed}deg)` }} />
          ))}
        </div>
        <div className="sf-flower__face">
          <span className="sf-flower__eye sf-flower__eye--l" />
          <span className="sf-flower__eye sf-flower__eye--r" />
          <span className="sf-flower__mouth" />
        </div>
      </div>
      <div className="sf-flower__stem" />
      <div className="sf-flower__leaf sf-flower__leaf--l" />
      <div className="sf-flower__leaf sf-flower__leaf--r" />
    </div>
  );
}

/** 一束烟花：中心爆开 + 放射光点 */
function Firework({ style, hue }: { style: React.CSSProperties; hue: number }) {
  const sparks = Array.from({ length: 14 }, (_, i) => i);
  return (
    <div className="sf-firework" style={{ ...style, filter: `hue-rotate(${hue}deg)` }} aria-hidden="true">
      {sparks.map((i) => (
        <i
          key={i}
          style={{
            transform: `rotate(${(360 / sparks.length) * i}deg) translateY(calc(var(--fw-r) * -1))`,
            animationDelay: `${(i % 5) * 30}ms`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * 终局透明浮动层：不拦截任何点击（pointer-events:none），只做氛围提示。
 * 失败：几棵低头向日葵从天而降；胜利：抬头向日葵 + 大片烟花。
 */
export function ResultOverlay({ ctl }: { ctl: GameController }) {
  const verdict: Verdict = useMemo(() => verdictOf(ctl), [ctl.view, ctl.over, ctl.seat]);
  const text = VERDICT_TEXT[verdict];
  // 稳定随机：同一局重渲染不闪烁
  const seed = useMemo(() => {
    const s = Math.floor((ctl.seat ?? 0) * 17 + (ctl.version ?? 0) * 7);
    return s % 40;
  }, [ctl.seat, ctl.version]);

  // 终局时震动一下有意义（失败轻、胜利强）；失败静默
  useEffect(() => {
    if (!ctl.over || verdict !== 'win') return;
    const h = window.setTimeout(() => navigator.vibrate?.([30, 40, 60]), 120);
    return () => window.clearTimeout(h);
  }, [ctl.over, verdict]);

  if (!ctl.over) return null;

  const flowers =
    verdict === 'win'
      ? [
          { left: '14%', delay: '0ms', scale: 1.0 },
          { left: '78%', delay: '140ms', scale: 0.9 },
          { left: '46%', delay: '80ms', scale: 1.15 },
        ]
      : [
          { left: '18%', delay: '0ms', scale: 0.95 },
          { left: '64%', delay: '180ms', scale: 0.85 },
          { left: '40%', delay: '90ms', scale: 1.05 },
        ];

  return (
    <div
      className={`sf-overlay sf-overlay--${verdict}`}
      aria-live="polite"
      style={{ '--sf-drop': `clamp(180px, 42vh, 420px)` } as React.CSSProperties}
    >
      {flowers.map((f, i) => (
        <Sunflower
          key={i}
          up={verdict !== 'lose'}
          seed={seed + i * 7}
          style={
            {
              left: f.left,
              '--sf-delay': f.delay,
              '--sf-scale': f.scale,
            } as React.CSSProperties
          }
        />
      ))}
      {verdict === 'win' && (
        <div className="sf-fireworks">
          <Firework style={{ top: '14%', left: '24%', '--fw-r': '46px', animationDelay: '0ms' } as React.CSSProperties} hue={0} />
          <Firework style={{ top: '10%', left: '72%', '--fw-r': '54px', animationDelay: '420ms' } as React.CSSProperties} hue={60} />
          <Firework style={{ top: '24%', left: '88%', '--fw-r': '38px', animationDelay: '780ms' } as React.CSSProperties} hue={140} />
          <Firework style={{ top: '30%', left: '10%', '--fw-r': '42px', animationDelay: '1100ms' } as React.CSSProperties} hue={210} />
          <Firework style={{ top: '6%', left: '48%', '--fw-r': '58px', animationDelay: '1500ms' } as React.CSSProperties} hue={300} />
        </div>
      )}
      <div className="sf-overlay__banner">
        <b>{text.title}</b>
        <small>{text.sub}</small>
      </div>
    </div>
  );
}
