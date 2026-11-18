import './sudoku.css';
/** 大厅插画：一张填了半盘的数独 */
export function SudokuArt() {
  const nums = '534|678|912|672|195|348|198|342|567|'.split('|').join('');
  const grid = nums.split('').map((ch, i) => (ch === '-' ? 0 : Number(ch) || (i % 7)));
  return (
    <span className="sd-art">
      {grid.map((n, i) => (
        <i key={i} className={i % 3 === 0 ? 'b' : ''}>{n || ''}</i>
      ))}
    </span>
  );
}
