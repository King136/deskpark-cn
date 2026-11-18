import './klondike.css';
export function KlondikeArt() {
  return (
    <span className="kl-art">
      {Array.from({ length: 16 }, (_, i) => (
        <i key={i} style={{ opacity: i > 11 ? 0.55 : 1, background: i % 3 === 0 ? '#f6ecec' : '#f3efe4' }} />
      ))}
    </span>
  );
}
