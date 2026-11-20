import type { ld } from '@park/engine';
import { useState } from 'react';
import { Button, Sheet } from '../../components/ui';
import { Dice } from '../../components/Dice';
import type { GameController } from '../../lib/controller';
import { callout } from '../../lib/callout';
import './ludo.css';

type Ctl = GameController<ld.LdView, ld.LdAction>;
const NAMES = ['红机', '黄机', '绿机', '蓝机'];
const HUE = ['#c9555a', '#d8a63a', '#4f9e63', '#5472c4'];

/** 客机顶视图剪影：机头朝上 */
function Plane({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M12 1.6c1 0 1.9.8 1.9 1.9v4.6l7.3 4.3c.3.2.5.5.5.9v1.6l-7.8-2.3v4.4l2.1 1.6c.2.2.4.4.4.7v1.5L12 19.5l-4.4 1.3v-1.5c0-.3.2-.5.4-.7l2.1-1.6v-4.4L2.3 15.3v-1.6c0-.4.2-.7.5-.9l7.3-4.3V3.5c0-1 .9-1.9 1.9-1.9z"
        fill={color}
        stroke="rgba(0,0,0,0.28)"
        strokeWidth={0.7}
      />
      <circle cx={12} cy={6.2} r={1.15} fill="rgba(255,255,255,0.85)" />
    </svg>
  );
}

export default function LudoBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const [sel, setSel] = useState(0);
  const myTurn = v.seat !== null && v.turn === v.seat && !v.over;
  const COLS = 7;

  // 蛇形排列：偶数行从左到右，奇数行从右到左
  const cellPos = (c: number) => {
    const row = Math.floor(c / COLS);
    const col = row % 2 === 0 ? c % COLS : COLS - 1 - (c % COLS);
    return { row: row + 1, col: col + 1 };
  };

  return (
    <div className="ld">
      <div className="ld__top">
        <Dice value={v.dice} size="64px" rolling={myTurn && v.dice > 0} />
        <div className="ld__hint">
          <b>{myTurn ? (v.dice > 0 ? `掷出 ${v.dice} 点，选一枚飞机` : '轮到你掷骰') : v.over ? '本局结束' : '等对方行动'}</b>
          <small>目标 {v.track} 格 · 撞上同格对手把它踢回机场</small>
        </div>
      </div>

      <div className="ld__board">
        <div className="ld__track" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
          {Array.from({ length: v.track }, (_, c) => {
            const here = v.pos
              .flatMap((tokens, p) => tokens.map((q, t) => ({ p, t, q })))
              .filter((x) => x.q === c);
            const { row, col } = cellPos(c);
            const cls = [
              'ld__cell',
              c === 0 ? 'is-start' : '',
              c === v.track - 1 ? 'is-goal' : '',
              (Math.floor(c / COLS) + (c % COLS)) % 2 === 0 ? 'is-even' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div
                key={c}
                className={cls}
                style={{ gridRow: row, gridColumn: col }}
                title={`第 ${c + 1} 格`}
              >
                <small className="ld__no">{c + 1}</small>
                <div className="ld__planes">
                  {here.map((h, i) => (
                    <span key={`${h.p}-${h.t}`} className="ld__plane" style={{ zIndex: i }}>
                      <Plane color={HUE[h.p]} />
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 四家进度总览：机场里的飞机与途中的飞机一目了然 */}
      <div className="ld__players">
        {v.pos.map((tokens, p) => {
          const me = p === v.seat;
          const home = tokens.filter((q) => q < 0).length;
          const done = tokens.filter((q) => q >= v.track).length;
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
                      className={`ld__ptok${sel === i ? ' is-on' : ''}${q >= v.track ? ' is-done' : ''}`}
                      onClick={() => setSel(i)}
                      aria-pressed={sel === i}
                    >
                      <Plane color={q >= v.track ? '#8a9a6b' : HUE[p]} size={13} />
                      <small>{label}</small>
                    </button>
                  ) : (
                    <span key={i} className="ld__ptok is-static">
                      <Plane color={q >= v.track ? '#8a9a6b' : HUE[p]} size={13} />
                      <small>{label}</small>
                    </span>
                  );
                })}
              </div>
              <small className="ld__pstat">
                机场 {home} · 到达 {done}
              </small>
            </div>
          );
        })}
      </div>

      <div className="ld__ops">
        <Button disabled={!myTurn || v.dice > 0} onClick={() => { ctl.act({ type: 'roll' }); }}>掷骰</Button>
        <Button variant="primary" disabled={!myTurn || v.dice === 0} onClick={() => {
          ctl.act({ type: 'pick', token: sel });
          callout('起飞');
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
        <p className="ld__result">先掷骰，再选一枚飞机前进；撞上同格对手会把它踢回机场</p>
      </Sheet>
    </div>
  );
}

