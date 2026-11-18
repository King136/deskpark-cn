import './ludo.css';
export function LudoArt() {
  const hue = ['#c9555a', '#d8b24a', '#5aa96b', '#5f76c8'];
  return (
    <span className="ld-art">
      {Array.from({ length: 36 }, (_, i) => (
        <i key={i} style={{ background: i % 5 === 0 ? hue[(i / 5) % 4 | 0] : undefined }} />
      ))}
    </span>
  );
}
