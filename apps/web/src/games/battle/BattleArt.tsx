import './battle.css';
/** 大厅插画：一张布满舰船与命中的海图 */
export function BattleArt() {
  const cells = Array.from({ length: 64 }, () => 0);
  [[1, 1], [2, 1], [3, 1], [5, 3], [5, 4], [5, 5], [2, 5], [3, 5], [6, 1], [6, 2]].forEach(([x, y]) => {
    cells[y * 8 + x] = 1;
  });
  [17, 42, 44].forEach((i) => (cells[i] = 2));
  return (
    <span className="bt-art">
      {cells.map((v, i) => <i key={i} className={v === 1 ? 'ship' : v === 2 ? 'hit' : ''} />)}
    </span>
  );
}
