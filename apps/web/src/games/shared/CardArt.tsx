/**
 * 大厅卡片精致插画：统一采用 viewBox 100×100 的 SVG 矢量场景，
 * 与五子棋/象棋等精致卡片同一套风格，替换原先的纯 CSS 文字色块拼贴。
 * 任意卡片尺寸下都清晰，不溢出。
 */
import { FaceByIndex } from '../../components/MahjongTile';

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <span className="card-art">
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {children}
      </svg>
    </span>
  );
}

/* ---------------- 麻将：三张矢量牌面斜叠在绒布上（与川麻同源牌面） ---------------- */
export function MajiangArt() {
  const tiles = [31, 4, 22]; // 红中 / 五万 / 三筒
  return (
    <span className="card-art mj-card-art">
      <span className="mj-card-art__felt" />
      {tiles.map((t, i) => (
        <span className={`mj-card-art__tile mj-card-art__tile--${i}`} key={i}>
          <FaceByIndex t={t} />
        </span>
      ))}
    </span>
  );
}

/* ---------------- 接龙：扇形叠放的扑克牌 ---------------- */
export function KlondikeArt() {
  const Card = ({ x, r, suit, rank, red }: { x: number; r: number; suit: string; rank: string; red: boolean }) => (
    <g transform={`translate(${x} 50) rotate(${r})`}>
      <rect x={-19} y={-30} width={38} height={60} rx={5} fill="#fff" stroke="#d9d2c4" strokeWidth={0.8} />
      <text x={-14} y={-18} fontSize={13} fontWeight={800} fill={red ? '#c8382e' : '#26303a'}>{rank}</text>
      <text x={-14} y={-9} fontSize={10} fill={red ? '#c8382e' : '#26303a'}>{suit}</text>
      <text x={7} y={24} fontSize={18} fill={red ? '#c8382e' : '#26303a'} opacity={0.9}>{suit}</text>
    </g>
  );
  return (
    <Svg>
      <Card x={38} r={-16} suit="♠" rank="A" red={false} />
      <Card x={50} r={2} suit="♥" rank="K" red />
      <Card x={62} r={17} suit="♦" rank="Q" red />
    </Svg>
  );
}

/* ---------------- 跳棋：棋盘 + 立体棋子 ---------------- */
export function CheckersArt() {
  const discs = [
    { x: 32, y: 36, dark: true, king: false },
    { x: 50, y: 30, dark: false, king: false },
    { x: 68, y: 40, dark: true, king: true },
    { x: 40, y: 60, dark: false, king: false },
    { x: 62, y: 66, dark: true, king: false },
  ];
  return (
    <Svg>
      <rect x={8} y={10} width={84} height={80} rx={5} fill="#c9a875" />
      {Array.from({ length: 8 }, (_, r) =>
        Array.from({ length: 8 }, (_, c) =>
          (r + c) % 2 === 1 ? (
            <rect key={`${r}-${c}`} x={8 + c * 10.5} y={10 + r * 10} width={10.5} height={10} fill="#4e4a42" opacity={0.85} />
          ) : null,
        ),
      )}
      {discs.map((d, i) => (
        <g key={i}>
          <ellipse cx={d.x} cy={d.y + 3} rx={10} ry={8.5} fill="rgba(0,0,0,0.35)" />
          <ellipse cx={d.x} cy={d.y} rx={10} ry={8.5} fill={d.dark ? '#2b302e' : '#e8e3d6'} stroke={d.dark ? '#454b48' : '#fff'} strokeWidth={1} />
          <ellipse cx={d.x} cy={d.y} rx={6.4} ry={5.2} fill="none" stroke={d.dark ? '#6a716e' : '#b9b2a2'} strokeWidth={1.1} />
          {d.king && <text x={d.x} y={d.y + 3.4} fontSize={9} textAnchor="middle" fill="#e7c886">♛</text>}
        </g>
      ))}
    </Svg>
  );
}

/* ---------------- 飞行棋：十字棋盘 + 彩色飞机 + 骰子 ---------------- */
export function LudoArt() {
  const colors = ['#c9555a', '#d8b24a', '#5aa96b', '#5f76c8'];
  const plane = (x: number, y: number, c: string, r: number) => (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <circle r={9} fill={c} stroke="#fff" strokeWidth={1.2} />
      <path d="M0 -7 L2.4 -1 L7 1 L2.4 3 L0 8 L-2.4 3 L-7 1 L-2.4 -1 Z" fill="#f7f3e8" opacity={0.95} />
    </g>
  );
  return (
    <Svg>
      <rect x={22} y={6} width={56} height={24} rx={4} fill="#e8e2d2" />
      <rect x={22} y={70} width={56} height={24} rx={4} fill="#e8e2d2" />
      <rect x={6} y={22} width={24} height={56} rx={4} fill="#e8e2d2" />
      <rect x={70} y={22} width={24} height={56} rx={4} fill="#e8e2d2" />
      <rect x={22} y={22} width={56} height={56} rx={4} fill="#f2eddf" />
      <rect x={40} y={40} width={20} height={20} rx={3} fill="#cfe0d2" />
      {plane(34, 34, colors[0], -20)}
      {plane(66, 34, colors[1], 20)}
      {plane(34, 66, colors[2], -160)}
      {plane(66, 66, colors[3], 160)}
    </Svg>
  );
}

/* ---------------- 海战棋：海面 + 战舰 + 命中爆炸 ---------------- */
export function BattleArt() {
  const ships = [
    { x: 14, y: 26, n: 3 },
    { x: 58, y: 56, n: 4 },
    { x: 30, y: 76, n: 2 },
  ];
  return (
    <Svg>
      <defs>
        <linearGradient id="sea-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a7fa5" />
          <stop offset="100%" stopColor="#1c4a63" />
        </linearGradient>
      </defs>
      <rect x={6} y={6} width={88} height={88} rx={5} fill="url(#sea-g)" />
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i} opacity={0.18} stroke="#bfe6ff" strokeWidth={0.8} fill="none">
          <path d={`M8 ${14 + i * 11} q6 -3 12 0 t12 0 t12 0 t12 0 t12 0 t12 0`} />
        </g>
      ))}
      {[22, 44, 66, 88].map((v) => (
        <g key={v} stroke="#0d3245" strokeWidth={0.5} opacity={0.5}>
          <line x1={v} y1={6} x2={v} y2={94} />
          <line x1={6} y1={v} x2={94} y2={v} />
        </g>
      ))}
      {ships.map((s, i) => (
        <g key={i} transform={`translate(${s.x} ${s.y})`}>
          {Array.from({ length: s.n }, (_, k) => (
            <rect key={k} x={k * 8} y={0} width={7.4} height={7.4} rx={1.6} fill="#d7dee2" stroke="#8c9aa2" strokeWidth={0.6} />
          ))}
        </g>
      ))}
      {[[38, 30], [80, 62]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <circle r={8} fill="#ff7a3d" opacity={0.28} />
          <circle r={4.6} fill="#ff5b2e" />
          <path d="M0 -7 L1.6 -2 L6 -3 L2.4 1 L5 5 L0 3 L-5 5 L-2.4 1 L-6 -3 L-1.6 -2 Z" fill="#ffd34a" />
        </g>
      ))}
    </Svg>
  );
}

/* ---------------- 吹牛骰：立体点数骰 ---------------- */
export function LiarArt() {
  const pip = (cx: number, cy: number, r = 2.1) => <circle cx={cx} cy={cy} r={r} fill="#2b2a26" />;
  const Die = ({ x, y, r, v }: { x: number; y: number; r: number; v: number }) => {
    const pts: Record<number, [number, number][]> = {
      1: [[0, 0]],
      2: [[-6, -6], [6, 6]],
      3: [[-6, -6], [0, 0], [6, 6]],
      4: [[-6, -6], [6, -6], [-6, 6], [6, 6]],
      5: [[-6, -6], [6, -6], [0, 0], [-6, 6], [6, 6]],
      6: [[-6, -7], [6, -7], [-6, 0], [6, 0], [-6, 7], [6, 7]],
    };
    return (
      <g transform={`translate(${x} ${y}) rotate(${r})`}>
        <rect x={-14} y={-14} width={28} height={28} rx={6} fill="#cdbf9f" />
        <rect x={-14} y={-14} width={28} height={25} rx={6} fill="#f6f0e0" stroke="#e0d5b8" strokeWidth={0.8} />
        {(pts[v] ?? []).map(([px, py], i) => <g key={i}>{pip(px, py)}</g>)}
      </g>
    );
  };
  return (
    <Svg>
      <Die x={34} y={38} r={-14} v={5} />
      <Die x={64} y={34} r={12} v={2} />
      <Die x={50} y={68} r={-4} v={6} />
    </Svg>
  );
}

/* ---------------- 俄罗斯方块：彩色立体方块墙 ---------------- */
export function BlocksArt() {
  const colors: Record<number, string> = { 1: '#5aa9c9', 2: '#d8b24a', 3: '#a163b5', 4: '#5aa96b', 5: '#c9555a' };
  const grid: number[][] = [
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 1, 0, 0],
    [0, 0, 0, 1, 1, 0],
    [0, 2, 0, 1, 0, 0],
    [0, 2, 2, 3, 3, 0],
    [4, 2, 3, 3, 0, 5],
    [4, 4, 1, 5, 5, 5],
  ];
  const s = 13;
  return (
    <Svg>
      {grid.flatMap((row, y) =>
        row.map((v, x) => {
          const gx = 11 + x * s;
          const gy = 8 + y * s;
          return v ? (
            <g key={`${y}-${x}`}>
              <rect x={gx} y={gy} width={s - 1} height={s - 1} rx={1.6} fill={colors[v]} />
              <rect x={gx} y={gy} width={s - 1} height={s - 1} rx={1.6} fill="none" stroke="#fff" strokeWidth={0.7} opacity={0.35} />
              <rect x={gx + 1.5} y={gy + 1.5} width={s - 4} height={2} rx={1} fill="#fff" opacity={0.28} />
            </g>
          ) : null;
        }),
      )}
    </Svg>
  );
}

/* ---------------- 贪吃蛇：蜿蜒蛇身 + 果子 ---------------- */
export function SnakeArt() {
  const body = [[24, 70], [34, 70], [44, 70], [54, 70], [54, 60], [54, 50], [64, 50], [74, 50]];
  return (
    <Svg>
      <defs>
        <linearGradient id="snake-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7cc98a" />
          <stop offset="100%" stopColor="#3f8f56" />
        </linearGradient>
      </defs>
      {body.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={7.5} fill="url(#snake-g)" stroke="#2f6b42" strokeWidth={0.8} />
      ))}
      <g>
        <circle cx={74} cy={50} r={8} fill="url(#snake-g)" stroke="#2f6b42" strokeWidth={0.8} />
        <circle cx={77} cy={47.5} r={1.7} fill="#143b22" />
        <circle cx={77} cy={52.5} r={1.7} fill="#143b22" />
      </g>
      <g transform="translate(30 38)">
        <circle r={9} fill="#d8564a" />
        <circle cx={-3} cy={-3} r={2.6} fill="#fff" opacity={0.5} />
        <path d="M0 -9 q4 -6 9 -3 q-3 4 -9 5 Z" fill="#5aa96b" />
      </g>
    </Svg>
  );
}

/* ---------------- 数独：九宫格 + 数字 ---------------- */
export function SudokuArt() {
  const givens: [number, number, number][] = [
    [0, 0, 5], [2, 0, 3], [4, 0, 9], [1, 1, 7], [3, 1, 2], [5, 1, 6],
    [0, 2, 8], [4, 2, 4], [2, 3, 1], [3, 4, 6], [5, 5, 3], [1, 5, 9],
  ];
  const s = 84 / 9;
  return (
    <Svg>
      <rect x={8} y={8} width={84} height={84} rx={3} fill="#f3efe4" />
      {givens.map(([c, r, v], i) => (
        <text key={i} x={8 + c * s + s / 2} y={8 + r * s + s * 0.72} fontSize={9} textAnchor="middle" fontWeight={700} fill="#33465a">{v}</text>
      ))}
      {Array.from({ length: 10 }, (_, i) => (
        <line key={`v${i}`} x1={8 + i * s} y1={8} x2={8 + i * s} y2={92} stroke={i % 3 === 0 ? '#5a6b7a' : '#b9c2cc'} strokeWidth={i % 3 === 0 ? 1.4 : 0.6} />
      ))}
      {Array.from({ length: 10 }, (_, i) => (
        <line key={`h${i}`} x1={8} y1={8 + i * s} x2={92} y2={8 + i * s} stroke={i % 3 === 0 ? '#5a6b7a' : '#b9c2cc'} strokeWidth={i % 3 === 0 ? 1.4 : 0.6} />
      ))}
    </Svg>
  );
}

/* ---------------- 扫雷：雷区格 + 旗子 + 数字 ---------------- */
export function MinesArt() {
  const cells: { n?: number; flag?: boolean; mine?: boolean }[] = [
    { n: 1 }, { n: 2 }, { flag: true }, { n: 1 },
    { n: 2 }, { mine: true }, { n: 3 }, { n: 1 },
    { n: 1 }, { n: 1 }, { n: 2 }, { flag: true },
    { flag: true }, { n: 2 }, { mine: true }, { n: 2 },
  ];
  const s = 19;
  const colors = ['', '#4f7fb5', '#3f8f56', '#c8564a', '#7a5ab5', '#b5742f'];
  return (
    <Svg>
      {cells.map((c, i) => {
        const x = 8 + (i % 4) * s;
        const y = 10 + Math.floor(i / 4) * s;
        return (
          <g key={i}>
            <rect x={x} y={y} width={s - 2} height={s - 2} rx={3} fill="#6b7392" stroke="#8f97b5" strokeWidth={0.8} />
            {c.n && <text x={x + (s - 2) / 2} y={y + (s - 2) * 0.72} fontSize={11} textAnchor="middle" fontWeight={800} fill={colors[c.n]}>{c.n}</text>}
            {c.flag && (
              <g transform={`translate(${x + (s - 2) / 2} ${y + (s - 2) / 2})`}>
                <line x1={-2} y1={-6} x2={-2} y2={6} stroke="#2b2a26" strokeWidth={1.4} />
                <path d="M-2 -6 L7 -3 L-2 1 Z" fill="#d84a3f" />
              </g>
            )}
            {c.mine && (
              <g transform={`translate(${x + (s - 2) / 2} ${y + (s - 2) / 2})`}>
                <circle r={5.5} fill="#26262a" />
                {[0, 60, 120].map((a) => <line key={a} x1={-7} y1={0} x2={7} y2={0} stroke="#26262a" strokeWidth={1.4} transform={`rotate(${a})`} />)}
              </g>
            )}
          </g>
        );
      })}
    </Svg>
  );
}

/* ---------------- 2048：渐变数字方块 ---------------- */
export function G2048Art() {
  const tiles = [
    { x: 12, y: 12, v: 4 }, { x: 40, y: 12, v: 2 }, { x: 68, y: 12, v: 8 },
    { x: 12, y: 40, v: 16 }, { x: 40, y: 40, v: 32 }, { x: 68, y: 40, v: 4 },
    { x: 12, y: 68, v: 2 }, { x: 40, y: 68, v: 128 }, { x: 68, y: 68, v: 8 },
  ];
  const palette: Record<number, [string, string]> = {
    2: ['#eee4da', '#d8cdbf'], 4: ['#ede0c8', '#d5c4a3'], 8: ['#f2b179', '#e08a5b'],
    16: ['#f59563', '#d9743f'], 32: ['#f67c5f', '#d95e42'], 128: ['#edcf72', '#d9b64a'],
  };
  return (
    <Svg>
      <rect x={8} y={8} width={84} height={84} rx={7} fill="#2a3630" />
      {tiles.map((t, i) => {
        const [a, b] = palette[t.v] ?? palette[8];
        return (
          <g key={i}>
            <rect x={t.x} y={t.y} width={22} height={22} rx={4} fill={`url(#g2-${i})`} />
            <defs>
              <linearGradient id={`g2-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={a} />
                <stop offset="100%" stopColor={b} />
              </linearGradient>
            </defs>
            <text x={t.x + 11} y={t.y + 15} fontSize={t.v >= 128 ? 8 : 10} textAnchor="middle" fontWeight={800} fill={t.v <= 4 ? '#6b5b45' : '#fff'}>{t.v}</text>
          </g>
        );
      })}
    </Svg>
  );
}
