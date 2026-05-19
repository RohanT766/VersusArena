import React from 'react';

const P = 4; // 4×4 px blocks in a 16×16 grid (64×64 viewBox)

/** Bitmap rows → rects; '.' = skip */
function PixelMap({ rows, palette, ox = 0, oy = 0, scale = P }) {
  return rows.flatMap((row, y) =>
    [...row].map((ch, x) => {
      const fill = palette[ch];
      if (!fill) return null;
      return (
        <rect
          key={`${y}-${x}`}
          x={ox + x * scale}
          y={oy + y * scale}
          width={scale}
          height={scale}
          fill={fill}
        />
      );
    }),
  );
}

const NUM_COLORS = { 1: '#4169e1', 2: '#228b22', 3: '#dc143c' };

const DIGITS = {
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '###', '..#', '###'],
};

function PixelDigit({ digit, cx, cy, cell, color }) {
  const glyph = DIGITS[digit];
  if (!glyph) return null;
  const gw = glyph[0].length;
  const gh = glyph.length;
  const ps = Math.max(1, Math.floor(cell / (gh + 2)));
  const ox = cx + Math.floor((cell - gw * ps) / 2);
  const oy = cy + Math.floor((cell - gh * ps) / 2);
  return glyph.flatMap((row, dy) =>
    [...row].map((ch, dx) =>
      ch === '#' ? (
        <rect
          key={`${digit}-${dx}-${dy}`}
          x={ox + dx * ps}
          y={oy + dy * ps}
          width={ps}
          height={ps}
          fill={color}
        />
      ) : null,
    ),
  );
}

function MinesweeperCells({ ox, oy, cell, gap, board }) {
  const elems = [];
  board.forEach((row, cy) => {
    [...row].forEach((ch, cx) => {
      const x = ox + cx * (cell + gap);
      const y = oy + cy * (cell + gap);
      if (ch === 'u') {
        elems.push(
          <rect key={`${cx}-${cy}-bg`} x={x} y={y} width={cell} height={cell} fill="#9e9e9e" />,
          <rect key={`${cx}-${cy}-hi`} x={x} y={y} width={cell} height={1} fill="#ececec" />,
          <rect key={`${cx}-${cy}-hi2`} x={x} y={y} width={1} height={cell} fill="#ececec" />,
          <rect key={`${cx}-${cy}-lo`} x={x} y={y + cell - 1} width={cell} height={1} fill="#5a5a5a" />,
          <rect key={`${cx}-${cy}-lo2`} x={x + cell - 1} y={y} width={1} height={cell} fill="#5a5a5a" />,
        );
      } else if (ch === 'R') {
        elems.push(<rect key={`${cx}-${cy}`} x={x} y={y} width={cell} height={cell} fill="#bdbdbd" />);
      } else if (ch === 'M') {
        elems.push(<rect key={`${cx}-${cy}-bg`} x={x} y={y} width={cell} height={cell} fill="#c62828" />);
        const mine = ['..XX..', '.X..X.', 'X.##.X', 'X.##.X', '.X..X.', '..XX..'];
        const ps = 1;
        const mx = x + Math.floor((cell - mine[0].length * ps) / 2);
        const my = y + Math.floor((cell - mine.length * ps) / 2);
        mine.forEach((mr, dy) =>
          [...mr].forEach((mc, dx) => {
            if (mc === 'X') elems.push(<rect key={`m${cx}${cy}${dx}${dy}`} x={mx + dx} y={my + dy} width={ps} height={ps} fill="#111" />);
            if (mc === '#') elems.push(<rect key={`h${cx}${cy}${dx}${dy}`} x={mx + dx} y={my + dy} width={ps} height={ps} fill="#555" />);
          }),
        );
      } else if (ch === 'F') {
        elems.push(
          <rect key={`${cx}-${cy}-bg`} x={x} y={y} width={cell} height={cell} fill="#9e9e9e" />,
          <rect key={`${cx}-${cy}-hi`} x={x} y={y} width={cell} height={1} fill="#ececec" />,
          <rect key={`${cx}-${cy}-hi2`} x={x} y={y} width={1} height={cell} fill="#ececec" />,
        );
        const px = x + 2;
        elems.push(
          <rect key={`${cx}-${cy}-pole`} x={px} y={y + 1} width={1} height={cell - 2} fill="#111" />,
          <rect key={`${cx}-${cy}-flag`} x={px + 1} y={y + 1} width={cell - 3} height={3} fill="#d32f2f" />,
          <rect key={`${cx}-${cy}-base`} x={px - 1} y={y + cell - 2} width={3} height={1} fill="#111" />,
        );
      } else if (ch >= '1' && ch <= '3') {
        elems.push(<rect key={`${cx}-${cy}`} x={x} y={y} width={cell} height={cell} fill="#bdbdbd" />);
        elems.push(
          <PixelDigit key={`${cx}-${cy}-d`} digit={Number(ch)} cx={x} cy={y} cell={cell} color={NUM_COLORS[ch]} />,
        );
      }
    });
  });
  return elems;
}

export const WordleIcon = ({ size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    {/* 5-tile wordle row - green/yellow/gray pattern */}
    {/* Row 1 */}
    <rect x="4" y="8" width="10" height="10" fill="#538d4e" rx="1" />
    <rect x="16" y="8" width="10" height="10" fill="#b59f3b" rx="1" />
    <rect x="28" y="8" width="10" height="10" fill="#3a3a3c" rx="1" />
    <rect x="40" y="8" width="10" height="10" fill="#538d4e" rx="1" />
    <rect x="52" y="8" width="10" height="10" fill="#3a3a3c" rx="1" />
    {/* Row 2 */}
    <rect x="4" y="20" width="10" height="10" fill="#3a3a3c" rx="1" />
    <rect x="16" y="20" width="10" height="10" fill="#538d4e" rx="1" />
    <rect x="28" y="20" width="10" height="10" fill="#538d4e" rx="1" />
    <rect x="40" y="20" width="10" height="10" fill="#b59f3b" rx="1" />
    <rect x="52" y="20" width="10" height="10" fill="#538d4e" rx="1" />
    {/* Row 3 */}
    <rect x="4" y="32" width="10" height="10" fill="#538d4e" rx="1" />
    <rect x="16" y="32" width="10" height="10" fill="#538d4e" rx="1" />
    <rect x="28" y="32" width="10" height="10" fill="#538d4e" rx="1" />
    <rect x="40" y="32" width="10" height="10" fill="#538d4e" rx="1" />
    <rect x="52" y="32" width="10" height="10" fill="#538d4e" rx="1" />
    {/* Empty rows */}
    <rect x="4" y="44" width="10" height="10" fill="none" stroke="#333" strokeWidth="1" rx="1" />
    <rect x="16" y="44" width="10" height="10" fill="none" stroke="#333" strokeWidth="1" rx="1" />
    <rect x="28" y="44" width="10" height="10" fill="none" stroke="#333" strokeWidth="1" rx="1" />
    <rect x="40" y="44" width="10" height="10" fill="none" stroke="#333" strokeWidth="1" rx="1" />
    <rect x="52" y="44" width="10" height="10" fill="none" stroke="#333" strokeWidth="1" rx="1" />
  </svg>
);

export const ConnectionsIcon = ({ size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    {/* 4x4 grid with colored groups */}
    {/* Yellow group */}
    <rect x="4" y="4" width="12" height="12" fill="#f9df6d" rx="2" />
    <rect x="18" y="4" width="12" height="12" fill="#f9df6d" rx="2" />
    <rect x="32" y="4" width="12" height="12" fill="#f9df6d" rx="2" />
    <rect x="46" y="4" width="12" height="12" fill="#f9df6d" rx="2" />
    {/* Green group */}
    <rect x="4" y="18" width="12" height="12" fill="#a0c35a" rx="2" />
    <rect x="18" y="18" width="12" height="12" fill="#a0c35a" rx="2" />
    <rect x="32" y="18" width="12" height="12" fill="#a0c35a" rx="2" />
    <rect x="46" y="18" width="12" height="12" fill="#a0c35a" rx="2" />
    {/* Blue group */}
    <rect x="4" y="32" width="12" height="12" fill="#b0c4ef" rx="2" />
    <rect x="18" y="32" width="12" height="12" fill="#b0c4ef" rx="2" />
    <rect x="32" y="32" width="12" height="12" fill="#b0c4ef" rx="2" />
    <rect x="46" y="32" width="12" height="12" fill="#b0c4ef" rx="2" />
    {/* Purple group */}
    <rect x="4" y="46" width="12" height="12" fill="#ba81c5" rx="2" />
    <rect x="18" y="46" width="12" height="12" fill="#ba81c5" rx="2" />
    <rect x="32" y="46" width="12" height="12" fill="#ba81c5" rx="2" />
    <rect x="46" y="46" width="12" height="12" fill="#ba81c5" rx="2" />
  </svg>
);

export const PrisonersIcon = ({ size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="8" width="20" height="20" fill="#538d4e" />
    <rect x="36" y="8" width="20" height="20" fill="#b59f3b" />
    <rect x="8" y="36" width="20" height="20" fill="#b59f3b" />
    <rect x="36" y="36" width="20" height="20" fill="#8b3a3a" />
    <rect x="17" y="17" width="2" height="2" fill="#fff" />
    <rect x="45" y="17" width="2" height="2" fill="#fff" />
    <rect x="17" y="45" width="2" height="2" fill="#fff" />
    <rect x="45" y="45" width="2" height="2" fill="#fff" />
    <rect x="30" y="8" width="4" height="48" fill="#111" />
    <rect x="8" y="30" width="48" height="4" fill="#111" />
  </svg>
);

export const TwentyQIcon = ({ size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="10" width="48" height="30" fill="none" stroke="#6366f1" strokeWidth="3" />
    <rect x="18" y="40" width="14" height="6" fill="#6366f1" />
    <rect x="24" y="46" width="4" height="6" fill="#6366f1" />
    <rect x="28" y="18" width="8" height="4" fill="#fff" />
    <rect x="36" y="22" width="4" height="8" fill="#fff" />
    <rect x="32" y="30" width="4" height="4" fill="#fff" />
    <rect x="32" y="36" width="4" height="4" fill="#fff" />
  </svg>
);

export const CodeDebugIcon = ({ size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="16" width="6" height="4" fill="#666" />
    <rect x="10" y="20" width="4" height="20" fill="#666" />
    <rect x="10" y="40" width="6" height="4" fill="#666" />
    <rect x="48" y="16" width="6" height="4" fill="#666" />
    <rect x="50" y="20" width="4" height="20" fill="#666" />
    <rect x="48" y="40" width="6" height="4" fill="#666" />
    <rect x="28" y="20" width="8" height="4" fill="#ef4444" />
    <rect x="24" y="24" width="16" height="10" fill="#ef4444" />
    <rect x="22" y="30" width="20" height="6" fill="#ef4444" />
    <rect x="26" y="36" width="3" height="6" fill="#ef4444" />
    <rect x="35" y="36" width="3" height="6" fill="#ef4444" />
    <rect x="28" y="26" width="2" height="2" fill="#111" />
    <rect x="34" y="26" width="2" height="2" fill="#111" />
  </svg>
);

export const SnakeIcon = ({ size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    {/* Snake 1 - green */}
    <rect x="6" y="28" width="8" height="8" fill="#10b981" rx="2" />
    <rect x="14" y="28" width="6" height="8" fill="rgba(16,185,129,0.6)" rx="1" />
    <rect x="20" y="28" width="6" height="8" fill="rgba(16,185,129,0.6)" rx="1" />
    <rect x="26" y="28" width="6" height="8" fill="rgba(16,185,129,0.5)" rx="1" />
    <rect x="26" y="20" width="6" height="8" fill="rgba(16,185,129,0.4)" rx="1" />
    {/* Snake 2 - purple */}
    <rect x="50" y="36" width="8" height="8" fill="#a78bfa" rx="2" />
    <rect x="44" y="36" width="6" height="8" fill="rgba(167,139,250,0.6)" rx="1" />
    <rect x="38" y="36" width="6" height="8" fill="rgba(167,139,250,0.5)" rx="1" />
    <rect x="38" y="44" width="6" height="8" fill="rgba(167,139,250,0.4)" rx="1" />
    {/* Food */}
    <circle cx="46" cy="16" r="4" fill="#ffcc00" />
  </svg>
);

export const AnalyticsIcon = ({ size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="36" width="8" height="20" fill="#538d4e" />
    <rect x="20" y="26" width="8" height="30" fill="#b59f3b" />
    <rect x="32" y="16" width="8" height="40" fill="#6366f1" />
    <rect x="44" y="30" width="8" height="26" fill="#a78bfa" />
    <rect x="6" y="56" width="50" height="2" fill="#444" />
  </svg>
);

export const MazeIcon = ({ size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="4" width="56" height="56" fill="none" stroke="#334" strokeWidth="3" />
    {/* Maze walls */}
    <rect x="16" y="4" width="2" height="20" fill="#334" />
    <rect x="28" y="14" width="2" height="20" fill="#334" />
    <rect x="40" y="4" width="2" height="14" fill="#334" />
    <rect x="52" y="20" width="2" height="24" fill="#334" />
    <rect x="4" y="24" width="14" height="2" fill="#334" />
    <rect x="30" y="36" width="16" height="2" fill="#334" />
    <rect x="16" y="44" width="20" height="2" fill="#334" />
    <rect x="40" y="46" width="2" height="14" fill="#334" />
    {/* Player 1 - green dot */}
    <circle cx="10" cy="12" r="4" fill="#10b981" />
    {/* Player 2 - purple dot */}
    <circle cx="14" cy="16" r="4" fill="#a78bfa" />
    {/* Goal - yellow */}
    <rect x="50" y="50" width="6" height="6" fill="#ffcc00" rx="1" />
  </svg>
);

export const BattleshipIcon = ({ size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
    <rect width="64" height="64" fill="#0a1628" />
    {/* Ocean grid */}
    {[12, 20, 28, 36, 44, 52].map((n) => (
      <React.Fragment key={`g${n}`}>
        <rect x={n} y="8" width="2" height="48" fill="#1e3a5f" />
        <rect x="8" y={n} width="48" height="2" fill="#1e3a5f" />
      </React.Fragment>
    ))}
    {/* Carrier ship — 5 pixel blocks */}
    <rect x="16" y="24" width="8" height="8" fill="#6b7c8a" />
    <rect x="24" y="24" width="8" height="8" fill="#7a8a9a" />
    <rect x="32" y="24" width="8" height="8" fill="#8a9aaa" />
    <rect x="40" y="24" width="8" height="8" fill="#7a8a9a" />
    <rect x="48" y="24" width="8" height="8" fill="#6b7c8a" />
    <rect x="28" y="20" width="8" height="4" fill="#4a5a6a" />
    {/* Destroyer */}
    <rect x="20" y="40" width="8" height="8" fill="#5a6a7a" />
    <rect x="28" y="40" width="8" height="8" fill="#6a7a8a" />
    <rect x="36" y="40" width="8" height="8" fill="#5a6a7a" />
    {/* Hit + miss markers */}
    <rect x="44" y="40" width="8" height="8" fill="#ef4444" />
    <rect x="12" y="44" width="8" height="8" fill="#38bdf8" />
    <rect x="14" y="46" width="4" height="4" fill="#0a1628" />
  </svg>
);

export const MinesweeperIcon = ({ size = 64 }) => {
  const cell = 7;
  const gap = 1;
  const board = [
    'uu11uuu',
    'u12121u',
    'u1RRR2u',
    'u2RRR1u',
    'uuuMFuu',
    'uuuuuuu',
    'uuuuuuu',
  ];
  const n = board[0].length;
  const total = n * cell + (n - 1) * gap;
  const ox = (64 - total) / 2;
  const oy = (64 - total) / 2;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
      <rect width="64" height="64" fill="#1c1c1e" />
      <rect x={ox - 3} y={oy - 3} width={total + 6} height={total + 6} fill="#3a3a3c" />
      <MinesweeperCells ox={ox} oy={oy} cell={cell} gap={gap} board={board} />
    </svg>
  );
};

export const AuctionIcon = ({ size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <rect x="20" y="40" width="24" height="8" fill="#78716c" />
    <rect x="28" y="20" width="8" height="22" fill="#a8a29e" />
    <rect x="16" y="16" width="32" height="6" fill="#f59e0b" rx="2" />
    <text x="22" y="14" fontSize="8" fill="#111" fontWeight="bold">$</text>
    <rect x="8" y="48" width="12" height="8" fill="#22c55e" rx="1" />
    <rect x="44" y="48" width="12" height="8" fill="#a78bfa" rx="1" />
  </svg>
);

export const PokerIcon = ({ size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
    <rect width="64" height="64" fill="#0a1f12" />
    <PixelMap
      rows={[
        '................',
        '......tttt......',
        '.....tttttt.....',
        '....tttttttt....',
        '...ttfffffftt...',
        '...ttfffffftt...',
        '...ttfffffftt...',
        '....tttttttt....',
        '.....tttttt.....',
        '......tttt......',
        '................',
      ]}
      palette={{ t: '#14532d', f: '#166534' }}
    />
    {/* Rim highlight */}
    <rect x="14" y="17" width="36" height="1" fill="#22c55e" opacity="0.5" />
    {/* Hole cards — left (Ace of hearts) */}
    <rect x="8" y="14" width="14" height="20" fill="#fafafa" stroke="#d4d4d8" strokeWidth="0.5" />
    <rect x="9" y="15" width="3" height="3" fill="#dc2626" />
    <PixelMap
      ox={11}
      oy={20}
      scale={1}
      rows={['.##.', '####', '.##.', '#..#', '.##.']}
      palette={{ '#': '#dc2626' }}
    />
    <rect x="17" y="29" width="3" height="3" fill="#dc2626" />
    {/* Hole cards — right (King of spades) */}
    <rect x="42" y="14" width="14" height="20" fill="#fafafa" stroke="#d4d4d8" strokeWidth="0.5" />
    <rect x="52" y="15" width="3" height="3" fill="#111" />
    <PixelMap
      ox={46}
      oy={20}
      scale={1}
      rows={['.##.', '####', '.##.', '..#.', '###.']}
      palette={{ '#': '#111' }}
    />
    <rect x="43" y="29" width="3" height="3" fill="#111" />
    {/* Community cards */}
    {[22, 28, 34].map((x) => (
      <React.Fragment key={x}>
        <rect x={x} y="30" width="5" height="7" fill="#fefce8" stroke="#d4d4d8" strokeWidth="0.5" />
        <rect x={x + 1} y="31" width="3" height="5" fill="#fef08a" opacity="0.4" />
      </React.Fragment>
    ))}
    {/* Chip stack — elliptical disks */}
    {[
      { y: 48, w: 10, fill: '#b45309' },
      { y: 45, w: 10, fill: '#d97706' },
      { y: 42, w: 10, fill: '#f59e0b' },
      { y: 39, w: 10, fill: '#fbbf24' },
    ].map(({ y, w, fill }) => (
      <React.Fragment key={y}>
        <rect x={48 - w / 2} y={y} width={w} height={2} fill={fill} />
        <rect x={48 - w / 2 + 1} y={y} width={w - 2} height={1} fill="#fff" opacity="0.35" />
        <rect x={48 - w / 2} y={y + 1} width={w} height={1} fill="#92400e" />
      </React.Fragment>
    ))}
    {/* Dealer button */}
    <rect x="14" y="38" width="8" height="8" fill="#f8fafc" />
    <rect x="15" y="39" width="6" height="6" fill="#e2e8f0" />
    <rect x="16" y="40" width="4" height="4" fill="#111" />
  </svg>
);
