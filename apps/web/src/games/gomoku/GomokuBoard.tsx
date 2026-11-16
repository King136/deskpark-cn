import type { gm } from '@park/engine';
import { useEffect, useRef } from 'react';
import { Button, Sheet, toast } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { callout } from '../../lib/callout';
import '../chess/chess.css';
import './gomoku.css';

type Ctl = GameController<gm.GmView, gm.GmAction>;

/** 五子棋：点棋盘落子，落子有音效与报牌，五连高亮并结算 */
export default function GomokuBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const me = ctl.seat ?? 0;
  const spectator = ctl.seat === null;
  const myTurn = !v.over && v.turn === me && !spectator;
  const boardRef = useRef<HTMLDivElement>(null);
  const prevMoves = useRef(v.moves);

  useEffect(() => {
    if (v.moves <= prevMoves.current) {
      prevMoves.current = v.moves;
      return;
    }
    prevMoves.current = v.moves;
    const last = v.last;
    if (!last) return;
    const who = ctl.players[last.seat]?.name ?? '';
    if (v.over && v.winner !== null) callout(`${who} 五连，拿下这局`);
    else if (last.seat === me) callout('落子');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.moves, v.over]);

  const place = (x: number, y: number) => {
    if (!myTurn) {
      toast(v.over ? '本局已结束' : '还没轮到你');
      return;
    }
    const err = ctl.act({ type: 'place', x, y });
    if (err) toast(err, 'error');
  };

  const cells = [];
  for (let y = 0; y < v.size; y++) {
    for (let x = 0; x < v.size; x++) {
      const who = v.board[y * v.size + x];
      const idx = y * v.size + x;
      const onLine = v.line.includes(idx);
      cells.push(
        <button
          key={idx}
          className={`gm__dot${who === null ? '' : who === 0 ? ' is-black' : ' is-white'}${onLine ? ' is-win' : ''}${v.last && v.last.x === x && v.last.y === y ? ' is-last' : ''}`}
          onClick={() => place(x, y)}
          aria-label={`${x + 1}-${y + 1}`}
        >
          {who !== null && <i />}
        </button>,
      );
    }
  }

  return (
    <div className="gm">
      <div className="gm__bar">
        <span className={`gm__turn${myTurn ? ' is-me' : ''}`}>
          {v.over ? '本局结束' : myTurn ? '轮到你（黑先白后按座位）' : `等待 ${ctl.players[v.turn ?? 0]?.name ?? ''}`}
        </span>
        <span className="gm__round">第 {v.round} 局</span>
      </div>

      <div className="gm__stage">
        <div
          className="gm__board"
          ref={boardRef}
          style={{ ['--n' as string]: v.size } as React.CSSProperties}
        >
          {cells}
        </div>
      </div>

      <Sheet
        open={v.over}
        dismissible={false}
        title={v.winner === null ? '和棋' : v.winner === me ? '你赢了' : '这局输了'}
        footer={
          <>
            <Button onClick={() => ctl.leave()}>返回大厅</Button>
            <Button
              variant="primary"
              disabled={v.ready[me]}
              onClick={() => ctl.act({ type: 'ready' })}
            >
              {v.ready[me] ? '等待对手…' : '再来一局'}
            </Button>
          </>
        }
      >
        <div className="gm__result">
          <p>
            第 {v.round} 局 · 共 {v.moves} 手
            {v.winner !== null ? ` · ${ctl.players[v.winner]?.name ?? ''} 五连` : ''}
          </p>
          <div className="gm__score">
            {ctl.players.map((p, i) => (
              <span key={i} className={v.winner === i ? 'is-win' : ''}>
                {p.name} · {v.scores[i]}
              </span>
            ))}
          </div>
        </div>
      </Sheet>
    </div>
  );
}
