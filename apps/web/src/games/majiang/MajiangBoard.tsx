import type { mjx } from '@park/engine';
import { useState } from 'react';
import { Button, Sheet } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { callout } from '../../lib/callout';
import './majiang.css';

type Ctl = GameController<mjx.MjView, mjx.MjAction>;
const NAMES = ['东', '南', '西', '北'];

const SUIT_TXT = ['万', '条', '筒'];
const honor = ['东', '南', '西', '北', '中', '发', '白'];

export function tileText(t: number): string {
  if (t >= 27) return honor[t - 27] ?? '?';
  return `${(t % 9) + 1}${SUIT_TXT[Math.floor(t / 9)]}`;
}

/** 找一组能用手上两张牌 + 最后一张牌吃成的顺子 */
function findChi(hand: number[], t: number): [number, number] | null {
  if (t >= 27) return null;
  const base = Math.floor(t / 9) * 9;
  const rank = t % 9;
  for (const [a, b] of [[rank - 2, rank - 1], [rank - 1, rank + 1], [rank + 1, rank + 2]]) {
    if (a < 0 || b < 0 || a > 8 || b > 8) continue;
    const i = hand.indexOf(base + a);
    if (i < 0) continue;
    const j = hand.findIndex((v, idx) => idx !== i && v === base + b);
    if (j >= 0) return i < j ? [i, j] : [j, i];
  }
  return null;
}

export default function MajiangBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const [sel, setSel] = useState<number | null>(null);
  const myTurn = v.seat !== null && v.turn === v.seat && !v.over;
  const hand = v.seat !== null ? v.hands[v.seat] : [];
  const chi = v.last && v.seat !== null ? findChi(hand, v.last.tile) : null;

  const discard = (i: number) => {
    if (!myTurn) return;
    ctl.act({ type: 'discard', tile: i });
    setSel(null);
  };

  return (
    <div className="mj">
      <div className="mj__head">
        <span>余牌 {v.wall}</span>
        <span>{v.last ? `刚出 ${tileText(v.last.tile)}` : '等摸牌'}</span>
        <span>{v.over ? '本局结束' : myTurn ? '轮到你' : '等别家'}</span>
      </div>
      <div className="mj__table">
        {v.discards.map((pile, s) => (
          <div key={s} className={`mj__pile${v.turn === s ? ' is-turn' : ''}`}>
            <b>{NAMES[s]}</b>
            <div className="mj__pile-cards">
              {pile.map((t, i) => <i key={i}>{tileText(t)}</i>)}
            </div>
            <small>牌友 {v.hands[s]?.length ?? 0} 张</small>
          </div>
        ))}
      </div>
      <div className="mj__melds">
        {v.seat !== null && v.melds[v.seat].map((m, i) => (
          <span key={i} className="mj__meld">{m.map((t) => tileText(t)).join(' ')}</span>
        ))}
      </div>
      <div className="mj__hand">
        {hand.map((t, i) => (
          <button key={`${t}-${i}`} className={`mj__tile${sel === i ? ' is-on' : ''}`} onClick={() => setSel(i)}>
            {tileText(t)}
          </button>
        ))}
      </div>
      <div className="mj__ops">
        {sel !== null && myTurn && <Button variant="primary" onClick={() => discard(sel)}>打出</Button>}
        {v.last && v.seat !== null && (
          <>
            {v.can.hu && <Button variant="primary" onClick={() => { ctl.act({ type: 'hu' }); callout('胡了'); }}>胡</Button>}
            {v.can.peng && <Button onClick={() => { ctl.act({ type: 'peng' }); callout('碰'); }}>碰</Button>}
            {v.can.gang && <Button onClick={() => { ctl.act({ type: 'gang' }); callout('杠'); }}>杠</Button>}
            {v.can.chi && chi && (
              <Button onClick={() => { ctl.act({ type: 'chi', tiles: chi }); callout('吃'); }}>吃</Button>
            )}
            <Button onClick={() => ctl.act({ type: 'pass' })}>过</Button>
          </>
        )}
      </div>
      <Sheet
        open={v.over}
        dismissible={false}
        title={v.winner === v.seat ? '你胡了' : '本局结束'}
        footer={
          <>
            <Button onClick={() => ctl.leave()}>返回大厅</Button>
            <Button variant="primary" onClick={() => ctl.act({ type: 'ready' })}>再来一局</Button>
          </>
        }
      >
        <p className="mj__result">{v.huType || '流局：牌墙摸完'}</p>
      </Sheet>
    </div>
  );
}
