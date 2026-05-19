import React, { useState, useEffect, useRef, useCallback } from 'react';
import GameCountdown from '../common/GameCountdown';
import GameLayout from '../common/GameLayout';
import GameOverModal from '../common/GameOverModal';
import { getDisplayName } from '../../utils/modelUtils';
import { cancelBenchmarkRun } from '../../utils/networkUtils';
import useGameFlow from '../../hooks/useGameFlow';
import { formatAgentActivity, agentThinkingLabel } from '../../utils/agentActivity';
import PlayingCard from './poker/PlayingCard';
import DeckStack from './poker/DeckStack';
import ChipFly from './poker/ChipFly';
import StackDisplay from './poker/StackDisplay';
import { rackTotal } from '../../utils/chipUtils';
import './PokerGame.css';

const STEP_DELAY = {
  deal_hole: 520,
  post_blind: 720,
  action: 950,
  deal_board: 580,
  showdown: 2800,
  hand_complete: 1200,
  default: 400,
};

function stepPause(type) {
  return STEP_DELAY[type] ?? STEP_DELAY.default;
}

function hasChipMove(step) {
  return step && (step.type === 'post_blind' || (step.type === 'action' && step.amount > 0));
}

function PlayerSeat({
  name,
  rack,
  cards,
  faceDown,
  position,
  highlight,
  isButton,
  streetBet,
  seatRef,
  holeRef,
}) {
  return (
    <div ref={seatRef} className={`pk-seat pk-seat--${position} ${highlight ? 'pk-seat--active' : ''}`}>
      <div className="pk-seat-meta">
        <span className="pk-seat-name">{name}</span>
        {isButton && <span className="pk-dealer-btn" title="Dealer">D</span>}
      </div>
      <div className="pk-seat-body">
        <StackDisplay inventory={rack} variant="seat" />
        <div ref={holeRef} className="pk-hole-anchor">
          {cards.length > 0
            ? cards.map((c, i) => (
                <PlayingCard
                  key={`${c}-${i}`}
                  card={c}
                  faceDown={faceDown}
                  size="lg"
                  deal
                  style={{ animationDelay: `${i * 0.08}s` }}
                />
              ))
            : (
              <>
                <PlayingCard faceDown size="lg" />
                <PlayingCard faceDown size="lg" />
              </>
            )}
        </div>
        {streetBet > 0 && (
          <div className="pk-bet-pile">
            <span className="pk-bet-pile-amt">{streetBet}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const PokerGame = ({ player1Model, player2Model, onBack = () => window.history.back() }) => {
  const [sessionId, setSessionId] = useState('');
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [stepBusy, setStepBusy] = useState(false);
  const [chipFly, setChipFly] = useState(null);
  const [gameOverDismissed, setGameOverDismissed] = useState(false);
  const { isCountdown, isRunning, startCountdown, startRunning } = useGameFlow();
  const benchmarkRunIdRef = useRef(null);
  const gameFinishedRef = useRef(false);
  const abortRef = useRef(null);
  const stopLoopRef = useRef(false);
  const steppingRef = useRef(false);
  const feltRef = useRef(null);
  const potRef = useRef(null);
  const p1SeatRef = useRef(null);
  const p2SeatRef = useRef(null);
  const p1HoleRef = useRef(null);
  const p2HoleRef = useRef(null);

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
      const res = await fetch(`${getApiBase()}/api/poker/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player1_model: player1Model, player2_model: player2Model }),
        signal: abortRef.current?.signal,
      });
      if (!res.ok) throw new Error(`Could not start (${res.status})`);
      const data = await res.json();
      setSessionId(data.session_id);
      if (!isRecovery) benchmarkRunIdRef.current = data.benchmark_run_id || null;
      setView(data);
      if (!isRecovery) startCountdown();
      else startRunning();
    } catch (e) {
      if (e.name !== 'AbortError') {
        stopLoopRef.current = true;
        setError(e.message);
      }
    }
  }, [player1Model, player2Model, startCountdown, startRunning]);

  useEffect(() => {
    startGame(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runStep = useCallback(async () => {
    if (!sessionId || stepBusy || stopLoopRef.current || steppingRef.current) return;
    if (view?.done) return;

    steppingRef.current = true;
    setStepBusy(true);
    try {
      const res = await fetch(`${getApiBase()}/api/poker/${sessionId}/step`, {
        method: 'POST',
        signal: abortRef.current?.signal,
      });
      if (res.status === 404) {
        setError('Session lost (server restarted). Starting fresh…');
        await startGame(true);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const detail = body.detail || `HTTP ${res.status}`;
        throw new Error(typeof detail === 'string' ? detail : 'Step failed');
      }
      const data = await res.json();
      const step = data.step || {};

      if (hasChipMove(step)) {
        setChipFly({ from: step.player, amount: step.amount, key: Date.now() });
        await new Promise((r) => setTimeout(r, 680));
        setChipFly(null);
      }

      setView(data);
      setError(null);

      if (data.done) {
        gameFinishedRef.current = true;
        setGameOverDismissed(false);
      }

      const pause = data.hand_complete ? STEP_DELAY.hand_complete : stepPause(step.type);
      await new Promise((r) => setTimeout(r, pause));
    } catch (e) {
      if (e.name !== 'AbortError') {
        stopLoopRef.current = true;
        setError(e.message);
      }
    } finally {
      setStepBusy(false);
      steppingRef.current = false;
    }
  }, [sessionId, stepBusy, view?.done, startGame]);

  useEffect(() => {
    if (!isRunning || isCountdown || !view || view.done || stopLoopRef.current) return;
    if (stepBusy || steppingRef.current) return;
    const t = setTimeout(runStep, 300);
    return () => clearTimeout(t);
  }, [isRunning, isCountdown, view, stepBusy, runStep]);

  const winnerLabel = () => {
    if (!view?.done) return null;
    if (view.winner_side === 1) return p1Name;
    if (view.winner_side === 2) return p2Name;
    return 'Draw';
  };

  const step = view?.step;
  const holeP1 = view?.hole_p1 || [];
  const holeP2 = view?.hole_p2 || [];
  const community = view?.community || [];
  const streetBets = view?.street_bets || {};
  const showFaces = step?.type === 'showdown' || view?.last_hand?.winner;
  const toAct = view?.to_act ?? step?.to_act;
  const button = view?.button;
  const potTotal = view?.pot ?? rackTotal(view?.pot_rack);

  const toolActivity = formatAgentActivity(view?.step);
  const statusDetail = stepBusy
    ? agentThinkingLabel(stepBusy, toolActivity) || (toAct
      ? `${toAct === 'player1' ? p1Name : p2Name} to act`
      : 'Dealing…')
    : step?.type === 'action'
      ? `${step.player === 'player1' ? p1Name : p2Name} ${step.action}${step.amount ? ` ${step.amount}` : ''}`
      : step?.type === 'post_blind'
        ? `${step.blind} ${step.amount || ''}`
        : step?.type === 'showdown' && step.winner
          ? `${step.winner === 'player1' ? p1Name : p2Name} wins`
          : view?.street || '';

  return (
    <GameLayout
      gameName="Poker Showdown"
      player1Name={p1Name}
      player2Name={p2Name}
      onBack={() => {
        if (!gameFinishedRef.current) cancelBenchmarkRun(benchmarkRunIdRef.current);
        onBack();
      }}
      statusText={
        view?.done
          ? `${winnerLabel()} wins the tournament`
          : `Hand ${view?.hand_num || view?.hands_played || 0}/${view?.max_hands || 10}${statusDetail ? ` · ${statusDetail}` : ''}`
      }
    >
      {isCountdown && <GameCountdown player1Name={p1Name} player2Name={p2Name} onComplete={startRunning} />}

      <GameOverModal
        open={Boolean(view?.done && !gameOverDismissed)}
        onClose={() => setGameOverDismissed(true)}
        title="TOURNAMENT OVER"
        actions={<button type="button" className="new-game-overlay-button" onClick={onBack}>Back to Arena</button>}
      >
        <div className="winner-name">{winnerLabel()} WINS!</div>
        <div className="pk-final">
          <span>{p1Name}: {view?.chips_p1?.toLocaleString()}</span>
          <span>{p2Name}: {view?.chips_p2?.toLocaleString()}</span>
        </div>
      </GameOverModal>

      {isRunning && !isCountdown && view && (
        <div className="pk-arena">
          <div className="pk-table-outer">
            <div className="pk-table-rail">
              <div ref={feltRef} className="pk-table-felt">
                {chipFly && (
                  <ChipFly
                    key={chipFly.key}
                    from={chipFly.from}
                    amount={chipFly.amount}
                    feltEl={feltRef.current}
                    fromEl={chipFly.from === 'player1' ? p1HoleRef.current : p2HoleRef.current}
                    toEl={potRef.current}
                  />
                )}

                <PlayerSeat
                  position="top"
                  name={p2Name}
                  rack={view.rack_p2}
                  cards={holeP2}
                  faceDown={!showFaces}
                  highlight={toAct === 'player2'}
                  isButton={button === 'player2'}
                  streetBet={streetBets.player2 || 0}
                  seatRef={p2SeatRef}
                  holeRef={p2HoleRef}
                />

                <div className="pk-mid">
                  <div id="pk-pot-anchor" ref={potRef} className="pk-pot">
                    <span className="pk-pot-title">Pot</span>
                    <span className="pk-pot-amt">{potTotal > 0 ? potTotal.toLocaleString() : '—'}</span>
                    {potTotal > 0 && (
                      <div className="pk-pot-chips" aria-hidden="true">
                        <span className="pk-pot-chip" />
                        <span className="pk-pot-chip" />
                      </div>
                    )}
                  </div>
                  <div className="pk-board">
                    {community.length > 0
                      ? community.map((c, i) => (
                          <PlayingCard
                            key={`${c}-${i}`}
                            card={c}
                            size="board"
                            deal={step?.type === 'deal_board' && i === community.length - 1}
                          />
                        ))
                      : [0, 1, 2, 3, 4].map((i) => <div key={i} className="pk-board-slot" />)}
                  </div>
                  {step?.type === 'showdown' && step.winner && (
                    <p className="pk-winner-line">
                      {step.winner === 'player1' ? p1Name : p2Name} wins
                    </p>
                  )}
                </div>

                <DeckStack
                  active={stepBusy}
                  count={Math.max(0, 52 - holeP1.length - holeP2.length - community.length)}
                />

                <PlayerSeat
                  position="bottom"
                  name={p1Name}
                  rack={view.rack_p1}
                  cards={holeP1}
                  faceDown={!showFaces}
                  highlight={toAct === 'player1'}
                  isButton={button === 'player1'}
                  streetBet={streetBets.player1 || 0}
                  seatRef={p1SeatRef}
                  holeRef={p1HoleRef}
                />
              </div>
            </div>
          </div>

          {(view.actions || []).length > 0 && (
            <div className="pk-action-bar">
              {(view.actions || []).slice(-6).map((a, i) => (
                <span key={i} className="pk-action-item">
                  <strong>{a.player === 'player1' ? p1Name : p2Name}</strong>
                  {' '}{a.action}{a.amount ? ` ${a.amount}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {error && <p className="pk-error">{error}</p>}
    </GameLayout>
  );
};

export default PokerGame;
