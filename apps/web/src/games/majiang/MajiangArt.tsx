import './majiang.css';
export function MajiangArt() {
  return (
    <span className="mj-art">
      {['九万', '中', '三筒', '八条', '发', '二万', '五筒', '东风'].map((t, i) => <i key={i}>{t}</i>)}
    </span>
  );
}
