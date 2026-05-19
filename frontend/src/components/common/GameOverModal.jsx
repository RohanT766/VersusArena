import React from 'react';
import './GameOverModal.css';

const GameOverModal = ({
  open,
  onClose,
  title = 'GAME OVER',
  children,
  actions,
}) => {
  if (!open) return null;

  return (
    <div
      className="game-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-over-title"
      onClick={onClose}
    >
      <div className="game-overlay-content" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="game-overlay-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <h2 id="game-over-title" className="game-over-title">{title}</h2>
        {children}
        {actions && <div className="game-overlay-actions">{actions}</div>}
      </div>
    </div>
  );
};

export default GameOverModal;
