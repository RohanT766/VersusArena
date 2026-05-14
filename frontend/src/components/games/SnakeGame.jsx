import React, { useEffect, useState, useRef } from 'react';
import GameLayout from '../common/GameLayout';
import GameCountdown from '../common/GameCountdown';
import { getDisplayName } from '../../utils/modelUtils';
import { getBackendUrl } from '../../utils/networkUtils';
import useGameFlow from '../../hooks/useGameFlow';
import './SnakeGame.css';

const SnakeGame = ({ player1Model, player2Model, onBack }) => {
  const base = getBackendUrl();
  const p1 = player1Model || 'gpt-5.5';
  const p2 = player2Model || 'claude-sonnet-4-6';
  const p1Name = getDisplayName(p1);
  const p2Name = getDisplayName(p2);

  const [sessionId, setSessionId] = useState(null);
  const [rows, setRows] = useState(15);
  const [cols, setCols] = useState(15);
  const [snake1, setSnake1] = useState([]);
  const [snake2, setSnake2] = useState([]);
  const [food, setFood] = useState(null);
  const [score1, setScore1] = useState(0);
  const [score2, setScore2] = useState(0);
  const [step, setStep] = useState(0);
  const [maxSteps, setMaxSteps] = useState(200);
  const [done, setDone] = useState(false);
  const [winner, setWinner] = useState(null);
  const [deathReason, setDeathReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const mountedRef = useRef(true);

  const { isSetup, isCountdown, isRunning, startCountdown, startRunning, goToSetup } = useGameFlow();

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const startGame = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${base}/api/snake/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player1_model: p1, player2_model: p2, rows: 15, cols: 15 }),
      });
      const data = await res.json();
      setSessionId(data.session_id);
      setRows(data.rows);
      setCols(data.cols);
      setSnake1(data.snake1 || []);
      setSnake2(data.snake2 || []);
      setFood(data.food);
      setScore1(data.score1 || 0);
      setScore2(data.score2 || 0);
      setStep(0);
      setMaxSteps(data.max_steps || 200);
      setDone(false);
      setWinner(null);
      setDeathReason('');
      setStatus('');
      startCountdown();
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const doStep = async () => {
    if (!sessionId || !mountedRef.current) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/api/snake/${sessionId}/step`, { method: 'POST' });
      const data = await res.json();
      if (!mountedRef.current) return;
      setSnake1(data.snake1 || []);
      setSnake2(data.snake2 || []);
      setFood(data.food);
      setScore1(data.score1);
      setScore2(data.score2);
      setStep(data.step);

      if (data.done) {
        setDone(true);
        setWinner(data.winner);
        setDeathReason(data.death_reason || '');
      } else {
        setStatus(`Step ${data.step} / ${data.max_steps}`);
      }
    } catch (e) {
      if (mountedRef.current) setStatus(`Error: ${e.message}`);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  useEffect(() => { startGame(); }, []);

  useEffect(() => {
    if (!isRunning || !sessionId || done || busy) return;
    const timer = setTimeout(() => { doStep(); }, 600);
    return () => clearTimeout(timer);
  }, [isRunning, sessionId, done, busy, step]);

  const s1Set = new Set(snake1.map(([r, c]) => `${r},${c}`));
  const s2Set = new Set(snake2.map(([r, c]) => `${r},${c}`));
  const head1 = snake1.length > 0 ? `${snake1[0][0]},${snake1[0][1]}` : null;
  const head2 = snake2.length > 0 ? `${snake2[0][0]},${snake2[0][1]}` : null;
  const foodKey = food ? `${food[0]},${food[1]}` : null;

  const renderBoard = () => (
    <div className="snake-board" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const key = `${r},${c}`;
          const isHead1 = key === head1;
          const isHead2 = key === head2;
          const isS1 = s1Set.has(key) && !isHead1;
          const isS2 = s2Set.has(key) && !isHead2;
          const isFood = key === foodKey;

          let cls = 'snake-cell';
          if (isHead1) cls += ' snake-head-1';
          else if (isHead2) cls += ' snake-head-2';
          else if (isS1) cls += ' snake-body-1';
          else if (isS2) cls += ' snake-body-2';
          if (isFood) cls += ' snake-food';

          return <div key={key} className={cls} />;
        })
      )}
    </div>
  );

  const resetGame = () => {
    setSessionId(null);
    setDone(false);
    setWinner(null);
    setStatus('');
    goToSetup();
    startGame();
  };

  const statusText = done
    ? winner === 1 ? `${p1Name} Wins!` : winner === 2 ? `${p2Name} Wins!` : 'Draw!'
    : status || 'Loading...';

  return (
    <GameLayout
      gameName="Snake Duel"
      player1Name={p1Name}
      player2Name={p2Name}
      onBack={onBack}
      statusText={statusText}
    >
      {isCountdown && (
        <GameCountdown
          player1Name={p1Name}
          player2Name={p2Name}
          onComplete={startRunning}
        />
      )}

      {done && (
        <div className="snake-overlay">
          <div className="snake-overlay-content">
            <h2 className="snake-over-title">GAME OVER</h2>
            <div className="snake-winner">
              {winner === 1 ? `${p1Name} WINS!` : winner === 2 ? `${p2Name} WINS!` : 'DRAW!'}
            </div>
            {deathReason && <div className="snake-death-reason">{deathReason}</div>}
            <div className="snake-final-scores">
              <div className="snake-final-score">
                <span className="snake-final-name" style={{ color: '#10b981' }}>{p1Name}</span>
                <span className="snake-final-val">{score1} food</span>
              </div>
              <div className="snake-final-score">
                <span className="snake-final-name" style={{ color: '#a78bfa' }}>{p2Name}</span>
                <span className="snake-final-val">{score2} food</span>
              </div>
            </div>
            <div className="snake-final-steps">Lasted {step} / {maxSteps} steps</div>
            <button onClick={resetGame} className="snake-replay-btn">Play again</button>
          </div>
        </div>
      )}

      {isRunning && (
        <div className="snake-container">
          <div className="snake-scoreboard">
            <div className="snake-score-side snake-score-p1">
              <span className="snake-score-name">{p1Name}</span>
              <span className="snake-score-num">{score1}</span>
            </div>
            <div className="snake-score-step">Step {step}</div>
            <div className="snake-score-side snake-score-p2">
              <span className="snake-score-name">{p2Name}</span>
              <span className="snake-score-num">{score2}</span>
            </div>
          </div>
          {renderBoard()}
        </div>
      )}

      {isSetup && (
        <div className="snake-hero">
          <h1 className="snake-hero-title">Snake Duel</h1>
          <p className="snake-hero-subtitle">
            Two AI snakes compete on the same board. Eat food to grow.
            Hit a wall or any body and you're out.
          </p>
          <div className="snake-hero-matchup">
            <span className="snake-hero-p1">{p1Name}</span>
            <span className="snake-hero-vs">VS</span>
            <span className="snake-hero-p2">{p2Name}</span>
          </div>
          {busy && <p className="snake-hero-loading">Setting up board...</p>}
        </div>
      )}
    </GameLayout>
  );
};

export default SnakeGame;
