/** 大厅插画：木盘 + 交叉线 + 几颗黑白子（SVG，任意尺寸都清晰） */
export function GomokuArt() {
  const n = 15;
  const step = 100 / (n + 1);
  const lines = Array.from({ length: n }, (_, i) => step * (i + 1));
  const stone = (x: number, y: number, dark: boolean) => (
    <circle
      cx={lines[x]}
      cy={lines[y]}
      r={step * 0.62}
      fill={dark ? '#141414' : '#f4efe3'}
      stroke={dark ? '#2c2c2c' : '#c9c2b2'}
      strokeWidth={0.8}
    />
  );
  const idx = [7, 8, 9, 10, 11];
  return (
    <span className="gm-art">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <rect width="100" height="100" fill="url(#gm-wood)" />
        {lines.map((v) => (
          <line key={`v${v}`} x1={v} y1="4" x2={v} y2="96" stroke="#8a6a37" strokeWidth="0.8" opacity="0.55" />
        ))}
        {lines.map((v) => (
          <line key={`h${v}`} x1="4" y1={v} x2="96" y2={v} stroke="#8a6a37" strokeWidth="0.8" opacity="0.55" />
        ))}
        {stone(5, 5, true)}
        {stone(6, 6, false)}
        {stone(7, 6, true)}
        {stone(8, 7, false)}
        {stone(6, 8, true)}
        <defs>
          <radialGradient id="gm-wood" cx="30%" cy="20%" r="80%">
            <stop offset="0%" stopColor="#f0dcb2" />
            <stop offset="100%" stopColor="#c49a5c" />
          </radialGradient>
        </defs>
      </svg>
    </span>
  );
}
