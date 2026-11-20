import type { ms } from '@park/engine';
import { useState } from 'react';
import { Button, Sheet } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { callout } from '../../lib/callout';
import './mines.css';

type Ctl = GameController<ms.MsView, ms.MsAction>;

const NUM_COLOR = ['', '#6b8fa8', '#3f6e57', '#8a6a3a', '#7d4757', '#7a4d2c', '#4a4f79', '#3f4a44', '#5b5b5b'];

/** 地雷：带尖刺的黑雷 + 高光 */
function MineIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g stroke="#1d2126" strokeWidth={2.2} strokeLinecap="round">
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
      </g>
      <circle cx={12} cy={12} r={5.6} fill="#2a2f36" />
      <circle cx={10.2} cy={10.2} r={1.7} fill="rgba(255,255,255,0.5)" />
    </svg>
  );
}

/** 旗子：三角红旗 + 旗杆 */
function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4l8 3-8 3z" fill="#d24a3a" />
      <rect x={6.8} y={4} width={1.6} height={16} rx={0.8} fill="#8a6a3a" />
      <rect x={5.4} y={19.4} width={6} height={1.6} rx={0.8} fill="#8a6a3a" />
    </svg>
  );
}

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
        onClick={(e) => {
          if (e.currentTarget.dataset.long === '1') {
            e.currentTarget.dataset.long = '0';
            return;
          }
          tap(i, false);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          tap(i, true);
        }}
        onTouchStart={(e) => {
          const el = e.currentTarget;
          const timer = window.setTimeout(() => {
            el.dataset.long = '1';
            tap(i, true);
          }, 380);
          el.dataset.hold = String(timer);
        }}
        onTouchEnd={(e) => {
          const el = e.currentTarget;
          const t = Number(el.dataset.hold ?? 0);
          if (t) window.clearTimeout(t);
          el.dataset.hold = '0';
        }}
        onTouchMove={(e) => {
          const el = e.currentTarget;
          const t = Number(el.dataset.hold ?? 0);
          if (t) window.clearTimeout(t);
          el.dataset.hold = '0';
        }}
      >
        {open ? (num === -1 ? <MineIcon /> : num || '') : v.flags[i] ? <FlagIcon /> : ''}
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
          style={{
            gridTemplateColumns: `repeat(${v.cols}, 1fr)`,
            gridTemplateRows: `repeat(${v.rows}, minmax(0, 1fr))`,
            aspectRatio: `${v.cols} / ${v.rows}`,
          }}
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
