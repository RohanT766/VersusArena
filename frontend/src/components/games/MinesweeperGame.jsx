import React, { useState, useEffect, useRef, useCallback } from 'react';
import GameCountdown from '../common/GameCountdown';
import GameLayout from '../common/GameLayout';
import GameOverModal from '../common/GameOverModal';
import { getDisplayName } from '../../utils/modelUtils';
import { cancelBenchmarkRun } from '../../utils/networkUtils';
import useGameFlow from '../../hooks/useGameFlow';
import { formatAgentActivity, agentThinkingLabel } from '../../utils/agentActivity';
import './MinesweeperGame.css';

const NUM_COLORS = ['', '#3b82f6', '#22c55e', '#ef4444', '#7c3aed', '#b45309', '#06b6d4', '#1f2937', '#6b7280'];

const MinesweeperGame = ({ player1Model, player2Model, onBack = () => window.history.back() }) => {
  const [sessionId, setSessionId] = useState('');
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [agentActivity, setAgentActivity] = useState(null);
  const [gameOverDismissed, setGameOverDismissed] = useState(false);
  const { isCountdown, isRunning, startCountdown, startRunning } = useGameFlow();
  const benchmarkRunIdRef = useRef(null);
  const gameFinishedRef = useRef(false);
  const abortRef = useRef(null);
  const stopLoopRef = useRef(false);

  const p1Name = getDisplayName(player1Model);
  const p2Name = getDisplayName(player2Model);

  const getApiBase = () => {
    const h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' ? 'http://localhost:8000' : `http://${h}:8000`;
  };

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    const handleUnload = () => {
      if (!gameFinishedRef.current) cancelBenchmarkRun(benchmarkRunIdRef.current);
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      controller.abort();
      if (!gameFinishedRef.current) cancelBenchmarkRun(benchmarkRunIdRef.current);
    };
  }, []);

  const startGame = useCallback(async (isRecovery = false) => {
    try {
      setError(null);
      stopLoopRef.current = false;
      const res = await fetch(`${getApiBase()}/api/minesweeper/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player1_model: player1Model, player2_model: player2Model }),
        signal: abortRef.current?.signal,
      });
      if (!res.ok) throw new Error(`Could not start game (${res.status})`);
      const data = await res.json();
      setSessionId(data.session_id);
      if (!isRecovery) benchmarkRunIdRef.current = data.benchmark_run_id || null;
      setState(data);
      if (!isRecovery) startCountdown();
      else startRunning();
    } catch (e) {
      if (e.name === 'AbortError') return;
      stopLoopRef.current = true;
      setError(e.message);
    }
  }, [player1Model, player2Model, startCountdown, startRunning]);

  useEffect(() => {
    startGame(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doStep = useCallback(async (player) => {
    if (!sessionId || busy || state?.done || stopLoopRef.current) return;
    const ps = player === 'player1' ? state?.player1 : state?.player2;
    if (!ps?.alive) return;
    setBusy(true);
    setAgentActivity('Agent thinking…');
    try {
      const res = await fetch(`${getApiBase()}/api/minesweeper/${sessionId}/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player }),
        signal: abortRef.current?.signal,
      });
      if (res.status === 404) {
        stopLoopRef.current = true;
        setError('Session lost (server restarted). Starting a fresh board…');
        await startGame(true);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const detail = body.detail || body.message || `HTTP ${res.status}`;
        throw new Error(typeof detail === 'string' ? detail : 'Step failed');
      }
      const data = await res.json();
      setAgentActivity(formatAgentActivity(data.step));
      setState(data);
      setError(null);
      if (data.done) {
        gameFinishedRef.current = true;
        setGameOverDismissed(false);
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        stopLoopRef.current = true;
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  }, [sessionId, busy, state, startGame]);

  useEffect(() => {
    if (!isRunning || isCountdown || !state || state.done || busy || stopLoopRef.current) return;
    const p1Alive = state.player1?.alive;
    const p2Alive = state.player2?.alive;
    const turn = (!p1Alive && p2Alive) ? 'player2' : (p1Alive && !p2Alive) ? 'player1' :
      (state.player1?.steps <= state.player2?.steps ? 'player1' : 'player2');
    const t = setTimeout(() => doStep(turn), 1200);
    return () => clearTimeout(t);
  }, [isRunning, isCountdown, state, busy, doStep]);

  const renderGrid = (playerState, side) => (
    <div className={`ms-side ms-side-${side}`}>
      <div className="ms-score">
        {side === 1 ? p1Name : p2Name}: {playerState?.score || 0}/{state?.safe_cells || 54}
        {!playerState?.alive && <span className="ms-out"> — OUT</span>}
      </div>
      <div className="ms-grid">
        {(playerState?.grid || []).map((row, ri) =>
          row.map((cell, ci) => {
            const revealed = cell !== null;
            const isMine = cell === -1;
            const cls = ['ms-cell', revealed ? 'revealed' : '', isMine ? 'mine' : ''].filter(Boolean).join(' ');
            return (
              <div key={`${ri}-${ci}`} className={cls}>
                {revealed && !isMine && cell > 0 && (
                  <span style={{ color: NUM_COLORS[cell] || '#fff' }}>{cell}</span>
                )}
                {revealed && isMine && <span className="ms-boom">💥</span>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const winnerLabel = () => {
    if (!state?.done) return null;
    const w = state.winner_side;
    if (w === 1) return p1Name;
    if (w === 2) return p2Name;
    return 'Draw';
  };

  return (
    <GameLayout
      gameName="Minesweeper Race"
      player1Name={p1Name}
      player2Name={p2Name}
      onBack={() => {
        if (!gameFinishedRef.current) cancelBenchmarkRun(benchmarkRunIdRef.current);
        onBack();
      }}
      statusText={state?.done ? `${winnerLabel()} wins!` : agentThinkingLabel(busy, agentActivity) || 'Race to clear the minefield'}
    >
      {isCountdown && (
        <GameCountdown player1Name={p1Name} player2Name={p2Name} onComplete={startRunning} />
      )}

      <GameOverModal
        open={Boolean(state?.done && !gameOverDismissed)}
        onClose={() => setGameOverDismissed(true)}
        title="GAME OVER"
        actions={
          <button type="button" className="new-game-overlay-button" onClick={onBack}>
            Back to Arena
          </button>
        }
      >
        <div className="winner-name">{winnerLabel()} WINS!</div>
        <div className="ms-final">
          <span>{p1Name}: {state?.player1?.score}</span>
          <span>{p2Name}: {state?.player2?.score}</span>
        </div>
      </GameOverModal>

      {isRunning && !isCountdown && state && (
        <div className="ms-split">
          {renderGrid(state.player1, 1)}
          <div className="game-split-vs">VS</div>
          {renderGrid(state.player2, 2)}
        </div>
      )}

      {error && <p className="ms-error">{error}</p>}
    </GameLayout>
  );
};

export default MinesweeperGame;
