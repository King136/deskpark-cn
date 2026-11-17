import type { rv } from '@park/engine';
import { Button, Sheet, toast } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { callout } from '../../lib/callout';
import './reversi.css';

type Ctl = GameController<rv.RvView, rv.RvAction>;

/** 黑白棋：点合法空点落子，翻转有动画，终局结算 */
export default function ReversiBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const me = ctl.seat ?? 0;
  const spectator = ctl.seat === null;
  const myTurn = !v.over && v.turn === me && !spectator;
  const legal = new Set(v.legal);
  const black = v.board.filter((c) => c === 0).length;
  const white = v.board.filter((c) => c === 1).length;

  const place = (x: number, y: number) => {
    if (!myTurn) return toast(v.over ? '本局已结束' : '还没轮到你');
    const err = ctl.act({ type: 'place', x, y });
    if (err) toast(err, 'error');
    else callout('落子');
  };

  const cells = [];
  for (let y = 0; y < v.size; y++) {
    for (let x = 0; x < v.size; x++) {
      const idx = y * v.size + x;
      const who = v.board[idx];
      const on = legal.has(idx) && myTurn;
      const flipped = v.last?.flipped.includes(idx);
      cells.push(
        <button
          key={idx}
          className={`rv__cell${on ? ' is-legal' : ''}${flipped ? ' is-flip' : ''}`}
          onClick={() => place(x, y)}
          aria-label={`${x + 1}-${y + 1}`}
        >
          {who !== null ? <i className={who === 0 ? 'is-black' : 'is-white'} /> : on ? <b /> : null}
        </button>,
      );
    }
  }

  return (
    <div className="rv">
      <div className="rv__bar">
        <span className="rv__side">
          <i className="is-black" /> {black}
        </span>
        <span className={`rv__turn${myTurn ? ' is-me' : ''}`}>
          {v.over ? '终局' : myTurn ? '轮到你' : `等待 ${ctl.players[v.turn ?? 0]?.name ?? ''}`}
        </span>
        <span className="rv__side">
          {white} <i className="is-white" />
        </span>
      </div>

      <div className="rv__stage">
        <div className="rv__board">{cells}</div>
      </div>

      <Sheet
        open={v.over}
        dismissible={false}
        title={black === white ? '和棋' : (v.turn === null && black > white) === (me === 0) ? '你赢了' : '这局输了'}
        footer={
          <>
            <Button onClick={() => ctl.leave()}>返回大厅</Button>
            <Button variant="primary" disabled={v.ready[me]} onClick={() => ctl.act({ type: 'ready' })}>
              {v.ready[me] ? '等待对手…' : '再来一局'}
            </Button>
          </>
        }
      >
        <div className="rv__result">
          黑 {black} · 白 {white} · 第 {v.round} 局
        </div>
      </Sheet>
    </div>
  );
}
