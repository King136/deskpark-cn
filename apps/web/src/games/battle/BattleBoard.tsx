import type { bt } from '@park/engine';
import type { CSSProperties } from 'react';
import { Button, Sheet } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { callout } from '../../lib/callout';
import './battle.css';

type Ctl = GameController<bt.BtView, bt.BtAction>;

const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

/** 落空：三弧水花 */
function Splash() {
  return (
    <svg viewBox="0 0 24 24" className="bt__icon" aria-hidden="true">
      <path d="M5 16c2.2 1.8 4.5 2.7 7 2.7s4.8-.9 7-2.7" fill="none" stroke="#a8ccdf" strokeWidth={2} strokeLinecap="round" opacity={0.85} />
      <path d="M7.5 12.6c1.5 1 3 1.5 4.5 1.5s3-.5 4.5-1.5" fill="none" stroke="#c4e0ee" strokeWidth={1.7} strokeLinecap="round" opacity={0.8} />
      <circle cx={12} cy={8.6} r={1.8} fill="#dceef8" />
    </svg>
  );
}

/** 命中：八芒爆炸 */
function Boom() {
  return (
    <svg viewBox="0 0 24 24" className="bt__icon" aria-hidden="true">
      <path
        d="M12 1.8l1.9 5.6 5.2-2.8-2.4 5.3 5.5 1.7-5.1 2.5 3 4.9-5.6-1.2-.3 5.8-2.7-5.2-4.4 3.9 1-5.8-5.9-.5 4.7-3.5-3.6-4.6 5.7 1.4z"
        fill="#e8973c"
      />
      <circle cx={12} cy={12.4} r={3.1} fill="#f8d57c" />
      <circle cx={12} cy={12.4} r={1.3} fill="#fdf0c0" />
    </svg>
  );
}

/** 我方舰段：金属舱盖（相邻格拼成舰队） */
function Hull({ sunk }: { sunk?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="bt__icon" aria-hidden="true">
      <circle cx={12} cy={12} r={7.4} fill={sunk ? '#5a3f3a' : '#4d6a86'} stroke="rgba(0,0,0,0.35)" strokeWidth={1.1} />
      <circle cx={12} cy={12} r={4.6} fill="none" stroke={sunk ? '#7a564e' : '#7899b6'} strokeWidth={1.2} opacity={0.9} />
      <circle cx={12} cy={12} r={1.7} fill={sunk ? '#8a6a60' : '#cfe0ef'} />
      {[[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]].map(([dx, dy], i) => (
        <circle key={i} cx={12 + dx} cy={12 + dy} r={0.85} fill={sunk ? '#6b4f47' : '#9db9d2'} />
      ))}
    </svg>
  );
}

export default function BattleBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const myTurn = v.seat !== null && v.turn === v.seat && !v.over;
  const cols = COLS.slice(0, v.size);
  const rows = Array.from({ length: v.size }, (_, i) => String(i + 1));
  const axisVar = { '--n': v.size } as CSSProperties;

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
      aria-label={`${COLS[i % v.size]}${Math.floor(i / v.size) + 1} ${s === 1 ? '未中' : s === 2 ? '命中' : '未探明'}`}
    >
      {s === 1 ? <Splash /> : s === 2 ? <Boom /> : null}
    </button>
  ));

  const mineCells = v.mine.map((ship, i) => {
    const shot = v.mineShots[i];
    return (
      <i key={i} className={`bt__cell${ship ? ' ship' : ''}${shot === 1 ? ' miss' : shot === 2 ? ' hit' : ''}`}>
        {shot === 1 ? <Splash /> : shot === 2 ? <Boom /> : ship ? <Hull sunk={shot === 2} /> : null}
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
        {/* 敌方海域带坐标：10×10 没有行列表记不住刚才打过哪一格 */}
        <div className="bt__board" style={axisVar}>
          <div className="bt__axis bt__axis--top">
            {cols.map((c) => <span key={c}>{c}</span>)}
          </div>
          <div className="bt__axis bt__axis--left">
            {rows.map((r) => <span key={r}>{r}</span>)}
          </div>
          <div className="bt__grid" style={{
            gridTemplateColumns: `repeat(${v.size}, 1fr)`,
            gridTemplateRows: `repeat(${v.size}, minmax(0, 1fr))`,
          }}>{foeCells}</div>
        </div>

        <div className="bt__board is-mine" style={axisVar}>
          <div className="bt__axis bt__axis--top">
            {cols.map((c) => <span key={c}>{c}</span>)}
          </div>
          <div className="bt__axis bt__axis--left">
            {rows.map((r) => <span key={r}>{r}</span>)}
          </div>
          <div className="bt__grid" style={{
            gridTemplateColumns: `repeat(${v.size}, 1fr)`,
            gridTemplateRows: `repeat(${v.size}, minmax(0, 1fr))`,
          }}>{mineCells}</div>
        </div>
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
        <p className="bt__result">水花是未命中，爆炸是命中；你的舰队以舱盖标出，被击中会烧黑</p>
      </Sheet>
    </div>
  );
}
