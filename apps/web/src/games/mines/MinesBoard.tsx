import type { ms } from '@park/engine';
import { useState } from 'react';
import { Button, Sheet } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { callout } from '../../lib/callout';
import './mines.css';

type Ctl = GameController<ms.MsView, ms.MsAction>;

const NUM_COLOR = ['', '#6b8fa8', '#3f6e57', '#8a6a3a', '#7d4757', '#7a4d2c', '#4a4f79', '#3f4a44', '#5b5b5b'];

/** 扫雷：单人益智，长按插旗 */
export default function MinesBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const [flagMode, setFlagMode] = useState(false);
  const left = v.mines - v.flags.filter(Boolean).length;

  const tap = (i: number, flag: boolean) => {
    if (v.over || v.revealed[i]) return;
    if (flag || flagMode) {
      ctl.act({ type: 'flag', index: i });
      return;
    }
    ctl.act({ type: 'reveal', index: i });
    if (v.boom !== null && v.boom === i) callout('踩雷了');
    else if (v.win) callout('扫雷成功');
  };

  const cells = v.cells.map((num, i) => {
    const open = v.revealed[i];
    const isBoom = v.boom === i;
    return (
      <button
        key={i}
        className={`ms__cell${open ? ' is-open' : ''}${isBoom ? ' is-boom' : ''}`}
        onClick={() => tap(i, false)}
        onContextMenu={(e) => {
          e.preventDefault();
          tap(i, true);
        }}
        onTouchStart={(e) => {
          const t = setTimeout(() => tap(i, true), 380);
          e.currentTarget.dataset.hold = String(t);
        }}
        onTouchEnd={(e) => {
          const t = Number(e.currentTarget.dataset.hold ?? 0);
          if (t) clearTimeout(t);
        }}
        style={{ gridTemplateColumns: undefined }}
      >
        {open ? (num === -1 ? '✳' : num || '') : v.flags[i] ? '⚑' : ''}
        {open && num > 0 && (
          <span className="ms__num" style={{ color: NUM_COLOR[num] }} aria-hidden>
            {num}
          </span>
        )}
      </button>
    );
  });

  return (
    <div className="ms">
      <div className="ms__head">
        <span>剩余雷 {left}</span>
        <span>步数 {v.steps}</span>
        <button className={`ms__mode${flagMode ? ' is-on' : ''}`} onClick={() => setFlagMode((x) => !x)}>
          {flagMode ? '插旗模式' : '翻开模式'}
        </button>
      </div>
      <div className="ms__stage">
        <div
          className="ms__board"
          style={{ gridTemplateColumns: `repeat(${v.cols}, 1fr)`, aspectRatio: `${v.cols} / ${v.rows}` }}
        >
          {cells}
        </div>
      </div>
      <Sheet
        open={v.over}
        dismissible={false}
        title={v.win ? '扫完了！' : '踩到雷了'}
        footer={
          <>
            <Button onClick={() => ctl.leave()}>返回大厅</Button>
            <Button variant="primary" onClick={() => ctl.act({ type: 'ready' })}>
              再来一局
            </Button>
          </>
        }
      >
        <p className="ms__result">
          {v.win ? `用时 ${v.steps} 步，全部安全格已翻开` : `第 ${v.steps} 步踩到雷`}
        </p>
      </Sheet>
    </div>
  );
}
