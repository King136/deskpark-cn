import type { ck } from '@park/engine';
import { useState } from 'react';
import { Button, Sheet } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { callout } from '../../lib/callout';
import { movesFrom } from '@park/engine';
import './checkers.css';

type Ctl = GameController<ck.CkView, ck.CkAction>;

export default function CheckersBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const [pick, setPick] = useState<number | null>(null);
  const myTurn = v.seat !== null && v.turn === v.seat && !v.over;
  const targets = pick !== null && myTurn ? movesFrom(v.board, v.size, pick, v.turn).map((m) => m.to) : [];

  const tap = (i: number) => {
    if (!myTurn) return;
    const val = v.board[i];
    const mineVal = v.seat === 0 ? val === 1 || val === 3 : val === 2 || val === 4;
    if (pick === null) {
      if (mineVal) setPick(i);
      return;
    }
    if (pick === i) {
      setPick(null);
      return;
    }
    if (targets.includes(i)) {
      const before = v.foe;
      ctl.act({ type: 'move', from: pick, to: i });
      setPick(null);
      if (before !== v.foe) callout('吃子');
      else if (v.over) callout('赢下这局');
      return;
    }
    setPick(mineVal ? i : null);
  };

  return (
    <div className="ck">
      <div className="ck__head">
        <span>我方 {v.mine}</span>
        <span>对方 {v.foe}</span>
        <span>{myTurn ? '轮到你' : '等对方'}</span>
      </div>
      <div className="ck__stage">
        <div
          className="ck__board"
          style={{
            gridTemplateColumns: `repeat(${v.size}, 1fr)`,
            gridTemplateRows: `repeat(${v.size}, minmax(0, 1fr))`,
          }}
        >
          {v.board.map((val, i) => {
            const x = i % v.size;
            const y = Math.floor(i / v.size);
            const dark = (x + y) % 2 === 1;
            return (
              <button
                key={i}
                className={`ck__cell${dark ? ' dark' : ''}${pick === i ? ' is-pick' : ''}${targets.includes(i) ? ' is-target' : ''}`}
                onClick={() => tap(i)}
              >
                {val > 0 && (
                  <span className={`ck__piece${val <= 2 ? '' : ' king'} ${val === 1 ? 'red' : 'black'}`}>
                    {val > 2 ? '♛' : ''}
                  </span>
                )}
              </button>
            );
          })}
        </div>
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
        <p className="ck__result">点自己棋子选中，再点绿色落点走子</p>
      </Sheet>
    </div>
  );
}
