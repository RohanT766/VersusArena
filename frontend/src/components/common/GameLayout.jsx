import React from 'react';
import GameActionFeed from './GameActionFeed';
import './GameLayout.css';

/**
 * @param {object} props
 * @param {string} [props.statusText] — game phase only (round, hand, puzzle); not agent thinking
 * @param {Array<{ side?: string, text: string, id?: string }>} [props.actionFeed] — bottom action overlay
 */
const GameLayout = ({ gameName, player1Name, player2Name, onBack, children, statusText, actionFeed }) => {
  return (
    <div className="game-layout">
      <div className="game-layout-header">
        <button className="game-layout-back" onClick={onBack}>
          ← Back
        </button>

        <div className="game-layout-players">
          <span className="game-layout-p1">{player1Name}</span>
          <span className="game-layout-vs">VS</span>
          <span className="game-layout-p2">{player2Name}</span>
        </div>

        <div className="game-layout-title">{gameName}</div>
      </div>

      {statusText && (
        <div className="game-layout-status">{statusText}</div>
      )}

      <div className="game-layout-content">
        {children}
        {actionFeed?.length > 0 && (
          <GameActionFeed items={actionFeed} p1Name={player1Name} p2Name={player2Name} />
        )}
      </div>
    </div>
  );
};

export default GameLayout;
