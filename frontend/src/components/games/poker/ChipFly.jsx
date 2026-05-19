import { useLayoutEffect, useState } from 'react';

const DISC_COUNT = 4;

/**
 * Animate chips from seat anchor → pot using measured DOM positions.
 */
export default function ChipFly({ from, amount, feltEl, fromEl, toEl }) {
  const [path, setPath] = useState(null);

  useLayoutEffect(() => {
    if (!from || !amount || !feltEl || !fromEl || !toEl) {
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
    const t = setTimeout(() => setPath(null), 650);
    return () => clearTimeout(t);
  }, [from, amount, feltEl, fromEl, toEl]);

  if (!path) return null;

  return (
    <div className="pk-chip-fly-layer" aria-hidden="true">
      {Array.from({ length: DISC_COUNT }).map((_, i) => (
        <span
          key={i}
          className="pk-chip-fly-disc"
          style={{
            '--pk-sx': `${path.sx}px`,
            '--pk-sy': `${path.sy}px`,
            '--pk-ex': `${path.ex}px`,
            '--pk-ey': `${path.ey}px`,
            animationDelay: `${i * 0.06}s`,
          }}
        />
      ))}
    </div>
  );
}
