import { useEffect, useState } from 'react';

/**
 * 开屏：水墨群山孤亭 + 毛笔题字。
 * 停留 2 秒后淡出，全程约 2.6 秒。
 */
export function Splash() {
  const [gone, setGone] = useState(false);
  const [hide, setHide] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setHide(true), 2000);
    const t2 = setTimeout(() => setGone(true), 2700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (gone) return null;
  return (
    <div className={`splash${hide ? ' is-hide' : ''}`} aria-hidden>
      <img className="splash__art" src="/splash.jpg" alt="" />
      <div className="splash__name">闲亭</div>
    </div>
  );
}
