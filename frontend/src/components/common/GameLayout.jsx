import React from 'react';
import './GameLayout.css';

const GameLayout = ({ gameName, player1Name, player2Name, onBack, children, statusText }) => {
  return (
    <div className="game-layout">
      <div className="game-layout-header">
        <button className="game-layout-back" onClick={onBack}>
          ← BACK
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
      </div>
    </div>
  );
};

export default GameLayout;
