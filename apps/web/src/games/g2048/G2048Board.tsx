import type { g2 } from '@park/engine';
import { useEffect } from 'react';
import { Button, Sheet } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { callout } from '../../lib/callout';
import './g2048.css';

type Ctl = GameController<g2.G2View, g2.G2Action>;

const TONE: Record<number, string> = {
  2: '#efe6d3', 4: '#ecdfc3', 8: '#e9cfa4', 16: '#e3bd8a',
  32: '#dfa877', 64: '#d98f5f', 128: '#cf7a55', 256: '#c4674c',
  512: '#b45a48', 1024: '#a34f45', 2048: '#8f4240',
};

/** 2048：四方向滑动合并，单人益智 */
export default function G2048Board({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  type Dir = 'up' | 'down' | 'left' | 'right';
  const move = (dir: Dir) => {
    if (v.over) return;
    const before = v.score;
    const err = ctl.act({ type: 'move', dir });
    if (err) return;
    if (before !== v.score) callout('得分');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, 'up' | 'down' | 'left' | 'right'> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right',
      };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        ctl.act({ type: 'move', dir });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.moves]);

  const tiles = v.board.map((val, i) => (
    <div
      key={i}
      className={`g2__tile${val ? ` v${Math.min(val, 2048)}` : ''}`}
      style={val ? { background: TONE[val] ?? '#8f4240' } : undefined}
    >
      {val || ''}
    </div>
  ));

  return (
    <div className="g2">
      <div className="g2__head">
        <span className="g2__score">
          得分 <b>{v.score}</b>
        </span>
        <span className="g2__best">最佳 {v.best}</span>
      </div>
      <div className="g2__stage">
        <div className="g2__board">{tiles}</div>
      </div>
      <div className="g2__pad">
        <button onClick={() => move('up')} aria-label="上">▲</button>
        <div>
          <button onClick={() => move('left')} aria-label="左">◀</button>
          <button onClick={() => move('down')} aria-label="下">▼</button>
          <button onClick={() => move('right')} aria-label="右">▶</button>
        </div>
      </div>
      <Sheet
        open={v.over || v.won}
        dismissible={false}
        title={v.won ? '凑出 2048！' : '没有可移动的方向了'}
        footer={
          <>
            <Button onClick={() => ctl.leave()}>返回大厅</Button>
            <Button variant="primary" onClick={() => ctl.act({ type: 'ready' })}>
              再来一局
            </Button>
          </>
        }
      >
        <p className="g2__result">本局得分 {v.score} · 共 {v.moves} 步</p>
      </Sheet>
    </div>
  );
}
