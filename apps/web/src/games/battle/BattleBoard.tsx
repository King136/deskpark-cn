import type { bt } from '@park/engine';
import type { CSSProperties } from 'react';
import { Button, Sheet } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { callout } from '../../lib/callout';
import './battle.css';

type Ctl = GameController<bt.BtView, bt.BtAction>;

const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export default function BattleBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const myTurn = v.seat !== null && v.turn === v.seat && !v.over;
  const cols = COLS.slice(0, v.size);
  const rows = Array.from({ length: v.size }, (_, i) => String(i + 1));
  const axisVar = { '--n': v.size } as CSSProperties;

  const fire = (i: number) => {
    if (!myTurn || v.foeShots[i] !== 0) return;
    ctl.act({ type: 'fire', index: i });
    if (v.over && v.winner === v.seat) callout('全部击沉');
  };

  const foeCells = v.foeShots.map((s, i) => (
    <button
      key={i}
      className={`bt__cell${s === 1 ? ' miss' : s === 2 ? ' hit' : ''}`}
      onClick={() => fire(i)}
      disabled={!myTurn || s !== 0}
      aria-label={`${COLS[i % v.size]}${Math.floor(i / v.size) + 1} ${s === 1 ? '未中' : s === 2 ? '命中' : '未探明'}`}
    >{s === 1 ? '·' : s === 2 ? '✳' : ''}</button>
  ));

  const mineCells = v.mine.map((ship, i) => {
    const shot = v.mineShots[i];
    return (
      <i key={i} className={`bt__cell${ship ? ' ship' : ''}${shot === 1 ? ' miss' : shot === 2 ? ' hit' : ''}`}>
        {shot === 1 ? '·' : shot === 2 ? '✳' : ''}
      </i>
    );
  });

  return (
    <div className="bt">
      <div className="bt__head">
        <span>我剩 {v.myLeft} 格</span>
        <span>对方剩 {v.foeLeft} 格</span>
        <span>{myTurn ? '轮到你开炮' : '等对方'}</span>
      </div>
      <div className="bt__stage">
        {/* 敌方海域带坐标：10×10 没有行列表记不住刚才打过哪一格 */}
        <div className="bt__board" style={axisVar}>
          <div className="bt__axis bt__axis--top">
            {cols.map((c) => <span key={c}>{c}</span>)}
          </div>
          <div className="bt__axis bt__axis--left">
            {rows.map((r) => <span key={r}>{r}</span>)}
          </div>
          <div className="bt__grid" style={{
            gridTemplateColumns: `repeat(${v.size}, 1fr)`,
            gridTemplateRows: `repeat(${v.size}, minmax(0, 1fr))`,
          }}>{foeCells}</div>
        </div>

        <div className="bt__board is-mine" style={axisVar}>
          <div className="bt__axis bt__axis--top">
            {cols.map((c) => <span key={c}>{c}</span>)}
          </div>
          <div className="bt__axis bt__axis--left">
            {rows.map((r) => <span key={r}>{r}</span>)}
          </div>
          <div className="bt__grid" style={{
            gridTemplateColumns: `repeat(${v.size}, 1fr)`,
            gridTemplateRows: `repeat(${v.size}, minmax(0, 1fr))`,
          }}>{mineCells}</div>
        </div>
      </div>
      <Sheet
        open={v.over}
        dismissible={false}
        title={v.winner === v.seat ? '对方舰队全沉' : '你的舰队沉了'}
        footer={
          <>
            <Button onClick={() => ctl.leave()}>返回大厅</Button>
            <Button variant="primary" onClick={() => ctl.act({ type: 'ready' })}>再来一局</Button>
          </>
        }
      >
        <p className="bt__result">命中以 ✳ 标记，未命中以 · 标记</p>
      </Sheet>
    </div>
  );
}
