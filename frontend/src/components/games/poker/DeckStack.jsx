import { forwardRef } from 'react';

/** Pixel deck stack on the felt. */
const DeckStack = forwardRef(function DeckStack({ active = true, count = 42 }, ref) {
  const layers = Math.min(4, Math.max(2, Math.ceil(count / 12)));
  return (
    <div ref={ref} className={`pk-deck ${active ? 'pk-deck--active' : ''}`} aria-hidden="true">
      {Array.from({ length: layers }).map((_, i) => (
        <svg
          key={i}
          viewBox="0 0 32 44"
          className="pk-deck-card"
          shapeRendering="crispEdges"
          style={{ transform: `translate(${i * 2}px, ${-i * 3}px)` }}
        >
          <rect width="32" height="44" fill="#1a3560" />
          <rect x="2" y="2" width="28" height="40" fill="#244a82" stroke="#c9a227" strokeWidth="2" />
          <rect x="10" y="18" width="12" height="8" fill="#c9a227" opacity="0.35" />
        </svg>
      ))}
      <span className="pk-deck-label">DECK</span>
    </div>
  );
});

export default DeckStack;
