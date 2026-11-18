import type { sn } from '@park/engine';
import { useEffect } from 'react';
import { Button, Sheet } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { callout } from '../../lib/callout';
import './snake.css';

type Ctl = GameController<sn.SnView, sn.SnAction>;

export default function SnakeBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;

  useEffect(() => {
    if (v.over) return;
    const t = setInterval(() => ctl.act({ type: 'tick' }), 480);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.over]);

  useEffect(() => {
    if (v.over) callout('撞上了');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.over]);

  return (
    <div className="sn">
      <div className="sn__head">
        <span>长度 {v.snake.length}</span>
        <span>得分 {v.score}</span>
      </div>
      <div className="sn__stage">
        <div className="sn__board" style={{ gridTemplateColumns: `repeat(${v.cols}, 1fr)` }}>
          {Array.from({ length: v.cols * v.rows }, (_, i) => {
            const isHead = i === v.snake[0];
            const isBody = !isHead && v.snake.includes(i);
            const isFood = i === v.food;
            return <i key={i} className={`${isHead ? 'head' : ''}${isBody ? 'body' : ''}${isFood ? 'food' : ''}`} />;
          })}
        </div>
      </div>
      <div className="sn__pad">
        <button onClick={() => ctl.act({ type: 'turn', dir: 'up' })}>▲</button>
        <div>
          <button onClick={() => ctl.act({ type: 'turn', dir: 'left' })}>◀</button>
          <button onClick={() => ctl.act({ type: 'turn', dir: 'down' })}>▼</button>
          <button onClick={() => ctl.act({ type: 'turn', dir: 'right' })}>▶</button>
        </div>
      </div>
      <Sheet
        open={v.over}
        dismissible={false}
        title="撞上了"
        footer={
          <>
            <Button onClick={() => ctl.leave()}>返回大厅</Button>
            <Button variant="primary" onClick={() => ctl.act({ type: 'ready' })}>
              再来一局
            </Button>
          </>
        }
      >
        <p className="sn__result">长度 {v.snake.length} · 得分 {v.score}</p>
      </Sheet>
    </div>
  );
}
