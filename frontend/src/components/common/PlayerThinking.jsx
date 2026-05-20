import { thinkingText } from '../../utils/arenaStatus';

/**
 * Fixed-height thinking line — always occupies space so layout never jumps.
 */
export default function PlayerThinking({ active = false, activity = null }) {
  const label = active ? thinkingText(activity) : '';
  return (
    <span
      className={`game-player-thinking ${active ? 'game-player-thinking--active' : 'game-player-thinking--idle'}`}
      aria-live="polite"
      aria-hidden={!active}
    >
      {label || '\u00a0'}
    </span>
  );
}
