import { useEffect, useRef, useState } from 'react';
import { applyBarColor, syncBarColor } from '../lib/barcolor';
import { PavilionMark } from './Brand';

const TITLE = '闲亭一局棋';

/**
 * 开屏：一张水墨，题字只占画面中轴。
 *
 * 和旧版的区别：
 * 1. 底色与原生启动图统一为纸白（#F4F1EA），冷启动不再「黑一下再跳白」；
 * 2. 原图里烧死的巨大题字被一团云雾盖住，改由 DOM 题字，字号约为原来的二分之一；
 * 3. 动效分三层：云雾先到 → 山色推开 → 题字逐字落墨，退场时整屏淡出、大厅再浮起。
 */
export function Splash() {
  const [phase, setPhase] = useState<'in' | 'out' | 'gone'>('in');
  const timers = useRef<number[]>([]);

  useEffect(() => {
    // 开屏是纸白：状态栏也压成同色，冷启动不会出现顶部黑条
    applyBarColor('#F4F1EA');
    document.documentElement.dataset.booting = '1';
    const hold = window.setTimeout(() => setPhase('out'), 2250);
    const done = window.setTimeout(() => {
      setPhase('gone');
      delete document.documentElement.dataset.booting;
      syncBarColor();
    }, 2720);
    timers.current = [hold, done];
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      delete document.documentElement.dataset.booting;
      syncBarColor();
    };
  }, []);

  if (phase === 'gone') return null;

  return (
    <div className={`splash is-${phase}`} aria-label="闲亭，一局棋" role="img">
      <div className="splash__paper" />
      <img className="splash__art" src="/splash-clean.jpg" alt="" draggable={false} />
      <div className="splash__veil" aria-hidden="true" />
      <div className="splash__mark" aria-hidden="true">
        <PavilionMark size={58} />
      </div>
      <h1 className="splash__title">
        {[...TITLE].map((ch, i) => (
          <span key={i} style={{ '--i': i } as React.CSSProperties}>
            {ch}
          </span>
        ))}
        <i className="splash__seal" aria-hidden="true">
          闲
        </i>
      </h1>
      <div className="splash__foot">
        <span>与亲友，或 AI，来一局</span>
        <i className="splash__line" />
      </div>
    </div>
  );
}
