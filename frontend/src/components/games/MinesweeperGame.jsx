import React, { useState, useEffect, useRef, useCallback } from 'react';
import GameCountdown from '../common/GameCountdown';
import GameLayout from '../common/GameLayout';
import GameOverModal from '../common/GameOverModal';
import { getDisplayName } from '../../utils/modelUtils';
import { cancelBenchmarkRun, getBackendUrl } from '../../utils/networkUtils';
import useGameFlow from '../../hooks/useGameFlow';
import PlayerLabel from '../common/PlayerLabel';
import PixelExplosion from './PixelExplosion';
import './MinesweeperGame.css';

const NUM_COLORS = ['', '#3b82f6', '#22c55e', '#ef4444', '#7c3aed', '#b45309', '#06b6d4', '#1f2937', '#6b7280'];
const MAX_STEPS = 20;

const MinesweeperGame = ({ player1Model, player2Model, onBack = () => window.history.back() }) => {
  const [sessionId, setSessionId] = useState('');
  const [state, setState] = useState(null);
  const [player1Thinking, setPlayer1Thinking] = useState(false);
  const [player2Thinking, setPlayer2Thinking] = useState(false);
  const [agentActivity1, setAgentActivity1] = useState(null);
  const [agentActivity2, setAgentActivity2] = useState(null);
  const [actionFeed, setActionFeed] = useState([]);
  const [gameOverDismissed, setGameOverDismissed] = useState(false);
  const { isCountdown, isRunning, startCountdown, startRunning } = useGameFlow();
  const benchmarkRunIdRef = useRef(null);
  const gameFinishedRef = useRef(false);
  const abortRef = useRef(null);
  const stopLoopRef = useRef(false);
  const gameLoopRunning = useRef(false);
  const loopStartedRef = useRef(false);
  const mountedRef = useRef(true);
  const stateRef = useRef(null);
  const sessionIdRef = useRef('');

  const p1Name = getDisplayName(player1Model);
  const p2Name = getDisplayName(player2Model);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const canStep = (st, side) => {
    const ps = side === 'player1' ? st?.player1 : st?.player2;
    const steps = side === 'player1' ? st?.player1?.steps : st?.player2?.steps;
    return Boolean(ps?.alive && (steps ?? 0) < MAX_STEPS);
  };

  const applyRound = (data) => {
    setPlayer1Thinking(false);
    setPlayer2Thinking(false);
    setAgentActivity1(null);
    setAgentActivity2(null);
    const round = data.round || {};
    const newMoves = [];
    for (const side of ['player1', 'player2']) {
      const r = round[side];
      if (r == null || r.row == null) continue;
      const hit = r.hit_mine ? 'hit mine' : `score ${r.score}`;
      newMoves.push({
        id: `ms-${side}-${r.row}-${r.col}-${Date.now()}`,
        side,
        verb: `reveals (${r.row},${r.col})`,
        detail: hit,
      });
    }
    if (newMoves.length) setActionFeed((prev) => [...prev, ...newMoves].slice(-12));
    setState(data);
  };

  const startSession = useCallback(async (signal, withCountdown = true) => {
    const res = await fetch(`${getBackendUrl()}/api/minesweeper/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player1_model: player1Model, player2_model: player2Model }),
      signal,
    });
    if (!res.ok || signal.aborted || !mountedRef.current) return null;
    const data = await res.json();
    setSessionId(data.session_id);
    sessionIdRef.current = data.session_id;
    benchmarkRunIdRef.current = data.benchmark_run_id || null;
    setState(data);
    setActionFeed([]);
    if (withCountdown) startCountdown();
    else startRunning();
    return data;
  }, [player1Model, player2Model, startCountdown, startRunning]);

  const fetchRoundOnce = async (sid, signal) => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/minesweeper/${sid}/round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
      });
      if (signal.aborted) return null;
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      if (e.name === 'AbortError') return null;
      return null;
    }
  };

  const runGameLoop = useCallback(async (sid) => {
    if (!sid || gameLoopRunning.current || stopLoopRef.current) return;
    gameLoopRunning.current = true;

    try {
      const signal = abortRef.current?.signal;

      while (!stopLoopRef.current && mountedRef.current) {
        const st = stateRef.current;
        if (!st || st.done) break;
        if (!canStep(st, 'player1') && !canStep(st, 'player2')) break;

        setPlayer1Thinking(canStep(st, 'player1'));
        setPlayer2Thinking(canStep(st, 'player2'));

        const data = await fetchRoundOnce(sid, signal);
        if (!data || signal?.aborted || !mountedRef.current) break;

        applyRound(data);

        if (data.done) {
          gameFinishedRef.current = true;
          setGameOverDismissed(false);
          break;
        }

        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 1200);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
          }, { once: true });
        });
      }
    } finally {
      setPlayer1Thinking(false);
      setPlayer2Thinking(false);
      gameLoopRunning.current = false;
    }
  }, []);

  const handleCountdownComplete = useCallback(() => {
    startRunning();
    const sid = sessionIdRef.current;
    if (!sid || loopStartedRef.current || stopLoopRef.current) return;
    loopStartedRef.current = true;
    runGameLoop(sid);
  }, [startRunning, runGameLoop]);

  useEffect(() => {
    mountedRef.current = true;
    stopLoopRef.current = false;
    loopStartedRef.current = false;
    gameLoopRunning.current = false;
    gameFinishedRef.current = false;

    const controller = new AbortController();
    abortRef.current = controller;

    const handleUnload = () => {
      if (!gameFinishedRef.current) cancelBenchmarkRun(benchmarkRunIdRef.current);
    };
    window.addEventListener('beforeunload', handleUnload);
    startSession(controller.signal, true);

    return () => {
      mountedRef.current = false;
      stopLoopRef.current = true;
      controller.abort();
      window.removeEventListener('beforeunload', handleUnload);
      if (!gameFinishedRef.current) cancelBenchmarkRun(benchmarkRunIdRef.current);
    };
  }, [startSession]);

  const renderSide = (playerState, side) => {
    const name = side === 1 ? p1Name : p2Name;
    const thinking = side === 1 ? player1Thinking : player2Thinking;
    const activity = side === 1 ? agentActivity1 : agentActivity2;
    return (
      <div className={`ms-side ms-side-${side}`}>
        <PlayerLabel
          name={name}
          thinking={thinking}
          activity={activity}
          className={side === 1 ? 'ms-label-p1' : 'ms-label-p2'}
        />
        <div className="ms-score">
          Score: {playerState?.score || 0}/{state?.safe_cells || 54}
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
                  {revealed && isMine && <PixelExplosion className="ms-boom" size={16} />}
                </div>
              );
            })
          )}
        </div>
        <div className="ms-steps">Steps: {playerState?.steps ?? 0}/{MAX_STEPS}</div>
      </div>
    );
  };

  const winnerLabel = () => {
    if (!state?.done) return null;
    const w = state.winner_side;
    if (w === 1) return p1Name;
    if (w === 2) return p2Name;
    return 'Draw';
  };

  const hasBoards = Boolean(state?.player1?.grid?.length);

  const statusText = state?.done
    ? `${winnerLabel()} wins!`
    : hasBoards
      ? `Race · ${state.player1?.score ?? 0} vs ${state.player2?.score ?? 0} safe cells`
      : 'Starting race…';

  return (
    <GameLayout
      gameName="Minesweeper Race"
      player1Name={p1Name}
      player2Name={p2Name}
      onBack={() => {
        stopLoopRef.current = true;
        abortRef.current?.abort();
        if (!gameFinishedRef.current) cancelBenchmarkRun(benchmarkRunIdRef.current);
        onBack();
      }}
      statusText={statusText}
      actionFeed={isRunning ? actionFeed : []}
    >
      {isCountdown && (
        <GameCountdown player1Name={p1Name} player2Name={p2Name} onComplete={handleCountdownComplete} />
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

      {hasBoards && (
        <div className="ms-split">
          {renderSide(state.player1, 1)}
          <div className="game-split-vs">VS</div>
          {renderSide(state.player2, 2)}
        </div>
      )}
    </GameLayout>
  );
};

export default MinesweeperGame;
