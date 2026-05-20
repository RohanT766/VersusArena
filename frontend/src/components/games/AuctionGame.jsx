import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import GameCountdown from '../common/GameCountdown';
import GameLayout from '../common/GameLayout';
import GameOverModal from '../common/GameOverModal';
import { getDisplayName } from '../../utils/modelUtils';
import { cancelBenchmarkRun, getBackendUrl } from '../../utils/networkUtils';
import { fetchUntilOk, wait } from '../../utils/silentRetry';
import useGameFlow from '../../hooks/useGameFlow';
import { formatAgentActivity } from '../../utils/agentActivity';
import { arenaPlayerLabel } from '../../utils/arenaStatus';
import PlayerThinking from '../common/PlayerThinking';
import './AuctionGame.css';

const AuctionGame = ({ player1Model, player2Model, onBack = () => window.history.back() }) => {
  const [sessionId, setSessionId] = useState('');
  const [state, setState] = useState(null);
  const [settledFlash, setSettledFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const [agentActivity, setAgentActivity] = useState(null);
  const [gameOverDismissed, setGameOverDismissed] = useState(false);
  const { isCountdown, isRunning, startCountdown, startRunning } = useGameFlow();
  const benchmarkRunIdRef = useRef(null);
  const gameFinishedRef = useRef(false);
  const abortRef = useRef(null);
  const stopLoopRef = useRef(false);
  const steppingRef = useRef(false);

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

  const startGame = async () => {
    const signal = abortRef.current?.signal;
    while (!signal?.aborted) {
      const res = await fetchUntilOk(
        `${getBackendUrl()}/api/auction/start`,
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
      benchmarkRunIdRef.current = data.benchmark_run_id || null;
      setState(data);
      startCountdown();
      return;
    }
  };

  useEffect(() => {
    startGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runStep = useCallback(async () => {
    if (!sessionId || steppingRef.current || stopLoopRef.current || state?.done) return;

    steppingRef.current = true;
    setBusy(true);
    setAgentActivity(null);
    try {
      const signal = abortRef.current?.signal;
      let data = null;
      while (!signal?.aborted && !data) {
        try {
          const res = await fetch(`${getBackendUrl()}/api/auction/${sessionId}/step`, {
            method: 'POST',
            signal,
          });
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

      setAgentActivity(formatAgentActivity(step));
      setState(data);

      if (step.type === 'item_settled') {
        setSettledFlash(step);
      }

      if (data.done) {
        gameFinishedRef.current = true;
        setGameOverDismissed(false);
      }

      const pause = step.type === 'item_settled' ? 2200 : step.type === 'item_start' ? 600 : 900;
      await new Promise((r) => setTimeout(r, pause));
    } finally {
      setBusy(false);
      steppingRef.current = false;
    }
  }, [sessionId, state?.done]);

  useEffect(() => {
    if (!isRunning || isCountdown || !state || state.done || stopLoopRef.current) return;
    if (busy || steppingRef.current) return;
    const t = setTimeout(runStep, 400);
    return () => clearTimeout(t);
  }, [isRunning, isCountdown, state, busy, runStep]);

  useEffect(() => {
    if (!settledFlash || busy) return;
    const t = setTimeout(() => setSettledFlash(null), 100);
    return () => clearTimeout(t);
  }, [settledFlash, busy]);

  const winnerLabel = () => {
    if (!state?.done) return null;
    if (state.winner_side === 1) return p1Name;
    if (state.winner_side === 2) return p2Name;
    return 'Draw';
  };

  const live = state?.live;
  const step = state?.step;
  const showReveal = settledFlash && !live;
  const curItem = live || settledFlash || state?.current_item;
  const bidLog = live?.bid_log || settledFlash?.bid_log || [];
  const toAct = live?.to_act;
  const highBid = live?.high_bid ?? settledFlash?.bid_p1 ?? 0;
  const highBidder = live?.high_bidder ?? settledFlash?.winner;

  const playerLabel = (side) => arenaPlayerLabel(side, p1Name, p2Name);

  const actionFeed = useMemo(
    () => bidLog.map((e, i) => ({
      id: `auc-${i}-${e.player}-${e.action}`,
      side: e.player,
      verb: e.action === 'pass' ? 'passes' : 'bids',
      detail: e.action === 'pass' ? '' : String(e.amount ?? ''),
    })),
    [bidLog],
  );

  return (
    <GameLayout
      gameName="Auction Blitz"
      player1Name={p1Name}
      player2Name={p2Name}
      onBack={() => {
        stopLoopRef.current = true;
        if (!gameFinishedRef.current) cancelBenchmarkRun(benchmarkRunIdRef.current);
        onBack();
      }}
      statusText={
        state?.done
          ? `${winnerLabel()} wins!`
          : `Item ${(state?.rounds_completed ?? 0) + (live ? 1 : 0)}/${state?.total_rounds ?? 8}`
      }
      actionFeed={actionFeed}
    >
      {isCountdown && <GameCountdown player1Name={p1Name} player2Name={p2Name} onComplete={startRunning} />}

      <GameOverModal
        open={Boolean(state?.done && !gameOverDismissed)}
        onClose={() => setGameOverDismissed(false)}
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
            <div className={`auc-player auc-p1 ${toAct === 'player1' ? 'auc-player--active' : ''}`}>
              <div className="auc-name">{p1Name}</div>
              <div className="auc-stat">Budget: <strong>{state.budget_p1}</strong></div>
              <div className="auc-stat">Won: <strong>{state.value_p1}</strong> pts</div>
              <PlayerThinking active={toAct === 'player1' && busy} activity={agentActivity} />
            </div>
            <div className={`auc-player auc-p2 ${toAct === 'player2' ? 'auc-player--active' : ''}`}>
              <div className="auc-name">{p2Name}</div>
              <div className="auc-stat">Budget: <strong>{state.budget_p2}</strong></div>
              <div className="auc-stat">Won: <strong>{state.value_p2}</strong> pts</div>
              <PlayerThinking active={toAct === 'player2' && busy} activity={agentActivity} />
            </div>
          </div>

          <div className="auc-center">
            {curItem && !showReveal && (
              <div className="auc-item-card">
                <p className="auc-round-tag">
                  Round {curItem.round || live?.round || settledFlash?.round} / {state.total_rounds}
                </p>
                <h3>{curItem.item_name || curItem.item}</h3>
                <p className="auc-hint">{curItem.hint}</p>
                {live && (
                  <p className="auc-high">
                    High bid: {live.high_bid || '—'}
                    {live.high_bidder ? ` (${playerLabel(live.high_bidder)})` : ''}
                  </p>
                )}
              </div>
            )}

            {bidLog.length > 0 && (
              <div className="auc-log">
                <div className="auc-log-title">Live bids</div>
                <ul className="auc-log-list">
                  {bidLog.map((e, i) => (
                    <li
                      key={i}
                      className={`auc-log-entry auc-log-entry--${e.player} auc-log-entry--${e.action}`}
                    >
                      <span className="auc-log-who">{playerLabel(e.player)}</span>
                      {e.action === 'pass' ? (
                        <span className="auc-log-action">PASS</span>
                      ) : (
                        <span className="auc-log-action">bid {e.amount}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {showReveal && settledFlash && (
              <div className="auc-reveal auc-reveal-pop">
                <h3>{settledFlash.item}</h3>
                <p className="auc-true-value">True value: {settledFlash.value}</p>
                <div className="auc-bids">
                  <span>{p1Name}: {settledFlash.bid_p1}</span>
                  <span>{p2Name}: {settledFlash.bid_p2}</span>
                </div>
                <p className="auc-round-winner">
                  {settledFlash.winner
                    ? `${playerLabel(settledFlash.winner)} wins for ${settledFlash.winner === 'player1' ? settledFlash.bid_p1 : settledFlash.bid_p2}!`
                    : 'No winner — everyone passed'}
                </p>
              </div>
            )}

          </div>

          {(state.history || []).length > 0 && (
            <div className="auc-history">
              <div className="auc-history-title">Completed items</div>
              <div className="auc-history-items">
                {state.history.slice(-4).map((h) => (
                  <span key={h.round} className="auc-history-chip">
                    R{h.round}: {h.item} ({h.value}pts)
                    {h.winner ? ` → ${playerLabel(h.winner)}` : ' → tie'}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </GameLayout>
  );
};

export default AuctionGame;
