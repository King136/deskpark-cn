import './g2048.css';
const TONE: Record<number, string> = { 2: '#efe6d3', 4: '#ecdfc3', 8: '#e9cfa4', 16: '#e3bd8a', 32: '#dfa877', 64: '#d98f5f' };
/** 大厅插画：四宫格数字砖 */
export function G2048Art() {
  const vals = [2, 4, 8, 16, 32, 64, 8, 16, 128, 256, 512, 1024, 2048, 2, 4, 8];
  return (
    <span className="g2-art">
      {vals.map((v, i) => (
        <i key={i} style={{ background: TONE[v] ?? '#8f4240' }}>{v}</i>
      ))}
    </span>
  );
}
