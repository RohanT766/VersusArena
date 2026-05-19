/**
 * Top-down naval ship segments — unified steel grey (classic Battleship aesthetic).
 */

const HULL = '#556575';
const HULL_HI = '#7a8d9e';
const HULL_LO = '#2e3a45';
const DECK = '#455563';
const SUPER = '#2a343d';
const TURRET = '#1e262d';

/** @param {{ seg: string, damaged?: boolean }} props */
export function ShipSegmentSprite({ seg, damaged = false }) {
  const op = damaged ? 0.4 : 1;
  const filter = damaged ? 'saturate(0.3) brightness(0.65)' : 'none';

  const svgProps = {
    viewBox: '0 0 40 40',
    width: '100%',
    height: '100%',
    style: { display: 'block', opacity: op, filter },
    preserveAspectRatio: 'none',
  };

  // Bow pointing right
  if (seg === 'h-bow') {
    return (
      <svg {...svgProps}>
        <path
          d="M2 12 L26 10 L36 20 L26 30 L2 28 Z"
          fill={HULL}
          stroke={HULL_LO}
          strokeWidth="0.8"
        />
        <path d="M4 14 L24 12 L30 16 L24 18 L6 18 Z" fill={HULL_HI} opacity="0.35" />
        <ellipse cx="18" cy="20" rx="6" ry="8" fill={DECK} />
        <rect x="14" y="15" width="8" height="10" rx="1" fill={SUPER} />
        <circle cx="30" cy="20" r="3.5" fill={TURRET} stroke={HULL_LO} strokeWidth="0.6" />
        <circle cx="30" cy="20" r="1.5" fill={HULL_LO} />
        <circle cx="12" cy="20" r="2.5" fill={TURRET} stroke={HULL_LO} strokeWidth="0.5" />
      </svg>
    );
  }

  if (seg === 'h-mid') {
    return (
      <svg {...svgProps}>
        <rect x="0" y="10" width="40" height="20" fill={HULL} stroke={HULL_LO} strokeWidth="0.6" />
        <rect x="0" y="10" width="40" height="6" fill={HULL_HI} opacity="0.22" />
        <line x1="0" y1="20" x2="40" y2="20" stroke={HULL_LO} strokeWidth="0.8" />
        <rect x="11" y="12" width="18" height="12" rx="1" fill={DECK} />
        <rect x="14" y="13" width="12" height="8" rx="1" fill={SUPER} />
        <rect x="16" y="14" width="8" height="5" fill={HULL_LO} opacity="0.5" />
        <circle cx="6" cy="24" r="2.2" fill={TURRET} />
        <circle cx="34" cy="24" r="2.2" fill={TURRET} />
        <ellipse cx="20" cy="11" rx="4" ry="2" fill={SUPER} opacity="0.8" />
      </svg>
    );
  }

  if (seg === 'h-stern') {
    return (
      <svg {...svgProps}>
        <path
          d="M0 12 L30 10 L38 16 L38 24 L30 30 L0 28 Z"
          fill={HULL}
          stroke={HULL_LO}
          strokeWidth="0.8"
        />
        <path d="M0 14 L28 12 L34 16 L28 18 L0 18 Z" fill={HULL_HI} opacity="0.25" />
        <ellipse cx="10" cy="20" rx="5" ry="7" fill={DECK} />
        <rect x="6" y="15" width="8" height="10" rx="1" fill={SUPER} />
        <circle cx="4" cy="20" r="2" fill={TURRET} />
      </svg>
    );
  }

  // Bow pointing up
  if (seg === 'v-bow') {
    return (
      <svg {...svgProps}>
        <path
          d="M12 2 L28 2 L32 26 L20 38 L8 26 Z"
          fill={HULL}
          stroke={HULL_LO}
          strokeWidth="0.8"
        />
        <path d="M14 4 L26 4 L28 14 L20 16 L12 14 Z" fill={HULL_HI} opacity="0.35" />
        <ellipse cx="20" cy="22" rx="8" ry="6" fill={DECK} />
        <rect x="15" y="18" width="10" height="8" rx="1" fill={SUPER} />
        <circle cx="20" cy="6" r="3.5" fill={TURRET} stroke={HULL_LO} strokeWidth="0.6" />
        <circle cx="20" cy="28" r="2.5" fill={TURRET} />
      </svg>
    );
  }

  if (seg === 'v-mid') {
    return (
      <svg {...svgProps}>
        <rect x="10" y="0" width="20" height="40" fill={HULL} stroke={HULL_LO} strokeWidth="0.6" />
        <rect x="10" y="0" width="6" height="40" fill={HULL_HI} opacity="0.2" />
        <line x1="20" y1="0" x2="20" y2="40" stroke={HULL_LO} strokeWidth="0.8" />
        <rect x="12" y="13" width="16" height="14" rx="1" fill={DECK} />
        <rect x="14" y="15" width="12" height="9" rx="1" fill={SUPER} />
        <circle cx="24" cy="8" r="2.2" fill={TURRET} />
        <circle cx="24" cy="32" r="2.2" fill={TURRET} />
        <ellipse cx="20" cy="20" rx="3" ry="5" fill={HULL_LO} opacity="0.35" />
      </svg>
    );
  }

  if (seg === 'v-stern') {
    return (
      <svg {...svgProps}>
        <path
          d="M10 0 L30 0 L32 30 L22 38 L18 38 L8 30 Z"
          fill={HULL}
          stroke={HULL_LO}
          strokeWidth="0.8"
        />
        <path d="M12 2 L28 2 L30 10 L20 12 L10 10 Z" fill={HULL_HI} opacity="0.25" />
        <ellipse cx="20" cy="10" rx="6" ry="5" fill={DECK} />
        <rect x="15" y="6" width="10" height="8" rx="1" fill={SUPER} />
        <circle cx="20" cy="34" r="2" fill={TURRET} />
      </svg>
    );
  }

  // Patrol / single cell
  return (
    <svg {...svgProps}>
      <ellipse cx="20" cy="20" rx="14" ry="10" fill={HULL} stroke={HULL_LO} strokeWidth="0.8" />
      <ellipse cx="20" cy="17" rx="11" ry="5" fill={HULL_HI} opacity="0.28" />
      <ellipse cx="20" cy="20" rx="7" ry="5" fill={DECK} />
      <rect x="16" y="16" width="8" height="6" rx="1" fill={SUPER} />
      <circle cx="20" cy="12" r="2.5" fill={TURRET} />
      <circle cx="26" cy="22" r="1.8" fill={TURRET} />
    </svg>
  );
}

export const FLEET_HULL_COLOR = HULL;
