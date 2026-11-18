import './liar.css';
/** 大厅插画：五颗骰子 */
export function LiarArt() {
  return (
    <span className="li-art">
      {[5, 3, 6, 2, 4, 1, 5, 5, 3].map((n, i) => <i key={i}>{n}</i>)}
    </span>
  );
}
