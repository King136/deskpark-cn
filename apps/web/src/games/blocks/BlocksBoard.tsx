import type { bk } from '@park/engine';
import { useEffect } from 'react';
import { Button, Sheet } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { callout } from '../../lib/callout';
import './blocks.css';

type Ctl = GameController<bk.BkState, bk.BkAction>;
const COLOR = ['', '#5aa9c9', '#d8b24a', '#a163b5', '#5aa96b', '#c9555a', '#5f76c8', '#cf8b46'];

export default function BlocksBoard({ ctl }: { ctl: Ctl }) {
  const s = ctl.view!;
  const board = s.board.slice();
  if (s.cur && !s.over) {
    s.cur.cells.forEach(([cx, cy]) => {
      const x = s.cur!.x + cx;
      const y = s.cur!.y + cy;
      if (y >= 0 && y < s.rows && x >= 0 && x < s.cols) board[y * s.cols + x] = s.cur!.kind + 1;
    });
  }

  useEffect(() => {
    if (s.over) return;
    const t = setInterval(() => ctl.act({ type: 'tick' }), 700);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.over, s.cur?.kind]);

  useEffect(() => {
    if (s.over) callout('堆到顶了');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.over]);

  return (
    <div className="bk">
      <div className="bk__head">
        <span>得分 {s.score}</span>
        <span>消行 {s.lines}</span>
      </div>
      <div className="bk__stage">
        <div className="bk__board" style={{ gridTemplateColumns: `repeat(${s.cols}, 1fr)` }}>
          {board.map((v, i) => (
            <i key={i} style={v ? { background: COLOR[v] } : undefined} />
          ))}
        </div>
      </div>
      <div className="bk__pad">
        <button onClick={() => ctl.act({ type: 'move', dx: -1 })}>◀</button>
        <button onClick={() => ctl.act({ type: 'rotate' })}>↻</button>
        <button onClick={() => ctl.act({ type: 'drop' })}>落</button>
        <button onClick={() => ctl.act({ type: 'move', dx: 1 })}>▶</button>
      </div>
      <Sheet
        open={s.over}
        dismissible={false}
        title="本局结束"
        footer={
          <>
            <Button onClick={() => ctl.leave()}>返回大厅</Button>
            <Button variant="primary" onClick={() => ctl.act({ type: 'ready' })}>
              再来一局
            </Button>
          </>
        }
      >
        <p className="bk__result">得分 {s.score} · 消行 {s.lines}</p>
      </Sheet>
    </div>
  );
}
