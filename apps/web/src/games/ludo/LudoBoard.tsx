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

  return (
    <div className="ld">
      <div className="ld__head">
        <span>{myTurn ? '轮到你掷骰' : '等对方'}</span>
        <span>目标 {v.track} 格</span>
      </div>
      <div className="ld__dice">{v.dice || '?'}</div>

      <div className="ld__board">
        <div
          className="ld__track"
          style={{ gridTemplateColumns: `repeat(${Math.max(6, Math.ceil(Math.sqrt(v.track * 1.4)))}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: v.track }, (_, c) => {
            const here = v.pos
              .map((tokens, p) => ({ p, n: tokens.filter((q) => q === c).length }))
              .filter((x) => x.n > 0);
            const cls = [
              'ld__cell',
              c === 0 ? 'is-start' : '',
              c === v.track - 1 ? 'is-goal' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div key={c} className={cls} title={`第 ${c + 1} 格`}>
                {/* 开局时全部棋子在机场，轨道没有棋子。留一个淡序号，用户才看得出这是一条 28 格的跑道 */}
                <small className="ld__no">{c + 1}</small>
                {here.map((h) => (
                  <i key={h.p} style={{ background: HUE[h.p] }}>
                    {h.n > 1 ? h.n : ''}
                  </i>
                ))}
              </div>
            );
          })}
        </div>
        <div className="ld__legend">
          {v.pos.map((_, p) => (
            <span key={p}>
              <i style={{ background: HUE[p] }} />
              {p === v.seat ? '我' : (NAMES[p] ?? `座${p + 1}`)}
            </span>
          ))}
          <span>终点 · 第 {v.track} 格</span>
        </div>
      </div>

      {/* 四家进度总览：既填掉轨道下方的空白，也让用户看得到对手走到哪了 */}
      <div className="ld__players">
        {v.pos.map((tokens, p) => {
          const me = p === v.seat;
          return (
            <div key={p} className={`ld__prow${me ? ' is-me' : ''}${v.turn === p && !v.over ? ' is-turn' : ''}`}>
              <i className="ld__pdot" style={{ background: HUE[p] }} />
              <span className="ld__pname">{me ? '我' : (NAMES[p] ?? `座${p + 1}`)}</span>
              <div className="ld__ptoks">
                {tokens.map((q, i) => {
                  const label = q < 0 ? '机场' : q >= v.track ? '到达' : `${q + 1}格`;
                  return me ? (
                    <button
                      key={i}
                      className={`ld__ptok${sel === i ? ' is-on' : ''}`}
                      onClick={() => setSel(i)}
                      aria-pressed={sel === i}
                    >
                      <b>{i + 1}</b>
                      <small>{label}</small>
                    </button>
                  ) : (
                    <span key={i} className="ld__ptok is-static">
                      <b>{i + 1}</b>
                      <small>{label}</small>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
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
