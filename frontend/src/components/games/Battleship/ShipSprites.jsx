/**
 * Top-down naval ship segments — unified hull band so adjacent cells align as one ship.
 * Horizontal: hull band y=11..29 (18px). Vertical: hull band x=11..29 (18px).
 * Connection faces sit on cell edges (x=0/40 or y=0/40).
 */

const HULL = '#556575';
const HULL_HI = '#7a8d9e';
const HULL_LO = '#2e3a45';
const DECK = '#455563';
const SUPER = '#2a343d';
const TURRET = '#1e262d';

const HY0 = 11;
const HY1 = 29;
const HX0 = 11;
const HX1 = 29;

/** @param {{ seg: string, damaged?: boolean }} props */
export function ShipSegmentSprite({ seg, damaged = false }) {
  const op = damaged ? 0.4 : 1;
  const filter = damaged ? 'saturate(0.3) brightness(0.65)' : 'none';

  const svgProps = {
    viewBox: '0 0 40 40',
    width: '100%',
    height: '100%',
    className: `ship-seg ship-seg--${seg}`,
    style: { display: 'block', opacity: op, filter },
    preserveAspectRatio: 'none',
  };

  // Bow: point left, flat connector on right (x=40)
  if (seg === 'h-bow') {
    return (
      <svg {...svgProps}>
        <path
          d={`M4 20 L14 ${HY0} L40 ${HY0} L40 ${HY1} L14 ${HY1} Z`}
          fill={HULL}
          stroke={HULL_LO}
          strokeWidth="0.6"
        />
        <path d={`M6 20 L15 ${HY0 + 2} L38 ${HY0 + 1} L38 ${HY1 - 1} L15 ${HY1 - 2} Z`} fill={HULL_HI} opacity="0.3" />
        <rect x="22" y={HY0 + 2} width="14" height={HY1 - HY0 - 4} rx="1" fill={DECK} />
        <rect x="25" y={HY0 + 4} width="9" height={HY1 - HY0 - 8} rx="1" fill={SUPER} />
        <circle cx="32" cy="20" r="2.5" fill={TURRET} stroke={HULL_LO} strokeWidth="0.5" />
        <circle cx="16" cy="20" r="2" fill={TURRET} stroke={HULL_LO} strokeWidth="0.4" />
      </svg>
    );
  }

  // Stern: flat connector on left (x=0), rounded stern on right
  if (seg === 'h-stern') {
    return (
      <svg {...svgProps}>
        <path
          d={`M0 ${HY0} L26 ${HY0} L38 20 L26 ${HY1} L0 ${HY1} Z`}
          fill={HULL}
          stroke={HULL_LO}
          strokeWidth="0.6"
        />
        <path d={`M0 ${HY0 + 1} L24 ${HY0 + 1} L35 20 L24 ${HY1 - 1} L0 ${HY1 - 1} Z`} fill={HULL_HI} opacity="0.25" />
        <rect x="4" y={HY0 + 2} width="14" height={HY1 - HY0 - 4} rx="1" fill={DECK} />
        <rect x="7" y={HY0 + 4} width="9" height={HY1 - HY0 - 8} rx="1" fill={SUPER} />
        <circle cx="8" cy="20" r="2" fill={TURRET} />
      </svg>
    );
  }

  if (seg === 'h-mid') {
    return (
      <svg {...svgProps}>
        <rect x="0" y={HY0} width="40" height={HY1 - HY0} fill={HULL} stroke={HULL_LO} strokeWidth="0.5" />
        <rect x="0" y={HY0} width="40" height="5" fill={HULL_HI} opacity="0.2" />
        <line x1="0" y1="20" x2="40" y2="20" stroke={HULL_LO} strokeWidth="0.6" opacity="0.7" />
        <rect x="11" y={HY0 + 2} width="18" height={HY1 - HY0 - 4} rx="1" fill={DECK} />
        <rect x="14" y={HY0 + 4} width="12" height={HY1 - HY0 - 8} rx="1" fill={SUPER} />
        <circle cx="6" cy={HY1 - 3} r="2" fill={TURRET} />
        <circle cx="34" cy={HY1 - 3} r="2" fill={TURRET} />
        <ellipse cx="20" cy={HY0 + 1} rx="4" ry="2" fill={SUPER} opacity="0.75" />
      </svg>
    );
  }

  // Bow: point up, flat connector on bottom (y=40)
  if (seg === 'v-bow') {
    return (
      <svg {...svgProps}>
        <path
          d={`M20 4 L${HX1} 14 L${HX1} 40 L${HX0} 40 L${HX0} 14 Z`}
          fill={HULL}
          stroke={HULL_LO}
          strokeWidth="0.6"
        />
        <path d={`M20 6 L${HX1 - 2} 15 L${HX1 - 2} 38 L${HX0 + 2} 38 L${HX0 + 2} 15 Z`} fill={HULL_HI} opacity="0.3" />
        <rect x={HX0 + 2} y="22" width={HX1 - HX0 - 4} height="14" rx="1" fill={DECK} />
        <rect x={HX0 + 4} y="25" width={HX1 - HX0 - 8} height="9" rx="1" fill={SUPER} />
        <circle cx="20" cy="10" r="2.5" fill={TURRET} stroke={HULL_LO} strokeWidth="0.5" />
        <circle cx="20" cy="30" r="2" fill={TURRET} stroke={HULL_LO} strokeWidth="0.4" />
      </svg>
    );
  }

  // Stern: flat connector on top (y=0), rounded stern on bottom
  if (seg === 'v-stern') {
    return (
      <svg {...svgProps}>
        <path
          d={`M${HX0} 0 L${HX1} 0 L${HX1} 26 L20 38 L${HX0} 26 Z`}
          fill={HULL}
          stroke={HULL_LO}
          strokeWidth="0.6"
        />
        <path d={`M${HX0 + 1} 0 L${HX1 - 1} 0 L${HX1 - 1} 24 L20 35 L${HX0 + 1} 24 Z`} fill={HULL_HI} opacity="0.25" />
        <rect x={HX0 + 2} y="4" width={HX1 - HX0 - 4} height="14" rx="1" fill={DECK} />
        <rect x={HX0 + 4} y="7" width={HX1 - HX0 - 8} height="9" rx="1" fill={SUPER} />
        <circle cx="20" cy="32" r="2" fill={TURRET} />
      </svg>
    );
  }

  if (seg === 'v-mid') {
    return (
      <svg {...svgProps}>
        <rect x={HX0} y="0" width={HX1 - HX0} height="40" fill={HULL} stroke={HULL_LO} strokeWidth="0.5" />
        <rect x={HX0} y="0" width="5" height="40" fill={HULL_HI} opacity="0.2" />
        <line x1="20" y1="0" x2="20" y2="40" stroke={HULL_LO} strokeWidth="0.6" opacity="0.7" />
        <rect x={HX0 + 2} y="13" width={HX1 - HX0 - 4} height="14" rx="1" fill={DECK} />
        <rect x={HX0 + 4} y="15" width={HX1 - HX0 - 8} height="9" rx="1" fill={SUPER} />
        <circle cx={HX1 - 3} cy="8" r="2" fill={TURRET} />
        <circle cx={HX1 - 3} cy="32" r="2" fill={TURRET} />
        <ellipse cx="20" cy="20" rx="3" ry="4" fill={HULL_LO} opacity="0.35" />
      </svg>
    );
  }

  // Patrol / single cell — same beam as mid sections
  return (
    <svg {...svgProps}>
      <rect x={HX0} y={HY0} width={HX1 - HX0} height={HY1 - HY0} rx="3" fill={HULL} stroke={HULL_LO} strokeWidth="0.6" />
      <rect x={HX0 + 1} y={HY0 + 1} width={HX1 - HX0 - 2} height="5" fill={HULL_HI} opacity="0.25" />
      <rect x={HX0 + 3} y={HY0 + 3} width={HX1 - HX0 - 6} height={HY1 - HY0 - 6} rx="1" fill={DECK} />
      <rect x={HX0 + 5} y={HY0 + 5} width={HX1 - HX0 - 10} height={HY1 - HY0 - 10} rx="1" fill={SUPER} />
      <circle cx="20" cy={HY0 + 2} r="2.2" fill={TURRET} />
      <circle cx={HX1 - 4} cy="20" r="1.8" fill={TURRET} />
    </svg>
  );
}

export const FLEET_HULL_COLOR = HULL;
