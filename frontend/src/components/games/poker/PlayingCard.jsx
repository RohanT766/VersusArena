const SUIT = { c: '♣', d: '♦', h: '♥', s: '♠' };

export function parseCard(card) {
  if (!card || card.length < 2) return null;
  const rank = card[0];
  const suitKey = card[1];
  return {
    rank: rank === 'T' ? '10' : rank,
    suit: SUIT[suitKey] || suitKey,
    suitKey,
    red: suitKey === 'h' || suitKey === 'd',
  };
}

function PixelCardBack() {
  return (
    <svg viewBox="0 0 32 44" className="pk-card-svg" shapeRendering="crispEdges">
      <rect width="32" height="44" fill="#1a3560" />
      <rect x="2" y="2" width="28" height="40" fill="#244a82" stroke="#c9a227" strokeWidth="2" />
      <rect x="12" y="14" width="8" height="8" fill="#c9a227" opacity="0.65" />
      <rect x="10" y="26" width="12" height="4" fill="#c9a227" opacity="0.45" />
    </svg>
  );
}

/** Corner ranks + single large suit in the center (pixel style). */
function PixelCardFace({ p }) {
  const ink = p.red ? '#c62828' : '#1a1a1a';
  return (
    <svg viewBox="0 0 32 44" className="pk-card-svg" shapeRendering="crispEdges">
      <rect width="32" height="44" fill="#ece8dc" />
      <rect x="1" y="1" width="30" height="42" fill="#f5f2e8" stroke="#3a3a3a" strokeWidth="2" />
      <text x="5" y="11" fill={ink} className="pk-card-text pk-card-text--rank">
        {p.rank}
      </text>
      <text x="27" y="39" fill={ink} className="pk-card-text pk-card-text--rank" textAnchor="end">
        {p.rank}
      </text>
      <text x="16" y="27" fill={ink} className="pk-card-text pk-card-text--suit-center" textAnchor="middle">
        {p.suit}
      </text>
    </svg>
  );
}

export default function PlayingCard({
  card,
  faceDown = false,
  size = 'md',
  deal = false,
  style,
}) {
  const cls = [
    `pk-card pk-card--${size}`,
    deal ? 'pk-card--deal' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (faceDown) {
    return (
      <div className={`${cls} pk-card--back`} style={style}>
        <PixelCardBack />
      </div>
    );
  }

  const p = parseCard(card);
  if (!p) {
    return <div className={`${cls} pk-card--empty`} style={style} />;
  }

  return (
    <div className={`${cls} pk-card--face`} style={style}>
      <PixelCardFace p={p} />
    </div>
  );
}
