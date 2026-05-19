import React, { useState, useEffect, useRef, useCallback } from 'react';
import GameCountdown from '../common/GameCountdown';
import GameLayout from '../common/GameLayout';
import GameOverModal from '../common/GameOverModal';
import { getDisplayName } from '../../utils/modelUtils';
import { cancelBenchmarkRun } from '../../utils/networkUtils';
import useGameFlow from '../../hooks/useGameFlow';
import { formatAgentActivity, agentThinkingLabel } from '../../utils/agentActivity';
import './AuctionGame.css';

const AuctionGame = ({ player1Model, player2Model, onBack = () => window.history.back() }) => {
  const [sessionId, setSessionId] = useState('');
  const [state, setState] = useState(null);
  const [lastRound, setLastRound] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [agentActivity, setAgentActivity] = useState(null);
  const [gameOverDismissed, setGameOverDismissed] = useState(false);
  const { isCountdown, isRunning, startCountdown, startRunning } = useGameFlow();
  const benchmarkRunIdRef = useRef(null);
  const gameFinishedRef = useRef(false);
  const abortRef = useRef(null);

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

  const startGame = async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/auction/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player1_model: player1Model, player2_model: player2Model }),
        signal: abortRef.current?.signal,
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setSessionId(data.session_id);
      benchmarkRunIdRef.current = data.benchmark_run_id || null;
      setState(data);
      startCountdown();
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    }
  };

  useEffect(() => { startGame(); }, []);

  const playRound = useCallback(async () => {
    if (!sessionId || busy || state?.done) return;
    setBusy(true);
    setAgentActivity('Reviewing auction…');
    try {
      const res = await fetch(`${getApiBase()}/api/auction/${sessionId}/round`, {
        method: 'POST',
        signal: abortRef.current?.signal,
      });
      if (!res.ok) throw new Error('Round failed');
      const data = await res.json();
      const rr = data.round_result;
      const activity = rr
        ? formatAgentActivity({ tool_calls: [...(rr.tool_calls_p1 || []), ...(rr.tool_calls_p2 || [])] })
        : null;
      setAgentActivity(activity);
      setState(data);
      if (rr) setLastRound(rr);
      if (data.done) {
        gameFinishedRef.current = true;
        setGameOverDismissed(false);
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [sessionId, busy, state]);

  useEffect(() => {
    if (!isRunning || isCountdown || !state || state.done || busy) return;
    const t = setTimeout(playRound, 2000);
    return () => clearTimeout(t);
  }, [isRunning, isCountdown, state, busy, playRound]);

  useEffect(() => {
    if (state?.current_item && !busy) {
      const t = setTimeout(() => setLastRound(null), 2500);
      return () => clearTimeout(t);
    }
  }, [state?.current_round, busy]);

  const winnerLabel = () => {
    if (!state?.done) return null;
    if (state.winner_side === 1) return p1Name;
    if (state.winner_side === 2) return p2Name;
    return 'Draw';
  };

  const cur = state?.current_item;
  const rr = lastRound;

  return (
    <GameLayout
      gameName="Auction Blitz"
      player1Name={p1Name}
      player2Name={p2Name}
      onBack={() => {
        if (!gameFinishedRef.current) cancelBenchmarkRun(benchmarkRunIdRef.current);
        onBack();
      }}
      statusText={state?.done ? `${winnerLabel()} wins!` : `Round ${state?.current_round || 0}/${state?.total_rounds || 8}`}
    >
      {isCountdown && <GameCountdown player1Name={p1Name} player2Name={p2Name} onComplete={startRunning} />}

      <GameOverModal
        open={Boolean(state?.done && !gameOverDismissed)}
        onClose={() => setGameOverDismissed(true)}
        title="AUCTION OVER"
        actions={<button type="button" className="new-game-overlay-button" onClick={onBack}>Back to Arena</button>}
      >
        <div className="winner-name">{winnerLabel()} WINS!</div>
        <div className="auc-final">
          <span>{p1Name}: {state?.value_p1} pts</span>
          <span>{p2Name}: {state?.value_p2} pts</span>
        </div>
      </GameOverModal>

      {isRunning && !isCountdown && state && (
        <div className="auc-main">
          <div className="auc-players">
            <div className="auc-player auc-p1">
              <div className="auc-name">{p1Name}</div>
              <div className="auc-budget">Budget: {state.budget_p1}</div>
              <div className="auc-value">Won: {state.value_p1} pts</div>
            </div>
            <div className="auc-player auc-p2">
              <div className="auc-name">{p2Name}</div>
              <div className="auc-budget">Budget: {state.budget_p2}</div>
              <div className="auc-value">Won: {state.value_p2} pts</div>
            </div>
          </div>

          {cur && !rr && (
            <div className="auc-item-card">
              <h3>{cur.item_name}</h3>
              <p className="auc-hint">{cur.hint}</p>
              <p className="auc-value-hidden">Value: ???</p>
            </div>
          )}

          {rr && (
            <div className="auc-reveal auc-reveal-pop">
              <h3>{rr.item}</h3>
              <p className="auc-true-value">True value: {rr.value}</p>
              <div className="auc-bids">
                <span>{p1Name}: {rr.bid_p1}</span>
                <span>{p2Name}: {rr.bid_p2}</span>
              </div>
              <p className="auc-round-winner">
                {rr.winner ? `${rr.winner === 'player1' ? p1Name : p2Name} wins item!` : 'Tie — no winner'}
              </p>
            </div>
          )}

          {busy && <p className="auc-thinking">{agentThinkingLabel(busy, agentActivity)}</p>}
        </div>
      )}
      {error && <p className="auc-error">{error}</p>}
    </GameLayout>
  );
};

export default AuctionGame;
