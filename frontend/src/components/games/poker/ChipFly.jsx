import { useLayoutEffect, useState } from 'react';
import { CHIP_DENOMS, chipsMovedToFlyList } from '../../../utils/chipUtils';

const CHIP_FLY_MS = 1350;
const SEAT_COL_W = 40;
const SEAT_COL_GAP = 4;
const SEAT_CHIP_STEP = 5;
const SEAT_CHIP_H = 14;

/** Per-denom column centers inside the seat rack (matches ChipStacks seat layout). */
function rackChipStart(felt, rackRect, denom, chipIndexInDenom) {
  const colCount = CHIP_DENOMS.length;
  const totalW = colCount * SEAT_COL_W + (colCount - 1) * SEAT_COL_GAP;
  const rackCx = rackRect.left + rackRect.width / 2;
  const rackLeft = rackCx - totalW / 2;
  const colIdx = CHIP_DENOMS.findIndex((d) => d.value === denom.value);

  const colCenter = rackLeft + colIdx * (SEAT_COL_W + SEAT_COL_GAP) + SEAT_COL_W / 2;
  const sx = colCenter - felt.left;
  const sy = rackRect.bottom - SEAT_CHIP_H / 2 - chipIndexInDenom * SEAT_CHIP_STEP - felt.top;

  return { sx, sy };
}

/**
 * Animate exact denomination chips from player rack columns → street bet zone.
 */
export default function ChipFly({ player, chipsMoved, feltEl, fromEl, toEl }) {
  const [paths, setPaths] = useState(null);
  const chips = chipsMovedToFlyList(chipsMoved);

  useLayoutEffect(() => {
    if (!player || !chips.length || !feltEl || !fromEl || !toEl) {
      setPaths(null);
      return undefined;
    }

    const measure = () => {
      const felt = feltEl.getBoundingClientRect();
      const start = fromEl.getBoundingClientRect();
      const end = toEl.getBoundingClientRect();
      if (felt.width < 10) return;

      const ex = end.left + end.width / 2 - felt.left;
      const ey = end.top + end.height / 2 - felt.top;

      const denomIndices = {};
      const next = chips.map((denom) => {
        const chipIdx = denomIndices[denom.value] || 0;
        denomIndices[denom.value] = chipIdx + 1;
        const { sx, sy } = rackChipStart(felt, start, denom, chipIdx);
        return { sx, sy, ex, ey, denom };
      });

      setPaths(next);
    };

    measure();
    const t = setTimeout(() => setPaths(null), CHIP_FLY_MS);
    return () => clearTimeout(t);
  }, [player, chips.length, feltEl, fromEl, toEl, chipsMoved]);

  if (!paths?.length) return null;

  return (
    <div className="pk-chip-fly-layer" aria-hidden="true">
      {paths.map(({ sx, sy, ex, ey, denom }, i) => (
        <span
          key={`${denom.value}-${i}`}
          className="pk-chip-fly-disc"
          style={{
            '--pk-sx': `${sx}px`,
            '--pk-sy': `${sy}px`,
            '--pk-ex': `${ex}px`,
            '--pk-ey': `${ey}px`,
            background: denom.color,
            borderColor: denom.rim,
            color: denom.text || '#fff',
            animationDelay: `${i * 0.12}s`,
          }}
        >
          {paths.length <= 4 ? denom.label : ''}
        </span>
      ))}
    </div>
  );
}
