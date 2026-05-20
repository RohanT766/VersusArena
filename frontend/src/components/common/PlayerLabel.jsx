import PlayerThinking from './PlayerThinking';

/** Standard player name + optional thinking line above a board/seat. */
export default function PlayerLabel({
  name,
  thinking = false,
  activity = null,
  error = null,
  className = '',
}) {
  return (
    <div className={`game-player-label ${className}`.trim()}>
      <span className="game-player-label__name">{name}</span>
      <span className="game-player-label__status">
        {error ? (
          <span className="game-player-thinking game-player-thinking--error" role="alert">
            {error}
          </span>
        ) : (
          <PlayerThinking active={thinking} activity={activity} />
        )}
      </span>
    </div>
  );
}
