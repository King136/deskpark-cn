import './snake.css';
/** 大厅插画：一条绕行的蛇 */
export function SnakeArt() {
  const cells = Array.from({ length: 64 }, () => 0);
  [[1, 0], [2, 0], [3, 0], [4, 0], [4, 1], [4, 2], [3, 2], [2, 2], [1, 2], [1, 3]].forEach(([x, y]) => {
    cells[y * 8 + x] = 1;
  });
  cells[10] = 2;
  return (
    <span className="sn-art">
      {cells.map((v, i) => <i key={i} className={v === 1 ? 'on' : v === 2 ? 'food' : ''} />)}
    </span>
  );
}
