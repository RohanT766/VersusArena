import React from 'react';

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

export const AnalyticsIcon = ({ size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="36" width="8" height="20" fill="#538d4e" />
    <rect x="20" y="26" width="8" height="30" fill="#b59f3b" />
    <rect x="32" y="16" width="8" height="40" fill="#6366f1" />
    <rect x="44" y="30" width="8" height="26" fill="#a78bfa" />
    <rect x="6" y="56" width="50" height="2" fill="#444" />
  </svg>
);

export const BattleshipIcon = ({ size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <rect width="64" height="64" fill="#04111f" />
    <rect x="8" y="8" width="48" height="48" fill="none" stroke="#244b73" strokeWidth="1" />
    <rect x="20" y="18" width="6" height="24" fill="#7a8a9a" />
    <rect x="34" y="34" width="18" height="6" fill="#8a8a7a" />
    <rect x="22" y="20" width="2" height="2" fill="#3a4a5a" />
    <rect x="36" y="36" width="2" height="2" fill="#3a4a5a" />
    <rect x="18" y="44" width="4" height="4" fill="#4ea8de" />
    <rect x="42" y="14" width="4" height="4" fill="#ef4444" />
  </svg>
);
