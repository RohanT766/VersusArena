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
    <rect width="64" height="64" fill="#04111f" />
    <line x1="0" y1="8" x2="64" y2="8" stroke="#0a2440" strokeWidth="0.5" />
    <line x1="0" y1="16" x2="64" y2="16" stroke="#0a2440" strokeWidth="0.5" />
    <line x1="0" y1="24" x2="64" y2="24" stroke="#0a2440" strokeWidth="0.5" />
    <line x1="0" y1="32" x2="64" y2="32" stroke="#0a2440" strokeWidth="0.5" />
    <line x1="0" y1="40" x2="64" y2="40" stroke="#0a2440" strokeWidth="0.5" />
    <line x1="0" y1="48" x2="64" y2="48" stroke="#0a2440" strokeWidth="0.5" />
    <line x1="0" y1="56" x2="64" y2="56" stroke="#0a2440" strokeWidth="0.5" />
    <line x1="8" y1="0" x2="8" y2="64" stroke="#0a2440" strokeWidth="0.5" />
    <line x1="16" y1="0" x2="16" y2="64" stroke="#0a2440" strokeWidth="0.5" />
    <line x1="24" y1="0" x2="24" y2="64" stroke="#0a2440" strokeWidth="0.5" />
    <line x1="32" y1="0" x2="32" y2="64" stroke="#0a2440" strokeWidth="0.5" />
    <line x1="40" y1="0" x2="40" y2="64" stroke="#0a2440" strokeWidth="0.5" />
    <line x1="48" y1="0" x2="48" y2="64" stroke="#0a2440" strokeWidth="0.5" />
    <line x1="56" y1="0" x2="56" y2="64" stroke="#0a2440" strokeWidth="0.5" />
    {/* Top-down ship (vertical, 4 cells) */}
    <polygon points="29,6 35,6 35,38 32,42 29,38" fill="#5a6a7a" />
    <rect x="30" y="8" width="4" height="4" rx="0.5" fill="#3a4a5a" />
    <rect x="29" y="16" width="6" height="8" rx="1" fill="#6a7a8a" />
    <rect x="30.5" y="18" width="3" height="4" rx="0.5" fill="#8a9aaa" opacity="0.4" />
    <rect x="30" y="28" width="4" height="4" rx="0.5" fill="#3a4a5a" />
    <rect x="31" y="24" width="2" height="4" fill="#8a8a8a" opacity="0.6" />
    {/* Hit on ship */}
    <circle cx="32" cy="10" r="2.5" fill="#FF4444" opacity="0.8" />
    {/* Top-down patrol (horizontal, 2 cells) */}
    <rect x="42" y="46" width="16" height="6" rx="2" fill="#8a8a7a" />
    <rect x="44" y="47" width="4" height="4" rx="0.5" fill="#3a4a5a" />
    <rect x="52" y="47" width="4" height="4" rx="0.5" fill="#3a4a5a" />
    {/* Miss splash */}
    <circle cx="12" cy="52" r="3" fill="none" stroke="#3a6a8a" strokeWidth="1" />
    <circle cx="12" cy="52" r="1" fill="rgba(80,160,220,0.5)" />
    {/* Miss splash 2 */}
    <circle cx="50" cy="12" r="2.5" fill="none" stroke="#3a6a8a" strokeWidth="0.8" />
    <circle cx="50" cy="12" r="0.8" fill="rgba(80,160,220,0.5)" />
  </svg>
);
