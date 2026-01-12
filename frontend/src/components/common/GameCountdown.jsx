import React, { useState, useEffect } from 'react';
import './GameCountdown.css';

const GameCountdown = ({ onComplete, player1Name, player2Name }) => {
  const [count, setCount] = useState(3);
  const [phase, setPhase] = useState('countdown'); // 'countdown' | 'go' | 'done'

  useEffect(() => {
    if (phase === 'done') return;

    if (phase === 'go') {
      const timer = setTimeout(() => {
        setPhase('done');
        onComplete();
      }, 600);
      return () => clearTimeout(timer);
    }

    if (count > 0) {
      const timer = setTimeout(() => setCount(count - 1), 800);
      return () => clearTimeout(timer);
    } else {
      setPhase('go');
    }
  }, [count, phase]);

  if (phase === 'done') return null;

  return (
    <div className="countdown-overlay">
      <div className="countdown-matchup">
        <span className="countdown-p1">{player1Name || 'PLAYER 1'}</span>
        <span className="countdown-vs">VS</span>
        <span className="countdown-p2">{player2Name || 'PLAYER 2'}</span>
      </div>
      <div className={`countdown-number ${phase === 'go' ? 'countdown-go' : ''}`} key={phase === 'go' ? 'go' : count}>
        {phase === 'go' ? 'GO' : count}
      </div>
    </div>
  );
};

export default GameCountdown;
