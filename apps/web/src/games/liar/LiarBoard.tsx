import type { li } from '@park/engine';
import { useState } from 'react';
import { Button, Sheet } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { callout } from '../../lib/callout';
import './liar.css';

type Ctl = GameController<li.LiView, li.LiAction>;

/** 吹牛骰：喊数 → 对方加价 / 开盅 */
export default function LiarBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const [count, setCount] = useState((v.bid?.count ?? 0) + 1);
  const [face, setFace] = useState(v.bid?.face ?? 1);
  const myTurn = v.seat !== null && v.turn === v.seat && !v.over;
  // 每家骰数 × 家数 = 全场骰数，据此还原座位数，用来显示各家状态
  const seats = v.dice > 0 ? Math.max(1, Math.round(v.total / v.dice)) : 0;

  const bid = () => {
    if (!myTurn) return;
    ctl.act({ type: 'bid', count: Math.max(v.bid ? v.bid.count : 1, count), face });
    callout('我喊了');
  };

  return (
    <div className="li">
      <div className="li__head">
        <span>{v.over ? '本局结束' : myTurn ? '轮到你' : '等对方'}</span>
        <span>全场 {v.total} 颗</span>
      </div>
      <div className="li__bid">
        {v.bid ? `上家喊 ${v.bid.count} 个 ${v.bid.face}` : '还没人喊，你先开价'}
      </div>
      <div className="li__dice">
        <span className="li__dice-note">我的 {v.mine.length} 颗</span>
        <div className="li__dice-row">
          {v.mine.map((d, i) => (
            <span key={i} className="li__die">{d}</span>
          ))}
        </div>
      </div>
      <div className="li__seats">
        {Array.from({ length: seats }, (_, i) => (
          <span key={i} className={`li__seat${i === v.seat ? ' is-me' : ''}${v.turn === i && !v.over ? ' is-turn' : ''}`}>
            <b>{i === v.seat ? '我' : `座${i + 1}`}</b>
            <small>{v.dice} 颗</small>
          </span>
        ))}
      </div>
      <p className="li__hint">
        {v.bid ? '喊得比上家大：个数更多，或个数相同点数更大' : '先定个数与点数，再点「喊」开价'}
      </p>
      <div className="li__pick">
        <div className="li__row">
          <button onClick={() => setCount((c) => Math.max(1, c - 1))}>−</button>
          <b>{count} 个</b>
          <button onClick={() => setCount((c) => Math.min(v.total, c + 1))}>＋</button>
        </div>
        <div className="li__row">
          {[1, 2, 3, 4, 5, 6].map((f) => (
            <button key={f} className={face === f ? 'is-on' : ''} onClick={() => setFace(f)}>{f}</button>
          ))}
        </div>
      </div>
      <div className="li__ops">
        <Button variant="primary" disabled={!myTurn} onClick={bid}>喊</Button>
        <Button disabled={!myTurn || !v.bid} onClick={() => { ctl.act({ type: 'challenge' }); callout('开盅'); }}>开</Button>
      </div>
      <Sheet
        open={v.over}
        dismissible={false}
        title={v.winner === v.seat ? '你赢了' : '这局输了'}
        footer={
          <>
            <Button onClick={() => ctl.leave()}>返回大厅</Button>
            <Button variant="primary" onClick={() => ctl.act({ type: 'ready' })}>再来一局</Button>
          </>
        }
      >
        <p className="li__result">{v.reason}</p>
        {v.hands && (
          <div className="li__show">
            {v.hands.map((h, s) => <span key={s}>{s === 0 ? '我' : `座${s + 1}`}：{h.join(' ')}</span>)}
          </div>
        )}
      </Sheet>
    </div>
  );
}
