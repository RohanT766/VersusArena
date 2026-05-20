import { useEffect, useRef, useState } from 'react';
import { arenaPlayerLabel } from '../../utils/arenaStatus';
import './GameActionFeed.css';

const TOAST_MS = 2400;

/**
 * Ephemeral bottom toast — one message at a time, fades in/out. Does not stack or shift layout.
 */
export default function GameActionFeed({ items = [], p1Name, p2Name }) {
  const [toast, setToast] = useState(null);
  const lastIdRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const latest = items.length ? items[items.length - 1] : null;
    if (!latest) return;
    const id = latest.id ?? `${latest.side}-${latest.verb}-${latest.detail}`;
    if (id === lastIdRef.current) return;
    lastIdRef.current = id;

    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ ...latest, toastKey: Date.now() });

    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, TOAST_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [items]);

  if (!toast) return null;

  const side = toast.side;
  const name = side ? arenaPlayerLabel(side, p1Name, p2Name) : null;
  const sideClass = side === 'player1' ? 'game-action-feed__p1' : side === 'player2' ? 'game-action-feed__p2' : '';
  const body = toast.verb != null
    ? `${toast.verb}${toast.detail != null && toast.detail !== '' ? ` ${toast.detail}` : ''}`
    : toast.text;

  return (
    <div className="game-action-feed" aria-live="polite">
      <div
        key={toast.toastKey}
        className={`game-action-feed__item game-action-feed__item--toast ${sideClass}`}
      >
        {name ? <strong>{name}</strong> : null}
        {name && body ? ' ' : null}
        {body}
      </div>
    </div>
  );
}
