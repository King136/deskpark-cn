import type { bk } from '@park/engine';
import { useEffect, useMemo, useRef } from 'react';
import { Button, Sheet } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { callout } from '../../lib/callout';
import './blocks.css';

type Ctl = GameController<bk.BkState, bk.BkAction>;

/** 与引擎 BASE 完全一致的七种方块，用于「下一个」预览与落点计算（形状稳定不变） */
const SHAPES: [number, number][][] = [
  [[0, 0], [1, 0], [2, 0], [3, 0]], // I
  [[0, 0], [1, 0], [0, 1], [1, 1]], // O
  [[1, 0], [0, 1], [1, 1], [2, 1]], // T
  [[1, 0], [2, 0], [0, 1], [1, 1]], // S
  [[0, 0], [1, 0], [1, 1], [2, 1]], // Z
  [[0, 0], [0, 1], [0, 2], [1, 2]], // J
  [[1, 0], [1, 1], [1, 2], [0, 2]], // L
];
/** 经典俄罗斯方块配色：I 青 / O 黄 / T 紫 / S 绿 / Z 红 / J 蓝 / L 橙 */
const COLORS = ['', '#2dd4bf', '#facc15', '#b794f6', '#4ade80', '#fb7185', '#60a5fa', '#fb923c'];

export default function BlocksBoard({ ctl }: { ctl: Ctl }) {
  const s = ctl.view!;
  const { cols, rows, board, cur, next, score, lines, over } = s;
  const level = Math.floor(lines / 10) + 1;
  // 等级越高落得越快：700ms 起步，每级 -55ms，最快 110ms
  const tickMs = Math.max(110, 700 - (level - 1) * 55);

  /** 幽灵落点：当前方块一直落到不能落为止的位置 */
  const ghostY = useMemo(() => {
    if (!cur || over) return null;
    const fits = (y: number) =>
      cur.cells.every(([cx, cy]) => {
        const x = cur.x + cx;
        const yy = y + cy;
        return x >= 0 && x < cols && yy >= 0 && yy < rows && board[yy * cols + x] === 0;
      });
    let gy = cur.y;
    while (fits(gy + 1)) gy++;
    return gy > cur.y ? gy : null;
  }, [cur, board, cols, rows, over]);

  const curCells = useMemo(() => {
    const set = new Set<number>();
    if (cur && !over)
      cur.cells.forEach(([cx, cy]) => {
        const x = cur.x + cx;
        const y = cur.y + cy;
        if (y >= 0 && y < rows && x >= 0 && x < cols) set.add(y * cols + x);
      });
    return set;
  }, [cur, over, cols, rows]);

  const ghostCells = useMemo(() => {
    const set = new Set<number>();
    if (cur && ghostY != null)
      cur.cells.forEach(([cx, cy]) => {
        const x = cur.x + cx;
        const y = ghostY + cy;
        if (y >= 0 && y < rows && x >= 0 && x < cols && board[y * cols + x] === 0)
          set.add(y * cols + x);
      });
    return set;
  }, [cur, ghostY, board, cols, rows]);

  const actRef = useRef(ctl.act);
  actRef.current = ctl.act;

  // 自动下落（速度随等级变化）
  useEffect(() => {
    if (over) return;
    const t = window.setInterval(() => actRef.current({ type: 'tick' }), tickMs);
    return () => window.clearInterval(t);
  }, [over, tickMs, cur?.kind]);

  useEffect(() => {
    if (over) callout('堆到顶了');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over]);

  // 键盘操作：← → 移动，↑ 旋转，↓ 软降，空格 硬降
  useEffect(() => {
    if (over) return;
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          actRef.current({ type: 'move', dx: -1 });
          e.preventDefault();
          break;
        case 'ArrowRight':
          actRef.current({ type: 'move', dx: 1 });
          e.preventDefault();
          break;
        case 'ArrowUp':
          actRef.current({ type: 'rotate' });
          e.preventDefault();
          break;
        case 'ArrowDown':
          actRef.current({ type: 'tick' });
          e.preventDefault();
          break;
        case ' ':
          actRef.current({ type: 'drop' });
          e.preventDefault();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [over]);

  // 触屏手势：左右滑=移动，上滑/轻点=旋转，下滑=硬降
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const st = touch.current;
    touch.current = null;
    if (!st) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - st.x;
    const dy = t.clientY - st.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) > 22) actRef.current({ type: 'move', dx: dx > 0 ? 1 : -1 });
      else if (Math.abs(dy) < 14) actRef.current({ type: 'rotate' });
    } else if (dy > 26) actRef.current({ type: 'drop' });
    else if (dy < -26) actRef.current({ type: 'rotate' });
  };

  const nextShape = SHAPES[next] ?? SHAPES[0];
  const nextColor = COLORS[(next ?? 0) + 1];

  return (
    <div className="bk">
      <div className="bk__head">
        <div className="bk__stats">
          <div className="bk__stat"><small>得分</small><b>{score}</b></div>
          <div className="bk__stat"><small>消行</small><b>{lines}</b></div>
          <div className="bk__stat"><small>等级</small><b>{level}</b></div>
        </div>
        <div className="bk__next" aria-label="下一个方块">
          <small>下一个</small>
          <div className="bk__next-grid">
            {Array.from({ length: 8 }, (_, i) => {
              const x = i % 4;
              const y = Math.floor(i / 4);
              const on = nextShape.some(([cx, cy]) => cx === x && cy === y);
              return <i key={i} className={on ? 'is-on' : ''} style={on ? { background: nextColor } : undefined} />;
            })}
          </div>
        </div>
      </div>

      <div className="bk__stage">
        <div
          className="bk__board"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {board.map((v, i) => {
            let cls = '';
            let bg: string | undefined;
            if (curCells.has(i)) {
              cls = ' is-cur';
              bg = COLORS[cur!.kind + 1];
            } else if (ghostCells.has(i)) {
              cls = ' is-ghost';
              bg = COLORS[cur!.kind + 1];
            } else if (v) {
              cls = ' is-fixed';
              bg = COLORS[v];
            }
            return <i key={i} className={cls} style={bg ? { background: bg } : undefined} />;
          })}
        </div>
      </div>

      <p className="bk__hint">滑动移动 · 上滑/轻点旋转 · 下滑速降</p>
      <div className="bk__pad">
        <button onClick={() => ctl.act({ type: 'move', dx: -1 })} aria-label="左移">◀</button>
        <button onClick={() => ctl.act({ type: 'rotate' })} aria-label="旋转">↻</button>
        <button className="bk__drop" onClick={() => ctl.act({ type: 'drop' })} aria-label="速降">落</button>
        <button onClick={() => ctl.act({ type: 'move', dx: 1 })} aria-label="右移">▶</button>
      </div>

      <Sheet
        open={over}
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
        <p className="bk__result">得分 {score} · 消行 {lines} · 到达 {level} 级</p>
      </Sheet>
    </div>
  );
}
