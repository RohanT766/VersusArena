import React, { useEffect, useState, useRef } from 'react';
import GameLayout from '../common/GameLayout';
import GameCountdown from '../common/GameCountdown';
import { getDisplayName } from '../../utils/modelUtils';
import { getBackendUrl } from '../../utils/networkUtils';
import useGameFlow, { GAME_FLOW_PHASES } from '../../hooks/useGameFlow';
import './MazeGame.css';

const MazeGame = ({ player1Model, player2Model, onBack }) => {
  const base = getBackendUrl();
  const p1 = player1Model || 'gpt-5.5';
  const p2 = player2Model || 'claude-sonnet-4-6';
  const p1Name = getDisplayName(p1);
  const p2Name = getDisplayName(p2);

  const [sessionId, setSessionId] = useState(null);
  const [maze, setMaze] = useState(null);
  const [rows, setRows] = useState(10);
  const [cols, setCols] = useState(10);
  const [goal, setGoal] = useState(null);
  const [p1Pos, setP1Pos] = useState(null);
  const [p2Pos, setP2Pos] = useState(null);
  const [p1Trail, setP1Trail] = useState([]);
  const [p2Trail, setP2Trail] = useState([]);
  const [step, setStep] = useState(0);
  const [maxSteps, setMaxSteps] = useState(150);
  const [done, setDone] = useState(false);
  const [winner, setWinner] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [p1Dir, setP1Dir] = useState(null);
  const [p2Dir, setP2Dir] = useState(null);
  const mountedRef = useRef(true);

  const { isSetup, isCountdown, isRunning, startCountdown, startRunning, goToSetup } = useGameFlow();

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const startGame = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${base}/api/maze/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player1_model: p1, player2_model: p2, rows: 10, cols: 10 }),
      });
      const data = await res.json();
      setSessionId(data.session_id);
      setMaze(data.cells);
      setRows(data.rows);
      setCols(data.cols);
      setGoal(data.goal);
      setP1Pos(data.p1_pos);
      setP2Pos(data.p2_pos);
      setP1Trail(data.p1_trail || [data.p1_pos]);
      setP2Trail(data.p2_trail || [data.p2_pos]);
      setStep(data.step);
      setMaxSteps(data.max_steps);
      setDone(false);
      setWinner(null);
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
      const res = await fetch(`${base}/api/maze/${sessionId}/step`, { method: 'POST' });
      const data = await res.json();
      if (!mountedRef.current) return;
      setP1Pos(data.p1_pos);
      setP2Pos(data.p2_pos);
      setP1Trail(data.p1_trail || []);
      setP2Trail(data.p2_trail || []);
      setStep(data.step);
      setP1Dir(data.p1_dir || null);
      setP2Dir(data.p2_dir || null);

      if (data.done) {
        setDone(true);
        setWinner(data.winner);
        if (data.winner === 1) setStatus(`${p1Name} reached the goal!`);
        else if (data.winner === 2) setStatus(`${p2Name} reached the goal!`);
        else if (data.winner === 0) setStatus('Tie!');
        else setStatus('Time ran out.');
      } else {
        setStatus(`Step ${data.step} / ${data.max_steps}`);
      }
    } catch (e) {
      if (mountedRef.current) setStatus(`Error: ${e.message}`);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  useEffect(() => {
    startGame();
  }, []);

  // Auto-step loop
  useEffect(() => {
    if (!isRunning || !sessionId || done || busy) return;
    const timer = setTimeout(() => { doStep(); }, 800);
    return () => clearTimeout(timer);
  }, [isRunning, sessionId, done, busy, step]);

  const isTrail = (trail, r, c) => trail.some(([tr, tc]) => tr === r && tc === c);

  const cellKey = (r, c) => `${r}-${c}`;

  const renderMaze = () => {
    if (!maze) return null;
    return (
      <div className="maze-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => {
            const cell = maze[r][c];
            const isP1 = p1Pos && p1Pos[0] === r && p1Pos[1] === c;
            const isP2 = p2Pos && p2Pos[0] === r && p2Pos[1] === c;
            const isGoal = goal && goal[0] === r && goal[1] === c;
            const isP1Trail = isTrail(p1Trail, r, c) && !isP1;
            const isP2Trail = isTrail(p2Trail, r, c) && !isP2;

            const wallClasses = [
              !cell.N ? 'wall-n' : '',
              !cell.S ? 'wall-s' : '',
              !cell.E ? 'wall-e' : '',
              !cell.W ? 'wall-w' : '',
            ].filter(Boolean).join(' ');

            return (
              <div key={cellKey(r, c)} className={`maze-cell ${wallClasses}`}>
                {isGoal && !isP1 && !isP2 && <div className="maze-goal" />}
                {isP1Trail && <div className="maze-trail maze-trail-p1" />}
                {isP2Trail && <div className="maze-trail maze-trail-p2" />}
                {isP1 && <div className="maze-dot maze-dot-p1" />}
                {isP2 && <div className="maze-dot maze-dot-p2" />}
              </div>
            );
          })
        )}
      </div>
    );
  };

  const resetGame = () => {
    setSessionId(null);
    setMaze(null);
    setDone(false);
    setWinner(null);
    setStatus('');
    setP1Trail([]);
    setP2Trail([]);
    setStep(0);
    goToSetup();
    startGame();
  };

  const statusText = done
    ? winner === 1 ? `${p1Name} Wins!` : winner === 2 ? `${p2Name} Wins!` : 'Draw!'
    : status || (sessionId ? `Step ${step} / ${maxSteps}` : 'Loading...');

  return (
    <GameLayout
      gameName="Maze Race"
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
        <div className="game-overlay">
          <div className="game-overlay-content">
            <h2 className="game-over-title">RACE OVER</h2>
            <div className="winner-name">
              {winner === 1 ? `${p1Name} WINS!` : winner === 2 ? `${p2Name} WINS!` : 'DRAW!'}
            </div>
            <div className="maze-final-stats">
              <div className="maze-final-stat">
                <div className="maze-final-label">{p1Name}</div>
                <div className="maze-final-val">{p1Trail.length - 1} moves</div>
              </div>
              <div className="maze-final-stat">
                <div className="maze-final-label">{p2Name}</div>
                <div className="maze-final-val">{p2Trail.length - 1} moves</div>
              </div>
              <div className="maze-final-stat">
                <div className="maze-final-label">Steps</div>
                <div className="maze-final-val">{step} / {maxSteps}</div>
              </div>
            </div>
            <button onClick={resetGame} className="new-game-overlay-button">Play again</button>
          </div>
        </div>
      )}

      {isRunning && maze && (
        <div className="maze-container">
          <div className="maze-legend">
            <span className="maze-legend-item">
              <span className="maze-legend-dot maze-dot-p1" /> {p1Name}
              {p1Dir && <span className="maze-legend-dir">{p1Dir}</span>}
            </span>
            <span className="maze-legend-item">
              <span className="maze-legend-dot maze-dot-p2" /> {p2Name}
              {p2Dir && <span className="maze-legend-dir">{p2Dir}</span>}
            </span>
            <span className="maze-legend-item">
              <span className="maze-legend-dot maze-goal" /> Goal
            </span>
          </div>
          {renderMaze()}
          <div className="maze-step-counter">
            Step {step} / {maxSteps}
          </div>
        </div>
      )}

      {isSetup && (
        <div className="maze-hero">
          <h1 className="maze-hero-title">Maze Race</h1>
          <p className="maze-hero-subtitle">
            Watch two AI models navigate the same randomly generated maze.
            First to reach the goal wins.
          </p>
          <div className="maze-hero-matchup">
            <span className="maze-hero-p1">{p1Name}</span>
            <span className="maze-hero-vs">VS</span>
            <span className="maze-hero-p2">{p2Name}</span>
          </div>
          {busy && <p className="maze-hero-loading">Generating maze...</p>}
        </div>
      )}
    </GameLayout>
  );
};

export default MazeGame;
