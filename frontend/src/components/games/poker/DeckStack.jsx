/** Visible deck on the felt — cards deal from here. */
export default function DeckStack({ active = true, count = 42 }) {
  const layers = Math.min(5, Math.max(3, Math.ceil(count / 10)));
  return (
    <div className={`pk-deck ${active ? 'pk-deck--active' : ''}`} aria-hidden="true">
      {Array.from({ length: layers }).map((_, i) => (
        <div
          key={i}
          className="pk-deck-card"
          style={{ transform: `translate(${i * 1.5}px, ${-i * 2}px)` }}
        />
      ))}
      <span className="pk-deck-label">DECK</span>
    </div>
  );
}
