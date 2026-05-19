import React, { useState, useEffect, useRef } from 'react';
import GameCountdown from '../common/GameCountdown';
import GameLayout from '../common/GameLayout';
import GameOverModal from '../common/GameOverModal';
import { getDisplayName } from '../../utils/modelUtils';
import { cancelBenchmarkRun } from '../../utils/networkUtils';
import useGameFlow from '../../hooks/useGameFlow';
import './ConnectionsGame.css';

const MAX_INCORRECT = 15;

const ConnectionsGame = ({ player1Model, player2Model, onBack = () => window.history.back() }) => {
  const [gameId, setGameId] = useState('');
  const [player1State, setPlayer1State] = useState(null);
  const [player2State, setPlayer2State] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [player1Processing, setPlayer1Processing] = useState(false);
  const [player2Processing, setPlayer2Processing] = useState(false);
  const [ws, setWs] = useState(null);
  const { isCountdown, isRunning, startCountdown, startRunning, goToSetup } = useGameFlow();
  const abortRef = React.useRef(null);
  const benchmarkRunIdRef = useRef(null);
  const gameFinishedRef = useRef(false);
  const [gameOverDismissed, setGameOverDismissed] = useState(false);

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

  const p1Name = getDisplayName(player1Model);
  const p2Name = getDisplayName(player2Model);

  const getApiBase = () => {
    const h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:8000' : `http://${h}:8000`;
  };

  const startNewGame = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${getApiBase()}/api/connections/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player1_model: player1Model, player2_model: player2Model }),
        signal: abortRef.current?.signal,
      });
      
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      
      const data = await response.json();
      setGameId(data.game_id);
      benchmarkRunIdRef.current = data.benchmark_run_id || null;
      const stateRes = await fetch(`${getApiBase()}/api/connections/game/${data.game_id}/state`, {
        signal: abortRef.current?.signal,
      });
      if (stateRes.ok) {
        const stateData = await stateRes.json();
        setPlayer1State(stateData.player1_state || null);
        setPlayer2State(stateData.player2_state || null);
      } else {
        setPlayer1State(null);
        setPlayer2State(null);
      }
      setLoading(false);
      setError(null);
      startCountdown();
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    startNewGame();
    return () => { if (ws) ws.close(); };
  }, []);

  useEffect(() => {
    if (!gameId) return;
    
    const h = window.location.hostname;
    const wsHost = (h === 'localhost' || h === '127.0.0.1') ? 'localhost:8000' : `${h}:8000`;
    
    try {
      const websocket = new WebSocket(`ws://${wsHost}/games/connections/${gameId}`);
      
      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'game_update' && data.data) {
            const { player, game_state } = data.data;
            if (player === 1) {
              setPlayer1State(game_state);
              setPlayer1Processing(false);
            } else if (player === 2) {
              setPlayer2State(game_state);
              setPlayer2Processing(false);
            }
          }
        } catch (_) {}
      };
      
      websocket.onerror = () => {};
      setWs(websocket);
      
      return () => websocket.close();
    } catch (_) {}
  }, [gameId]);

  const processAITurn = async (player) => {
    if (!gameId) return;
    
    const state = player === 1 ? player1State : player2State;
    if (state?.game_over) return;
    if (state && state.incorrect_guesses.length >= MAX_INCORRECT) return;

    if (player === 1) setPlayer1Processing(true);
    else setPlayer2Processing(true);

    try {
      const response = await fetch(`${getApiBase()}/api/connections/game/${gameId}/player/${player}/ai-turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal: abortRef.current?.signal,
      });

      if (!response.ok) throw new Error('API error');
      await response.json();
    } catch (error) {
      if (player === 1) setPlayer1Processing(false);
      else setPlayer2Processing(false);
    }
  };

  const p1Done = player1State && (player1State.game_over || player1State.found_groups.length === 4 || player1State.incorrect_guesses.length >= MAX_INCORRECT);
  const p2Done = player2State && (player2State.game_over || player2State.found_groups.length === 4 || player2State.incorrect_guesses.length >= MAX_INCORRECT);
  const bothDone = p1Done && p2Done;

  useEffect(() => {
    if (bothDone) setGameOverDismissed(false);
  }, [bothDone]);

  useEffect(() => {
    if (bothDone) gameFinishedRef.current = true;
  }, [bothDone]);

  useEffect(() => {
    if (!bothDone || !gameId) return;
    fetch(`${getApiBase()}/api/connections/game/${gameId}/finalize`, { method: 'POST' }).catch(() => {});
  }, [bothDone, gameId]);

  const getWinner = () => {
    if (!player1State || !player2State) return null;
    const p1Groups = player1State.found_groups.length;
    const p2Groups = player2State.found_groups.length;
    if (p1Groups > p2Groups) return p1Name;
    if (p2Groups > p1Groups) return p2Name;
    const p1Wrong = player1State.incorrect_guesses.length;
    const p2Wrong = player2State.incorrect_guesses.length;
    if (p1Wrong < p2Wrong) return p1Name;
    if (p2Wrong < p1Wrong) return p2Name;
    return null;
  };

  useEffect(() => {
    if (!isRunning || isCountdown) return;
    if (player1State && !p1Done && !player1Processing) {
      const timer = setTimeout(() => processAITurn(1), 1000);
      return () => clearTimeout(timer);
    }
  }, [player1State, player1Processing, p1Done, isCountdown, isRunning]);

  useEffect(() => {
    if (!isRunning || isCountdown) return;
    if (player2State && !p2Done && !player2Processing) {
      const timer = setTimeout(() => processAITurn(2), 1500);
      return () => clearTimeout(timer);
    }
  }, [player2State, player2Processing, p2Done, isCountdown, isRunning]);

  const getLevelColor = (level) => {
    const colors = ['#f9df6d', '#a0c35a', '#b0c4ef', '#ba81c5'];
    return colors[level] || '#999';
  };

  const statusText = loading ? 'Loading...'
    : bothDone ? `${getWinner() ? getWinner() + ' Wins!' : 'Draw!'}`
    : player1State ? `Puzzle #${player1State.puzzle_id} - ${player1State.date}` : null;

  const renderPlayerBoard = (state, processing, playerDone) => (
    <div className="conn-player-side">
      <div className="conn-status-bar">
        {processing && <span className="game-player-thinking">Agents using tools…</span>}
        {playerDone && !processing && <span className="conn-done-tag">Done</span>}
        <div className="conn-stats">
          <span>Groups: <strong>{state.found_groups.length}/4</strong></span>
          <span>Wrong: <strong style={{ color: state.incorrect_guesses.length >= MAX_INCORRECT ? '#ef4444' : '#888' }}>{state.incorrect_guesses.length}/{MAX_INCORRECT}</strong></span>
        </div>
      </div>

      {state.found_groups.length > 0 && (
        <div className="conn-found-groups">
          {state.found_groups.map((group, i) => (
            <div key={i} className="conn-found-group" style={{ backgroundColor: getLevelColor(group.level) }}>
              <div className="conn-group-name">{group.group_name}</div>
              <div className="conn-group-words">{group.words.join(', ')}</div>
            </div>
          ))}
        </div>
      )}

      {state.remaining_words.length > 0 && !state.game_over && (
        <div className="conn-words-grid">
          {state.remaining_words.map((word, i) => (
            <div key={i} className="conn-word-tile">{word}</div>
          ))}
        </div>
      )}

      {state.incorrect_guesses.length > 0 && (
        <div className="conn-guesses-scroll">
          <h4 className="conn-guesses-title">Incorrect Guesses:</h4>
          {state.incorrect_guesses.map((guess, i) => (
            <div key={i} className="conn-guess-item">{guess.join(', ')}</div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <GameLayout
      gameName="Connections"
      player1Name={p1Name}
      player2Name={p2Name}
      onBack={() => {
        if (!bothDone) cancelBenchmarkRun(benchmarkRunIdRef.current);
        onBack();
      }}
      statusText={statusText}
    >
      {isCountdown && (
        <GameCountdown
          player1Name={p1Name}
          player2Name={p2Name}
          onComplete={startRunning}
        />
      )}

      <GameOverModal
        open={bothDone && !gameOverDismissed}
        onClose={() => setGameOverDismissed(true)}
        actions={
          <>
            <button type="button" onClick={() => { goToSetup(); startNewGame(); }} className="new-game-overlay-button">Play again</button>
            <button type="button" onClick={onBack} className="new-game-overlay-button">Back to Arena</button>
          </>
        }
      >
        <div className="winner-name">
          {getWinner() ? `${getWinner()} WINS!` : 'DRAW!'}
        </div>
        <div className="conn-final-stats">
          <div className="conn-final-stat">
            <div className="conn-final-name" style={{ color: '#10b981' }}>{p1Name}</div>
            <div>{player1State?.found_groups?.length} groups / {player1State?.incorrect_guesses?.length} wrong</div>
          </div>
          <div className="conn-final-stat">
            <div className="conn-final-name" style={{ color: '#a78bfa' }}>{p2Name}</div>
            <div>{player2State?.found_groups?.length} groups / {player2State?.incorrect_guesses?.length} wrong</div>
          </div>
        </div>
      </GameOverModal>

      {isRunning && !isCountdown && player1State && player2State ? (
        <div className="connections-split-view">
          {renderPlayerBoard(player1State, player1Processing, p1Done)}
          <div className="game-split-vs">VS</div>
          {renderPlayerBoard(player2State, player2Processing, p2Done)}
        </div>
      ) : isRunning && !isCountdown ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '1.5rem' }}>
          {loading ? 'Loading...' : 'Failed to load game.'}
        </div>
      ) : null}
    </GameLayout>
  );
};

export default ConnectionsGame;
