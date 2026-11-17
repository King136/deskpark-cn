import './reversi.css';

/** 大厅插画：绿绒盘面上交错黑白子 */
export function ReversiArt() {
  const cells = Array.from({ length: 64 }, (_, i) => i);
  const discs: Record<number, 'b' | 'w'> = { 9: 'w', 14: 'b', 18: 'b', 23: 'w', 27: 'w', 36: 'b', 41: 'w', 50: 'b' };
  return (
    <span className="rv-art">
      {cells.map((i) => (
        <i key={i} className={`rv-art__c${discs[i] ? ` is-${discs[i]}` : ''}`} />
      ))}
    </span>
  );
}
