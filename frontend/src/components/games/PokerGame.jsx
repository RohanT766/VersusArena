import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import GameCountdown from '../common/GameCountdown';
import GameLayout from '../common/GameLayout';
import GameOverModal from '../common/GameOverModal';
import { getDisplayName } from '../../utils/modelUtils';
import { cancelBenchmarkRun, getBackendUrl } from '../../utils/networkUtils';
import { fetchUntilOk, wait } from '../../utils/silentRetry';
import useGameFlow from '../../hooks/useGameFlow';
import { formatAgentActivity } from '../../utils/agentActivity';
import PlayerThinking from '../common/PlayerThinking';
import PlayingCard from './poker/PlayingCard';
import DeckStack from './poker/DeckStack';
import ChipFly from './poker/ChipFly';
import ChipStacks from './ChipStacks';
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

function StreetChips({ rack, betRef }) {
  return (
    <div ref={betRef} className="pk-bet-slot">
      <ChipStacks inventory={rack} variant="street" />
    </div>
  );
}

function PlayerSeat({
  name,
  rack,
  cards,
  playerId,
  holeFaceDown,
  holeFlipIn,
  dealStep,
  position,
  highlight,
  thinking,
  thinkingActivity,
  isButton,
  blindRole,
  seatRef,
  rackRef,
  holeRef,
}) {
  const showBb = blindRole === 'BB';
  const showDealer = isButton;

  const head = (
    <div className="pk-seat-head">
      <div className="pk-seat-name-row">
        <span className="pk-seat-name">{name}</span>
        <div className="pk-seat-badges">
          {showBb && <span className="pk-blind-badge pk-blind-badge--bb">BB</span>}
          {showDealer && (
            <span className="pk-dealer-btn" title="Dealer (posts small blind in heads-up)">D</span>
          )}
          {blindRole === 'SB' && !isButton && (
            <span className="pk-blind-badge pk-blind-badge--sb">SB</span>
          )}
        </div>
      </div>
      <div className="pk-seat-status">
        <PlayerThinking active={thinking} activity={thinkingActivity} />
      </div>
    </div>
  );

  const balance = (
    <div ref={rackRef} className="pk-balance">
      <span className="pk-balance-label">
        Balance:
        {' '}
        {rackTotal(rack).toLocaleString()}
      </span>
      <ChipStacks inventory={rack} variant="seat" />
    </div>
  );

  const holeCards = (
    <div ref={holeRef} className="pk-cards-slot">
      {cards.map((c, i) => {
        const justDealt = dealStep?.player === playerId && dealStep?.card_index === i;
        return (
          <PlayingCard
            key={`${playerId}-${i}-${c}`}
            card={c}
            faceDown={holeFaceDown}
            size="lg"
            dealFromDeck={justDealt}
            seatSide={position}
            flipIn={holeFlipIn && !holeFaceDown}
            style={justDealt ? undefined : { animationDelay: `${i * 0.05}s` }}
          />
        );
      })}
    </div>
  );

  const isTop = position === 'top';

  return (
    <div ref={seatRef} className={`pk-seat pk-seat--${position} ${highlight ? 'pk-seat--active' : ''}`}>
      {isTop ? (
        <>
          {head}
          {balance}
          {holeCards}
        </>
      ) : (
        <>
          {balance}
          {head}
          {holeCards}
        </>
      )}
    </div>
  );
}

const PokerGame = ({ player1Model, player2Model, onBack = () => window.history.back() }) => {
  const [sessionId, setSessionId] = useState('');
  const [view, setView] = useState(null);
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
  const p1BetRef = useRef(null);
  const p2BetRef = useRef(null);
  const p1RackRef = useRef(null);
  const p2RackRef = useRef(null);
  const [holeRevealed, setHoleRevealed] = useState(false);
  const handNumRef = useRef(0);

  const p1Name = getDisplayName(player1Model);
  const p2Name = getDisplayName(player2Model);

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
    const signal = abortRef.current?.signal;
    stopLoopRef.current = false;
    while (!signal?.aborted) {
      const res = await fetchUntilOk(
        `${getBackendUrl()}/api/poker/start`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player1_model: player1Model, player2_model: player2Model }),
          signal,
        },
        { signal },
      );
      if (!res || signal?.aborted) return;
      if (!res.ok) {
        await wait(800);
        continue;
      }
      const data = await res.json();
      setSessionId(data.session_id);
      if (!isRecovery) benchmarkRunIdRef.current = data.benchmark_run_id || null;
      setView(data);
      if (!isRecovery) startCountdown();
      else startRunning();
      return;
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
      const signal = abortRef.current?.signal;
      let data = null;
      while (!signal?.aborted && !data) {
        try {
          const res = await fetch(`${getBackendUrl()}/api/poker/${sessionId}/step`, {
            method: 'POST',
            signal,
          });
          if (res.status === 404) {
            await startGame(true);
            return;
          }
          if (!res.ok) {
            await wait(900);
            continue;
          }
          data = await res.json();
        } catch (e) {
          if (e.name === 'AbortError') return;
          await wait(900);
        }
      }
      if (!data) return;

      const step = data.step || {};

      if (hasChipMove(step) && step.chips_moved) {
        setChipFly({
          player: step.player,
          chipsMoved: step.chips_moved,
          key: Date.now(),
        });
        await new Promise((r) => setTimeout(r, 720));
        setChipFly(null);
      }

      setView(data);

      if (data.done) {
        gameFinishedRef.current = true;
        setGameOverDismissed(false);
      }

      const pause = data.hand_complete ? STEP_DELAY.hand_complete : stepPause(step.type);
      await new Promise((r) => setTimeout(r, pause));
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
  const streetRacks = view?.street_chip_racks || { player1: {}, player2: {} };
  const potRack = view?.pot_rack;
  const holeComplete = holeP1.length >= 2 && holeP2.length >= 2;
  const dealStep = step?.type === 'deal_hole' ? step : null;
  const potAmount = rackTotal(potRack);

  useEffect(() => {
    const handNum = view?.hand_num ?? 0;
    if (handNum !== handNumRef.current) {
      handNumRef.current = handNum;
      setHoleRevealed(false);
    }
    if (!holeComplete) {
      setHoleRevealed(false);
      return undefined;
    }
    const t = setTimeout(() => setHoleRevealed(true), 420);
    return () => clearTimeout(t);
  }, [holeComplete, view?.hand_num]);
  const toAct = view?.to_act ?? step?.to_act;
  const button = view?.button;
  const sbPlayer = view?.sb_player ?? button;
  const bbPlayer = view?.bb_player ?? (button === 'player1' ? 'player2' : 'player1');
  const blindsLabel = `SB ${view?.small_blind ?? 10} / BB ${view?.big_blind ?? 20}`;

  const toolActivity = formatAgentActivity(view?.step);
  const phaseStreet = view?.street ? String(view.street).toUpperCase() : '';

  const actionFeed = useMemo(
    () => (view?.actions || []).map((a, i) => ({
      id: `pk-${i}-${a.player}-${a.action}`,
      side: a.player,
      verb: a.action,
      detail: a.amount ? String(a.amount) : '',
    })),
    [view?.actions],
  );

  return (
    <GameLayout
      gameName="Heads-Up Hold'em"
      player1Name={p1Name}
      player2Name={p2Name}
      onBack={() => {
        if (!gameFinishedRef.current) cancelBenchmarkRun(benchmarkRunIdRef.current);
        onBack();
      }}
      statusText={
        view?.done
          ? `${winnerLabel()} wins the tournament`
          : `Hand ${view?.hand_num || view?.hands_played || 0}/${view?.max_hands || 10} · Heads-up · ${blindsLabel}${phaseStreet ? ` · ${phaseStreet}` : ''}`
      }
      actionFeed={actionFeed}
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
            <div className="pk-table-stage">
            <div className="pk-table-rail">
              <div ref={feltRef} className="pk-table-felt">
                {chipFly && (
                  <ChipFly
                    key={chipFly.key}
                    player={chipFly.player}
                    chipsMoved={chipFly.chipsMoved}
                    feltEl={feltRef.current}
                    fromEl={chipFly.player === 'player1' ? p1RackRef.current : p2RackRef.current}
                    toEl={chipFly.player === 'player1' ? p1BetRef.current : p2BetRef.current}
                  />
                )}

                <div className="pk-felt-grid">
                <div className="pk-zone pk-zone--seat-top">
                <PlayerSeat
                  position="top"
                  playerId="player2"
                  name={p2Name}
                  rack={view.rack_p2}
                  cards={holeP2}
                  holeFaceDown={!holeRevealed}
                  holeFlipIn={holeRevealed}
                  dealStep={dealStep}
                  highlight={toAct === 'player2'}
                  thinking={stepBusy && toAct === 'player2'}
                  thinkingActivity={toolActivity}
                  isButton={button === 'player2'}
                  blindRole={sbPlayer === 'player2' ? 'SB' : bbPlayer === 'player2' ? 'BB' : null}
                  seatRef={p2SeatRef}
                  rackRef={p2RackRef}
                  holeRef={p2HoleRef}
                />
                </div>

                <div className="pk-zone pk-zone--bet-top">
                  <StreetChips rack={streetRacks.player2} betRef={p2BetRef} />
                </div>

                <div className="pk-zone pk-zone--pot">
                  <div id="pk-pot-anchor" ref={potRef} className="pk-pot-zone">
                    <div className="pk-pot-chips">
                      <ChipStacks inventory={potRack} variant="pot" />
                    </div>
                    <p className="pk-pot-label">
                      Pot:
                      {' '}
                      {potAmount > 0 ? potAmount.toLocaleString() : '0'}
                    </p>
                  </div>
                </div>

                <div className="pk-zone pk-zone--board">
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
                      {step.winner === 'player1' ? p1Name : p2Name} WINS
                    </p>
                  )}
                </div>

                <div className="pk-zone pk-zone--bet-bottom">
                  <StreetChips rack={streetRacks.player1} betRef={p1BetRef} />
                </div>

                <div className="pk-zone pk-zone--seat-bottom">
                <PlayerSeat
                  position="bottom"
                  playerId="player1"
                  name={p1Name}
                  rack={view.rack_p1}
                  cards={holeP1}
                  holeFaceDown={!holeRevealed}
                  holeFlipIn={holeRevealed}
                  dealStep={dealStep}
                  highlight={toAct === 'player1'}
                  thinking={stepBusy && toAct === 'player1'}
                  thinkingActivity={toolActivity}
                  isButton={button === 'player1'}
                  blindRole={sbPlayer === 'player1' ? 'SB' : bbPlayer === 'player1' ? 'BB' : null}
                  seatRef={p1SeatRef}
                  rackRef={p1RackRef}
                  holeRef={p1HoleRef}
                />
                </div>

                <div className="pk-zone pk-zone--deck">
                <DeckStack
                  active={stepBusy && (dealStep || step?.type === 'deal_board')}
                  count={Math.max(0, 52 - holeP1.length - holeP2.length - community.length)}
                />
                </div>
                </div>
              </div>
            </div>
            </div>
          </div>

        </div>
      )}
    </GameLayout>
  );
};

export default PokerGame;
