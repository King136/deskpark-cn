import type { ld } from '@park/engine';
import { useState } from 'react';
import { Button, Sheet } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { callout } from '../../lib/callout';
import './ludo.css';

type Ctl = GameController<ld.LdView, ld.LdAction>;
const NAMES = ['我', '黄机', '绿机', '蓝机'];
const HUE = ['#c9555a', '#d8b24a', '#5aa96b', '#5f76c8'];

export default function LudoBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const [sel, setSel] = useState(0);
  const myTurn = v.seat !== null && v.turn === v.seat && !v.over;
  const mine = v.seat !== null ? v.pos[v.seat] : [];

  return (
    <div className="ld">
      <div className="ld__head">
        <span>{myTurn ? '轮到你掷骰' : '等对方'}</span>
        <span>目标 {v.track} 格</span>
      </div>
      <div className="ld__dice">{v.dice || '?'}</div>
      <div className="ld__mine">
        {mine.map((p, i) => (
          <button key={i} className={`ld__tok${sel === i ? ' is-on' : ''}`} onClick={() => setSel(i)}>
            <b>{i + 1}</b>
            <small>{p < 0 ? '机场' : p >= v.track ? '到达' : `${p + 1}格`}</small>
          </button>
        ))}
      </div>
      <div className="ld__board">
        {v.pos.map((tokens, p) => (
          <div key={p} className="ld__row">
            <span className="ld__name" style={{ color: HUE[p] }}>{p === v.seat ? '我' : NAMES[p] ?? `座${p + 1}`}</span>
            {Array.from({ length: v.track }, (_, c) => {
              const here = tokens.filter((q) => q === c).length;
              return <i key={c} className={here ? 'on' : ''} style={here ? { background: HUE[p] } : undefined} />;
            })}
          </div>
        ))}
      </div>
      <div className="ld__ops">
        <Button disabled={!myTurn || v.dice > 0} onClick={() => { ctl.act({ type: 'roll' }); }}>掷骰</Button>
        <Button variant="primary" disabled={!myTurn || v.dice === 0} onClick={() => {
          ctl.act({ type: 'pick', token: sel });
          callout('前进');
        }}>走这枚</Button>
      </div>
      <Sheet
        open={v.over}
        dismissible={false}
        title={v.winner === v.seat ? '你先回家' : '这局输了'}
        footer={
          <>
            <Button onClick={() => ctl.leave()}>返回大厅</Button>
            <Button variant="primary" onClick={() => ctl.act({ type: 'ready' })}>再来一局</Button>
          </>
        }
      >
        <p className="ld__result">先掷骰，再选一枚棋子前进</p>
      </Sheet>
    </div>
  );
}
