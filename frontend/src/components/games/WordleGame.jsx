import React, { useState, useEffect, useRef } from 'react';
import SidebarVote from '../SidebarVote';
import GameCountdown from '../common/GameCountdown';
import GameLayout from '../common/GameLayout';
import { getDisplayName } from '../../utils/modelUtils';
import './wordle/Wordle.css';

const getApiBase = () => {
  const h = window.location.hostname;
  return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:8000' : `http://${h}:8000`;
};

const WORD_LIST = [
  'CRANE', 'SLATE', 'AUDIO', 'HOUSE', 'ROUND',
  'TRAIN', 'LIGHT', 'BRAIN', 'CLOUD', 'PIANO',
  'BEACH', 'CHAIR', 'DANCE', 'EAGLE', 'FLAME',
  'GRAPE', 'HEART', 'IVORY', 'JOKER', 'KNIFE',
  'LEMON', 'MOUSE', 'NIGHT', 'OCEAN', 'PEACH',
  'QUEST', 'ROBIN', 'SNAKE', 'TIGER', 'ULTRA',
  'VOICE', 'WATER', 'YOUTH', 'ZEBRA', 'TESTS'
];

const WordleGame = ({ player1Model: propPlayer1, player2Model: propPlayer2, onBack }) => {
  const mountedRef = useRef(true);
  const abortRef = useRef(null);
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
  const [showStartModal, setShowStartModal] = useState(true);
  const [showVoting, setShowVoting] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortRef.current) abortRef.current.abort();
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
    const word = selectedWord || WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
    setErrorMsg(null);
    
    try {
      const response = await fetch(`${getApiBase()}/api/wordle/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret_word: word })
      });
      
      if (!response.ok) {
        setErrorMsg(`Backend error: ${response.status}`);
        return;
      }
      
      const data = await response.json();
      setGameId(data.game_id);
      setShowStartModal(false);
      setGameState(prev => ({ ...prev, gameStarted: true, secretWord: word }));
      pendingGameRef.current = data.game_id;
      setShowVoting(true);
    } catch (error) {
      setErrorMsg(`Cannot reach backend at ${getApiBase()}. Is the server running?`);
    }
  };

  const gameLoopRunning = useRef(false);

  const handleCountdownComplete = () => {
    setShowCountdown(false);
    const gid = pendingGameRef.current;
    if (!gid) return;
    const controller = new AbortController();
    abortRef.current = controller;
    gameLoopRunning.current = true;
    runGameLoop(gid, controller.signal);
  };

  // Recovery: if game started but loop died (e.g. HMR), restart it
  useEffect(() => {
    if (gameState.gameStarted && !showVoting && !showCountdown && !showStartModal
        && !gameState.gameOver && !gameLoopRunning.current && pendingGameRef.current) {
      const controller = new AbortController();
      abortRef.current = controller;
      gameLoopRunning.current = true;
      runGameLoop(pendingGameRef.current, controller.signal);
    }
  }, [gameState.gameStarted, showVoting, showCountdown, showStartModal, gameState.gameOver]);

  const runGameLoop = async (gid, signal) => {
    if (!gid) { gameLoopRunning.current = false; return; }

    for (let round = 0; round < 6; round++) {
      if (signal.aborted || !mountedRef.current) break;

      setGameState(prev => ({
        ...prev,
        player1: { ...prev.player1, isThinking: true },
        player2: { ...prev.player2, isThinking: true },
      }));

      const [r1, r2] = await Promise.all([
        fetchGuess(gid, 'openai', signal),
        fetchGuess(gid, 'anthropic', signal),
      ]);

      if (signal.aborted || !mountedRef.current) break;

      setGameState(prev => {
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
        try {
          const stateResponse = await fetch(`${getApiBase()}/api/wordle/state/${gid}`, { signal });
          if (stateResponse.ok && mountedRef.current) {
            const finalState = await stateResponse.json();
            setGameState(prev => ({
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

      await new Promise(resolve => {
        const timer = setTimeout(resolve, 1500);
        signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }

    gameLoopRunning.current = false;

    if (mountedRef.current) {
      setGameState(prev => {
        if (!prev.gameOver && prev.player1.guesses.length >= 6) {
          return { ...prev, gameOver: true, winner: null };
        }
        return prev;
      });
    }
  };

  const fetchGuess = async (gid, model, signal) => {
    try {
      const response = await fetch(`${getApiBase()}/api/wordle/guess/${gid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
        signal,
      });
      if (response.ok) return await response.json();
      return { error: true };
    } catch (error) {
      if (error.name === 'AbortError') return null;
      return { error: true };
    }
  };

  const renderGrid = (playerKey) => {
    const { guesses, feedback, isThinking } = gameState[playerKey];
    
    return (
      <div className="wordle-grid">
        {[...Array(6)].map((_, rowIndex) => (
          <div key={rowIndex} className="wordle-row">
            {[...Array(5)].map((_, colIndex) => {
              const guess = guesses[rowIndex];
              const letter = guess ? guess[colIndex] : '';
              const fb = feedback[rowIndex]?.[colIndex] || '';
              
              let cls = 'wordle-tile';
              if (fb === 'green') cls += ' correct';
              else if (fb === 'yellow') cls += ' present';
              else if (fb === 'black') cls += ' absent';
              else if (isThinking && rowIndex === guesses.length) cls += ' thinking';
              
              return <div key={colIndex} className={cls}>{letter}</div>;
            })}
          </div>
        ))}
      </div>
    );
  };

  const handleGoBack = () => {
    if (abortRef.current) abortRef.current.abort();
    if (onBack) onBack();
  };

  const statusText = gameState.gameOver
    ? `${gameState.winner === 'openai' ? player1.name : gameState.winner === 'anthropic' ? player2.name : 'Nobody'} Wins!  [${gameState.secretWord}]`
    : gameState.secretWord
    ? `SECRET WORD: ${gameState.secretWord}`
    : null;

  return (
    <GameLayout
      gameName="Wordle"
      player1Name={player1.name}
      player2Name={player2.name}
      onBack={handleGoBack}
      statusText={statusText}
    >
      {showCountdown && (
        <GameCountdown
          player1Name={player1.name}
          player2Name={player2.name}
          onComplete={handleCountdownComplete}
        />
      )}

      {showVoting && gameId && (
        <SidebarVote
          gameId={gameId}
          onGameStart={() => { setShowVoting(false); setShowCountdown(true); }}
          onBack={handleGoBack}
        />
      )}

      {showStartModal && (
        <div className="wordle-modal">
          <div className="wordle-modal-content">
            <h2>Start Wordle Battle</h2>
            <div className="word-selection">
              <p>Choose a word or let us pick randomly:</p>
              <input
                type="text"
                placeholder="Enter 5-letter word"
                value={selectedWord}
                onChange={(e) => setSelectedWord(e.target.value.toUpperCase().slice(0, 5))}
                maxLength={5}
              />
              <p className="word-hint">Leave empty for random word</p>
            </div>
            {errorMsg && (
              <p style={{ color: '#ef4444', fontSize: '18px', margin: '10px 0' }}>{errorMsg}</p>
            )}
            <button onClick={startGame} className="start-button">
              Start Battle
            </button>
          </div>
        </div>
      )}

      {gameState.gameStarted && !showVoting && !showCountdown && !showStartModal && (
        <div className="wordle-board" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '20px' }}>
          <div className="player-section">
            <div className="game-player-label" style={{ color: '#10b981' }}>
              {player1.name}
              {gameState.player1.isThinking && <span className="game-player-thinking">THINKING...</span>}
            </div>
            {renderGrid('player1')}
            <div className="guess-count">
              Guesses: {gameState.player1.guesses.length}/6
            </div>
          </div>

          <div className="game-split-vs">VS</div>

          <div className="player-section">
            <div className="game-player-label" style={{ color: '#a78bfa' }}>
              {player2.name}
              {gameState.player2.isThinking && <span className="game-player-thinking">THINKING...</span>}
            </div>
            {renderGrid('player2')}
            <div className="guess-count">
              Guesses: {gameState.player2.guesses.length}/6
            </div>
          </div>
        </div>
      )}

      {gameState.gameOver && (
        <div className="game-overlay">
          <div className="game-overlay-content">
            <h2 className="game-over-title">GAME OVER</h2>
            <div className="winner-name">
              {gameState.winner === 'openai' ? player1.name
                : gameState.winner === 'anthropic' ? player2.name
                : 'DRAW'}
              {gameState.winner && ' WINS!'}
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
            <button onClick={handleGoBack} className="new-game-overlay-button">BACK</button>
          </div>
        </div>
      )}
    </GameLayout>
  );
};

export default WordleGame;
