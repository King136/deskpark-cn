import './checkers.css';
export function CheckersArt() {
  const cells = Array.from({ length: 64 }, (_, i) => ((i % 8) + Math.floor(i / 8)) % 2 === 1);
  return (
    <span className="ck-art">
      {cells.map((dark, i) => (
        <i key={i} className={`${dark ? 'd ' : ''}${i < 24 && dark ? 'b' : ''}${i >= 40 && dark ? 'r' : ''}`} />
      ))}
    </span>
  );
}
