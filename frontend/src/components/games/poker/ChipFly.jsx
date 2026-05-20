import { useLayoutEffect, useState } from 'react';
import { chipsMovedToFlyList } from '../../../utils/chipUtils';

/**
 * Animate exact denomination chips from player rack → street bet zone.
 */
export default function ChipFly({ player, chipsMoved, feltEl, fromEl, toEl }) {
  const [path, setPath] = useState(null);
  const chips = chipsMovedToFlyList(chipsMoved);

  useLayoutEffect(() => {
    if (!player || !chips.length || !feltEl || !fromEl || !toEl) {
      setPath(null);
      return undefined;
    }

    const measure = () => {
      const felt = feltEl.getBoundingClientRect();
      const start = fromEl.getBoundingClientRect();
      const end = toEl.getBoundingClientRect();
      if (felt.width < 10) return;

      setPath({
        sx: start.left + start.width / 2 - felt.left,
        sy: start.top + start.height / 2 - felt.top,
        ex: end.left + end.width / 2 - felt.left,
        ey: end.top + end.height / 2 - felt.top,
      });
    };

    measure();
    const t = setTimeout(() => setPath(null), 720);
    return () => clearTimeout(t);
  }, [player, chips.length, feltEl, fromEl, toEl, chipsMoved]);

  if (!path || !chips.length) return null;

  return (
    <div className="pk-chip-fly-layer" aria-hidden="true">
      {chips.map((denom, i) => (
        <span
          key={`${denom.value}-${i}`}
          className="pk-chip-fly-disc"
          style={{
            '--pk-sx': `${path.sx}px`,
            '--pk-sy': `${path.sy}px`,
            '--pk-ex': `${path.ex}px`,
            '--pk-ey': `${path.ey}px`,
            background: denom.color,
            borderColor: denom.rim,
            color: denom.text || '#fff',
            animationDelay: `${i * 0.05}s`,
          }}
        >
          {chips.length <= 4 ? denom.label : ''}
        </span>
      ))}
    </div>
  );
}
