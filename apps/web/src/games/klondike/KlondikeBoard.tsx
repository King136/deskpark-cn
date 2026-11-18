import type { kl } from '@park/engine';
import { useState } from 'react';
import { Button, Sheet } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { callout } from '../../lib/callout';
import './klondike.css';

type Ctl = GameController<kl.KlView, kl.KlAction>;
const RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT = ['♣', '♦', '♥', '♠'];

const label = (c: number) => `${RANK[(c % 13) + 1]}${SUIT[Math.floor(c / 13)]}`;
const isRed = (c: number) => Math.floor(c / 13) === 1 || Math.floor(c / 13) === 3;

export default function KlondikeBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const [pick, setPick] = useState<null | { from: 'tableau' | 'waste'; pile: number }>(null);

  const tapTableau = (col: number) => {
    const pile = v.tableau[col];
    if (pick) {
      ctl.act({ type: 'move', from: pick.from, pile: pick.pile, to: 'tableau', target: col });
      setPick(null);
      return;
    }
    if (pile.length) setPick({ from: 'tableau', pile: col });
  };

  const tapFoundation = (f: number) => {
    if (!pick) return;
    ctl.act({ type: 'move', from: pick.from, pile: pick.pile, to: 'foundation', target: f });
    setPick(null);
    if (v.win) callout('通关了');
  };

  return (
    <div className="kl">
      <div className="kl__head">
        <span>步数 {v.moves}</span>
        <span>{pick ? '已选中，点目标' : '点牌再点目标'}</span>
      </div>
      <div className="kl__top">
        <button className="kl__stock" onClick={() => { ctl.act({ type: 'draw' }); setPick(null); }}>
          {v.stock ? `倒牌 ${v.stock}` : '重翻'}
        </button>
        <button
          className={`kl__waste${pick?.from === 'waste' ? ' is-pick' : ''}`}
          onClick={() => {
            if (v.waste.length) setPick({ from: 'waste', pile: 0 });
          }}
        >
          {v.waste.length ? label(v.waste[v.waste.length - 1]) : ''}
        </button>
        {v.foundations.map((f, i) => (
          <button key={i} className="kl__found" onClick={() => tapFoundation(i)}>
            {f.length ? label(f[f.length - 1]) : SUIT[i]}
          </button>
        ))}
      </div>
      <div className="kl__table">
        {v.tableau.map((pile, col) => (
          <div key={col} className={`kl__col${pick?.from === 'tableau' && pick.pile === col ? ' is-pick' : ''}`} onClick={() => tapTableau(col)}>
            {pile.length === 0 && <i className="kl__slot" />}
            {pile.map((c, i) => (
              <span
                key={c}
                className={`kl__card${isRed(c) ? ' red' : ''}${i === pile.length - 1 ? ' top' : ''}`}
                style={{ top: `${i * 22}%` }}
              >
                {label(c)}
              </span>
            ))}
          </div>
        ))}
      </div>
      <Sheet
        open={v.over}
        dismissible={false}
        title={v.win ? '收齐了，通关' : '本局结束'}
        footer={
          <>
            <Button onClick={() => ctl.leave()}>返回大厅</Button>
            <Button variant="primary" onClick={() => ctl.act({ type: 'ready' })}>换一局</Button>
          </>
        }
      >
        <p className="kl__result">共 {v.moves} 步</p>
      </Sheet>
    </div>
  );
}
