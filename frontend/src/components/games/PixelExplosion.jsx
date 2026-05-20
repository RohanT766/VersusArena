import React from 'react';

/** 9×9 pixel burst for mine hits (classic arcade style). */
const ROWS = [
  '...r...',
  '..rOr..',
  '.rO#Or.',
  'rO#Y#Or',
  '.rO#Or.',
  '..rOr..',
  '...r...',
];

const PALETTE = {
  r: '#ff6f00',
  O: '#ff9800',
  '#': '#ffeb3b',
  Y: '#fff59d',
};

export default function PixelExplosion({ size = 14, className = '' }) {
  const cols = ROWS[0].length;
  const rows = ROWS.length;
  const px = size / Math.max(cols, rows);

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${cols * px} ${rows * px}`}
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      aria-hidden
    >
      {ROWS.flatMap((row, y) =>
        [...row].map((ch, x) => {
          const fill = PALETTE[ch];
          if (!fill) return null;
          return (
            <rect
              key={`${y}-${x}`}
              x={x * px}
              y={y * px}
              width={px}
              height={px}
              fill={fill}
            />
          );
        }),
      )}
    </svg>
  );
}
