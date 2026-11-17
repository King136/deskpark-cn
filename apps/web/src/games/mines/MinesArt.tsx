import './mines.css';
/** 大厅插画：一面雷区格子墙 */
export function MinesArt() {
  const nums = [1, 0, 2, 0, 0, 3, 1, 0, 1, 2, 0, 0, 0, 1, 0, 2, 3, 1, 0, 0, 0, 1, 0, 1, 0, 2, 1, 0, 0, 0];
  return (
    <span className="ms-art">
      {nums.map((n, i) => (
        <i key={i} className={n ? 'n' : ''}>{n || ''}</i>
      ))}
    </span>
  );
}
