import React from 'react';

const P = 4; // pixel size

const Pixel = ({ x, y, color, size = P }) => (
  <rect x={x * size} y={y * size} width={size} height={size} fill={color} />
);

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

export const TriviaIcon = ({ size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    {/* Pixelated question mark / brain */}
    {/* Top curve of ? */}
    <Pixel x={4} y={1} color="#fff" />
    <Pixel x={5} y={1} color="#fff" />
    <Pixel x={6} y={1} color="#fff" />
    <Pixel x={7} y={1} color="#fff" />
    <Pixel x={8} y={1} color="#fff" />
    <Pixel x={3} y={2} color="#fff" />
    <Pixel x={9} y={2} color="#fff" />
    <Pixel x={3} y={3} color="#fff" />
    <Pixel x={9} y={3} color="#fff" />
    {/* Right side down */}
    <Pixel x={8} y={4} color="#fff" />
    <Pixel x={9} y={4} color="#fff" />
    <Pixel x={7} y={5} color="#fff" />
    <Pixel x={8} y={5} color="#fff" />
    <Pixel x={6} y={6} color="#fff" />
    <Pixel x={7} y={6} color="#fff" />
    {/* Stem */}
    <Pixel x={6} y={7} color="#fff" />
    <Pixel x={7} y={7} color="#fff" />
    <Pixel x={6} y={8} color="#fff" />
    <Pixel x={7} y={8} color="#fff" />
    {/* Gap */}
    {/* Dot */}
    <Pixel x={6} y={10} color="#fff" />
    <Pixel x={7} y={10} color="#fff" />
    <Pixel x={6} y={11} color="#fff" />
    <Pixel x={7} y={11} color="#fff" />
    {/* Lightning bolt accent */}
    <Pixel x={11} y={3} color="#ffcc00" />
    <Pixel x={10} y={4} color="#ffcc00" />
    <Pixel x={11} y={4} color="#ffcc00" />
    <Pixel x={12} y={4} color="#ffcc00" />
    <Pixel x={11} y={5} color="#ffcc00" />
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

export const BattleshipIcon = ({ size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    {/* Water grid background */}
    {[0,1,2,3,4,5,6,7].map(r => [0,1,2,3,4,5,6,7].map(c => (
      <rect key={`${r}-${c}`} x={c*8} y={r*8} width="7" height="7" fill="#0a1628" stroke="#1a2a4a" strokeWidth="0.5" />
    )))}
    {/* Ship (horizontal, 4 cells) */}
    <rect x="8" y="16" width="7" height="7" fill="#4ECDC4" />
    <rect x="16" y="16" width="7" height="7" fill="#4ECDC4" />
    <rect x="24" y="16" width="7" height="7" fill="#4ECDC4" />
    <rect x="32" y="16" width="7" height="7" fill="#4ECDC4" />
    {/* Ship (vertical, 3 cells) */}
    <rect x="48" y="8" width="7" height="7" fill="#FF6B6B" />
    <rect x="48" y="16" width="7" height="7" fill="#FF6B6B" />
    <rect x="48" y="24" width="7" height="7" fill="#FF6B6B" />
    {/* Ship (horizontal, 2 cells) */}
    <rect x="0" y="40" width="7" height="7" fill="#DDA0DD" />
    <rect x="8" y="40" width="7" height="7" fill="#DDA0DD" />
    {/* Hit markers */}
    <rect x="16" y="16" width="7" height="7" fill="#FF4444" />
    <text x="19.5" y="22" fontSize="6" fill="#fff" textAnchor="middle" fontFamily="monospace" fontWeight="bold">X</text>
    {/* Miss markers */}
    <rect x="24" y="40" width="7" height="7" fill="#1a3a5a" />
    <text x="27.5" y="46" fontSize="5" fill="#6688AA" textAnchor="middle" fontFamily="monospace">~</text>
    <rect x="32" y="32" width="7" height="7" fill="#1a3a5a" />
    <text x="35.5" y="38" fontSize="5" fill="#6688AA" textAnchor="middle" fontFamily="monospace">~</text>
  </svg>
);
