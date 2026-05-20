import React, { useState, useEffect, useRef, useMemo } from 'react';
import GameCountdown from '../common/GameCountdown';
import GameLayout from '../common/GameLayout';
import GameOverModal from '../common/GameOverModal';
import { getDisplayName } from '../../utils/modelUtils';
import { cancelBenchmarkRun, getBackendUrl } from '../../utils/networkUtils';
import { fetchUntilOk, wait } from '../../utils/silentRetry';
import useGameFlow from '../../hooks/useGameFlow';
import PlayerLabel from '../common/PlayerLabel';
import './wordle/Wordle.css';

const getApiBase = () => {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' ? 'http://localhost:8000' : `http://${h}:8000`;
};

const WORD_LIST = [
  'CRANE', 'SLATE', 'AUDIO', 'HOUSE', 'ROUND',
  'TRAIN', 'LIGHT', 'BRAIN', 'CLOUD', 'PIANO',
  'BEACH', 'CHAIR', 'DANCE', 'EAGLE', 'FLAME',
  'GRAPE', 'HEART', 'IVORY', 'JOKER', 'KNIFE',
  'LEMON', 'MOUSE', 'NIGHT', 'OCEAN', 'PEACH',
  'QUEST', 'ROBIN', 'SNAKE', 'TIGER', 'ULTRA',
  'VOICE', 'WATER', 'YOUTH', 'ZEBRA', 'TESTS',
];

const WordleGame = ({ player1Model: propPlayer1, player2Model: propPlayer2, onBack }) => {
  const mountedRef = useRef(true);
  const abortRef = useRef(null);
  const [wordLength, setWordLength] = useState(5);
  const [hardMode, setHardMode] = useState(false);
  const [gameState, setGameState] = useState({
    player1: { guesses: [], feedback: [], reasoning: [], isThinking: false },
    player2: { guesses: [], feedback: [], reasoning: [], isThinking: false },
    gameOver: false,
    winner: null,
    secretWord: null,
    gameStarted: false,
  });

  const [selectedWord, setSelectedWord] = useState('');
  const [gameId, setGameId] = useState(null);
  const benchmarkRunIdRef = useRef(null);
  const gameFinishedRef = useRef(false);
  const [gameOverDismissed, setGameOverDismissed] = useState(false);
  const { isSetup, isCountdown, isRunning, goToSetup, startCountdown, startRunning } = useGameFlow();
  useEffect(() => {
    mountedRef.current = true;
    const handleUnload = () => {
      if (!gameFinishedRef.current) cancelBenchmarkRun(benchmarkRunIdRef.current);
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      mountedRef.current = false;
      if (abortRef.current) abortRef.current.abort();
      if (!gameFinishedRef.current) cancelBenchmarkRun(benchmarkRunIdRef.current);
    };
  }, []);

  const storedPlayer1 = JSON.parse(sessionStorage.getItem('player1Model') || '{}');
  const storedPlayer2 = JSON.parse(sessionStorage.getItem('player2Model') || '{}');
  const player1 = propPlayer1
    ? { id: propPlayer1, name: getDisplayName(propPlayer1) }
    : { id: storedPlayer1.id || 'gpt-5.5', name: storedPlayer1.name || getDisplayName('gpt-5.5') };
  const player2 = propPlayer2
    ? { id: propPlayer2, name: getDisplayName(propPlayer2) }
    : { id: storedPlayer2.id || 'claude-sonnet-4-6', name: storedPlayer2.name || getDisplayName('claude-sonnet-4-6') };

  const pendingGameRef = useRef(null);

  const startGame = async () => {
    const word = (selectedWord || WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)]).toUpperCase();

    while (mountedRef.current) {
      const response = await fetchUntilOk(`${getBackendUrl()}/api/wordle/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret_word: word.length === wordLength ? word : undefined,
          player1_model: player1.id,
          player2_model: player2.id,
          word_length: wordLength,
          hard_mode: hardMode,
        }),
      });
      if (!response || !mountedRef.current) return;
      if (!response.ok) {
        await wait(800);
        continue;
      }

      const data = await response.json();
      setGameId(data.game_id);
      benchmarkRunIdRef.current = data.benchmark_run_id || null;
      const wl = data.word_length || wordLength;
      setWordLength(wl);
      const displaySecret =
        word.length === wl && word ? word : Array.from({ length: wl }).map(() => '?').join('');
      setGameState((prev) => ({ ...prev, gameStarted: true, secretWord: displaySecret }));
      pendingGameRef.current = data.game_id;
      startCountdown();
      return;
    }
  };

  const gameLoopRunning = useRef(false);

  const handleCountdownComplete = () => {
    startRunning();
    const gid = pendingGameRef.current;
    if (!gid) return;
    const controller = new AbortController();
    abortRef.current = controller;
    gameLoopRunning.current = true;
    runGameLoop(gid, controller.signal);
  };

  useEffect(() => {
    if (
      gameState.gameStarted &&
      isRunning &&
      !gameState.gameOver &&
      !gameLoopRunning.current &&
      pendingGameRef.current
    ) {
      const controller = new AbortController();
      abortRef.current = controller;
      gameLoopRunning.current = true;
      runGameLoop(pendingGameRef.current, controller.signal);
    }
  }, [gameState.gameStarted, isRunning, gameState.gameOver]);

  const runGameLoop = async (gid, signal) => {
    if (!gid) {
      gameLoopRunning.current = false;
      return;
    }

    for (let round = 0; round < 6; round++) {
      if (signal.aborted || !mountedRef.current) break;

      setGameState((prev) => ({
        ...prev,
        player1: { ...prev.player1, isThinking: true },
        player2: { ...prev.player2, isThinking: true },
      }));

      const [r1, r2] = await Promise.all([
        fetchGuess(gid, 'player1', signal),
        fetchGuess(gid, 'player2', signal),
      ]);

      if (signal.aborted || !mountedRef.current) break;

      setGameState((prev) => {
        const next = { ...prev };
        if (r1 && !r1.error) {
          next.player1 = {
            guesses: [...prev.player1.guesses, r1.guess],
            feedback: [...prev.player1.feedback, r1.feedback],
            reasoning: [...prev.player1.reasoning, r1.reasoning],
            isThinking: false,
          };
        } else {
          next.player1 = { ...prev.player1, isThinking: false };
        }
        if (r2 && !r2.error) {
          next.player2 = {
            guesses: [...prev.player2.guesses, r2.guess],
            feedback: [...prev.player2.feedback, r2.feedback],
            reasoning: [...prev.player2.reasoning, r2.reasoning],
            isThinking: false,
          };
        } else {
          next.player2 = { ...prev.player2, isThinking: false };
        }
        return next;
      });

      const gameOver = (r1 && r1.game_over) || (r2 && r2.game_over);
      if (gameOver) {
        gameFinishedRef.current = true;
        setGameOverDismissed(false);
        try {
          const stateResponse = await fetch(`${getApiBase()}/api/wordle/state/${gid}`, { signal });
          if (stateResponse.ok && mountedRef.current) {
            const finalState = await stateResponse.json();
            setGameState((prev) => ({
              ...prev,
              gameOver: true,
              winner: finalState.winner,
              secretWord: finalState.secret_word || prev.secretWord,
            }));
          }
        } catch (e) {
          if (e.name === 'AbortError') break;
        }
        break;
      }

      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1500);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });
    }

    gameLoopRunning.current = false;

    if (mountedRef.current) {
      setGameState((prev) => {
        if (!prev.gameOver && prev.player1.guesses.length >= 6 && prev.player2.guesses.length >= 6) {
          gameFinishedRef.current = true;
          return { ...prev, gameOver: true, winner: prev.winner };
        }
        return prev;
      });
    }
  };

  const fetchGuess = async (gid, side, signal) => {
    while (!signal.aborted && mountedRef.current) {
      try {
        const response = await fetch(`${getBackendUrl()}/api/wordle/guess/${gid}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ side }),
          signal,
        });
        if (response.ok) return await response.json();
        await wait(900);
      } catch (error) {
        if (error.name === 'AbortError') return null;
        await wait(900);
      }
    }
    return null;
  };

  const renderGrid = (playerKey) => {
    const { guesses, feedback, isThinking } = gameState[playerKey];

    return (
      <div className="wordle-grid">
        {[...Array(6)].map((_, rowIndex) => (
          <div key={rowIndex} className="wordle-row">
            {[...Array(wordLength)].map((_, colIndex) => {
              const guess = guesses[rowIndex];
              const letter = guess ? guess[colIndex] : '';
              const fb = feedback[rowIndex]?.[colIndex] || '';

              let cls = 'wordle-tile';
              if (fb === 'green') cls += ' correct';
              else if (fb === 'yellow') cls += ' present';
              else if (fb === 'black') cls += ' absent';
              else if (isThinking && rowIndex === guesses.length) cls += ' thinking';

              return (
                <div key={colIndex} className={cls}>
                  {letter}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const handleGoBack = () => {
    if (abortRef.current) abortRef.current.abort();
    if (!gameFinishedRef.current) {
      cancelBenchmarkRun(benchmarkRunIdRef.current);
    }
    if (onBack) onBack();
  };

  const winnerLabel = () => {
    const w = gameState.winner;
    if (w === 'player1') return player1.name;
    if (w === 'player2') return player2.name;
    if (w === 'TIE') return 'Tie';
    return 'Nobody';
  };

  const statusText = gameState.gameOver
    ? `${winnerLabel()} wins!  [${gameState.secretWord}]`
    : `Round ${Math.max(gameState.player1.guesses.length, gameState.player2.guesses.length) + 1} · ${wordLength} letters${hardMode ? ' · hard' : ''}`;

  const actionFeed = useMemo(() => {
    const items = [];
    const n = Math.max(gameState.player1.guesses.length, gameState.player2.guesses.length);
    if (n === 0) return items;
    const i = n - 1;
    if (gameState.player1.guesses[i]) {
      items.push({
        id: `w1-${i}-${gameState.player1.guesses[i]}`,
        side: 'player1',
        verb: 'guessed',
        detail: gameState.player1.guesses[i],
      });
    }
    if (gameState.player2.guesses[i]) {
      items.push({
        id: `w2-${i}-${gameState.player2.guesses[i]}`,
        side: 'player2',
        verb: 'guessed',
        detail: gameState.player2.guesses[i],
      });
    }
    return items;
  }, [gameState.player1.guesses, gameState.player2.guesses]);

  return (
    <GameLayout
      gameName="Wordle"
      player1Name={player1.name}
      player2Name={player2.name}
      onBack={handleGoBack}
      statusText={statusText}
      actionFeed={actionFeed}
    >
      {isCountdown && (
        <GameCountdown
          player1Name={player1.name}
          player2Name={player2.name}
          onComplete={handleCountdownComplete}
        />
      )}

      {isSetup && (
        <div className="wordle-modal">
          <div className="wordle-modal-content">
            <h2>Start Wordle Battle</h2>
            <div className="word-selection">
              <p>Word length</p>
              <select value={wordLength} onChange={(e) => setWordLength(Number(e.target.value))} style={{ marginBottom: 8 }}>
                {[5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} letters
                  </option>
                ))}
              </select>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <input type="checkbox" checked={hardMode} onChange={(e) => setHardMode(e.target.checked)} /> Hard mode
              </label>
              <p>Choose a word or leave empty for random:</p>
              <input
                type="text"
                placeholder={`${wordLength}-letter word`}
                value={selectedWord}
                onChange={(e) => setSelectedWord(e.target.value.toUpperCase().slice(0, wordLength))}
                maxLength={wordLength}
              />
              <p className="word-hint">Models: {player1.id} vs {player2.id}</p>
            </div>
            <button onClick={startGame} className="start-button">
              Start Match
            </button>
          </div>
        </div>
      )}

      {gameState.gameStarted && isRunning && (
        <div
          className="wordle-board"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '20px' }}
        >
          <div className="player-section">
            <PlayerLabel
              name={player1.name}
              thinking={gameState.player1.isThinking}
              className="wordle-label-p1"
            />
            {renderGrid('player1')}
            <div className="guess-count">Guesses: {gameState.player1.guesses.length}/6</div>
          </div>

          <div className="game-split-vs">VS</div>

          <div className="player-section">
            <PlayerLabel
              name={player2.name}
              thinking={gameState.player2.isThinking}
              className="wordle-label-p2"
            />
            {renderGrid('player2')}
            <div className="guess-count">Guesses: {gameState.player2.guesses.length}/6</div>
          </div>
        </div>
      )}

      <GameOverModal
        open={gameState.gameOver && !gameOverDismissed}
        onClose={() => setGameOverDismissed(true)}
        actions={
          <>
            <button type="button" onClick={handleGoBack} className="new-game-overlay-button">Back to Arena</button>
            <button
              type="button"
              onClick={() => {
                if (abortRef.current) abortRef.current.abort();
                setGameState({
                  player1: { guesses: [], feedback: [], reasoning: [], isThinking: false },
                  player2: { guesses: [], feedback: [], reasoning: [], isThinking: false },
                  gameOver: false,
                  winner: null,
                  secretWord: null,
                  gameStarted: false,
                });
                setSelectedWord('');
                setGameId(null);
                pendingGameRef.current = null;
                setGameOverDismissed(true);
                goToSetup();
              }}
              className="new-game-overlay-button"
              style={{ marginTop: 10 }}
            >
              Play again
            </button>
          </>
        }
      >
        <div className="winner-name">
          {winnerLabel()}
          {gameState.winner && ' '}
          {gameState.winner && gameState.winner !== 'TIE' && 'WINS!'}
          {gameState.winner === 'TIE' && 'TIE'}
        </div>
        <div className="wordle-final-word">
          SECRET WORD: <strong>{gameState.secretWord}</strong>
        </div>
        <div className="conn-final-stats">
          <div className="conn-final-stat">
            <div className="conn-final-name" style={{ color: '#10b981' }}>{player1.name}</div>
            <div>{gameState.player1.guesses.length} guesses</div>
          </div>
          <div className="conn-final-stat">
            <div className="conn-final-name" style={{ color: '#a78bfa' }}>{player2.name}</div>
            <div>{gameState.player2.guesses.length} guesses</div>
          </div>
        </div>
      </GameOverModal>
    </GameLayout>
  );
};

export default WordleGame;
