import './blocks.css';
/** 大厅插画：堆到底部的方块墙 */
export function BlocksArt() {
  const rows = Array.from({ length: 14 }, () => Array.from({ length: 10 }, () => 0));
  const colors = ['#5aa9c9', '#d8b24a', '#a163b5', '#5aa96b', '#c9555a'];
  for (let i = 0; i < 7; i++) {
    const y = 13 - i;
    const x0 = 2 + (i % 4);
    for (let k = 0; k < 3; k++) if (x0 + k < 10) rows[y][x0 + k] = 1 + ((i + k) % 5);
  }
  return (
    <span className="bk-art">
      {rows.flatMap((row, y) => row.map((v, x) => (
        <i key={`${y}-${x}`} style={v ? { background: colors[v - 1] } : undefined} />
      )))}
    </span>
  );
}
