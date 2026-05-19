const SUIT = { c: '♣', d: '♦', h: '♥', s: '♠' };
const SUIT_CLASS = { c: 'spades', d: 'diamonds', h: 'hearts', s: 'spades' };

export function parseCard(card) {
  if (!card || card.length < 2) return null;
  const rank = card[0];
  const suitKey = card[1];
  return {
    rank: rank === 'T' ? '10' : rank,
    suit: SUIT[suitKey] || suitKey,
    suitClass: SUIT_CLASS[suitKey] || 'spades',
    red: suitKey === 'h' || suitKey === 'd',
  };
}

export default function PlayingCard({ card, faceDown = false, size = 'md', deal = false, style }) {
  const cls = `pk-card pk-card--${size} ${deal ? 'pk-card--deal' : ''}`;

  if (faceDown) {
    return <div className={`${cls} pk-card--back`} style={style} />;
  }

  const p = parseCard(card);
  if (!p) {
    return <div className={`${cls} pk-card--empty`} style={style} />;
  }

  return (
    <div
      className={`${cls} pk-card--face ${p.red ? 'pk-card--red' : ''}`}
      style={style}
    >
      <span className="pk-card-corner pk-card-corner--tl">
        <span className="pk-card-rank">{p.rank}</span>
        <span className={`pk-card-suit pk-card-suit--${p.suitClass}`}>{p.suit}</span>
      </span>
      <span className={`pk-card-pip pk-card-pip--${p.suitClass}`}>{p.suit}</span>
      <span className="pk-card-corner pk-card-corner--br">
        <span className="pk-card-rank">{p.rank}</span>
        <span className={`pk-card-suit pk-card-suit--${p.suitClass}`}>{p.suit}</span>
      </span>
    </div>
  );
}
