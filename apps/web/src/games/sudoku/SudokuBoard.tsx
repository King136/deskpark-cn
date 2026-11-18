import type { sd } from '@park/engine';
import { useState } from 'react';
import { Button, Sheet } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { callout } from '../../lib/callout';
import './sudoku.css';

type Ctl = GameController<sd.SdView, sd.SdAction>;

/** 数独：点格 → 数字键盘填数 */
export default function SudokuBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const [pick, setPick] = useState<number | null>(null);
  const filled = v.values.filter((n) => n > 0).length;

  const setNum = (n: number) => {
    if (pick === null || v.given[pick]) return;
    const errs = v.errors;
    ctl.act({ type: 'set', index: pick, value: n });
    if (v.errors > errs) callout('这里冲突了');
    else if (v.win) callout('数独完成');
  };

  return (
    <div className="sd">
      <div className="sd__head">
        <span>已填 {filled}/81</span>
        <span>失误 {v.errors}</span>
      </div>
      <div className="sd__stage">
        <div className="sd__board">
          {v.values.map((val, i) => {
            const r = Math.floor(i / 9);
            const c = i % 9;
            const thick =
              (c % 3 === 0 ? ' sd__l' : '') +
              (r % 3 === 0 ? ' sd__t' : '') +
              (c === 8 ? ' sd__r' : '') +
              (r === 8 ? ' sd__b' : '');
            return (
              <button
                key={i}
                className={`sd__cell${v.given[i] ? ' is-given' : ''}${pick === i ? ' is-pick' : ''}${thick}`}
                onClick={() => !v.given[i] && setPick(i)}
                disabled={v.over}
              >
                {val || ''}
              </button>
            );
          })}
        </div>
      </div>
      <div className="sd__pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} onClick={() => setNum(n)} disabled={!!v.over}>
            {n}
          </button>
        ))}
        <button className="sd__erase" onClick={() => setNum(0)} disabled={!!v.over}>
          擦
        </button>
      </div>
      <Sheet
        open={v.over}
        dismissible={false}
        title={v.win ? '整盘填对了' : '本局结束'}
        footer={
          <>
            <Button onClick={() => ctl.leave()}>返回大厅</Button>
            <Button variant="primary" onClick={() => ctl.act({ type: 'ready' })}>
              换一题
            </Button>
          </>
        }
      >
        <p className="sd__result">失误 {v.errors} 次 · 填入 {v.steps} 次</p>
      </Sheet>
    </div>
  );
}
