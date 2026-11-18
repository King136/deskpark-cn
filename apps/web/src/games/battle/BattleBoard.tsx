import type { bt } from '@park/engine';
import { Button, Sheet } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { callout } from '../../lib/callout';
import './battle.css';

type Ctl = GameController<bt.BtView, bt.BtAction>;

export default function BattleBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const myTurn = v.seat !== null && v.turn === v.seat && !v.over;

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
        <div className="bt__grid" style={{ gridTemplateColumns: `repeat(${v.size}, 1fr)` }}>{foeCells}</div>
        <div className="bt__grid is-mine" style={{ gridTemplateColumns: `repeat(${v.size}, 1fr)` }}>{mineCells}</div>
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
