import { useEffect, useState } from 'react';
import { applyBarColor, syncBarColor } from '../lib/barcolor';

/** 开屏：整屏水墨，2 秒后淡出。文字已在画里（右下孤亭上方的「闲亭一局棋」），不再叠加任何字。 */
export function Splash() {
  const [gone, setGone] = useState(false);
  const [hide, setHide] = useState(false);

  useEffect(() => {
    // 开屏是整屏水墨：状态栏也必须压成同一墨色，否则顶部会有一条亮边
    applyBarColor('#121614');
    const t1 = setTimeout(() => setHide(true), 2000);
    const t2 = setTimeout(() => setGone(true), 2700);
    return () => {
      syncBarColor();
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (gone) return null;
  return (
    <div className={`splash${hide ? ' is-hide' : ''}`} aria-hidden>
      <img className="splash__art" src="/splash.jpg" alt="" />
    </div>
  );
}
