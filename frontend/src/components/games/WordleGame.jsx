import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import GameCountdown from '../common/GameCountdown';
import './wordle/Wordle.css';

const WordleGame = ({ player1Model: propPlayer1, player2Model: propPlayer2, onBack }) => {
  const navigate = useNavigate();
  const mountedRef = useRef(true);
  const abortRef = useRef(null);
  const [gameState, setGameState] = useState({
    player1: {
      guesses: [],
      feedback: [],
      reasoning: [],
      currentGuess: '',
      isThinking: false
    },
    player2: {
      guesses: [],
      feedback: [],
      reasoning: [],
      currentGuess: '',
      isThinking: false
    },
    gameOver: false,
    winner: null,
    secretWord: null,
    gameStarted: false
  });
  
  const [selectedWord, setSelectedWord] = useState('');
  const [gameId, setGameId] = useState(null);
  const [showStartModal, setShowStartModal] = useState(true);
  const [showCountdown, setShowCountdown] = useState(false);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);
  const storedPlayer1 = JSON.parse(sessionStorage.getItem('player1Model') || '{}');
  const storedPlayer2 = JSON.parse(sessionStorage.getItem('player2Model') || '{}');
  const player1Model = propPlayer1
    ? { id: propPlayer1, name: propPlayer1, provider: 'OpenAI' }
    : { id: storedPlayer1.id || 'gpt-5.5', name: storedPlayer1.name || 'GPT-5.5', provider: storedPlayer1.provider || 'OpenAI' };
  const player2Model = propPlayer2
    ? { id: propPlayer2, name: propPlayer2, provider: 'Anthropic' }
    : { id: storedPlayer2.id || 'claude-sonnet-4-6', name: storedPlayer2.name || 'Claude Sonnet 4.6', provider: storedPlayer2.provider || 'Anthropic' };

  const getApiBase = () => {
    const h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:8000' : `http://${h}:8000`;
  };
  const getWsBase = () => {
    const h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1') ? 'ws://localhost:8000' : `ws://${h}:8000`;
  };

  const wordList = [
    'CRANE', 'SLATE', 'AUDIO', 'HOUSE', 'ROUND',
    'TRAIN', 'LIGHT', 'BRAIN', 'CLOUD', 'PIANO',
    'BEACH', 'CHAIR', 'DANCE', 'EAGLE', 'FLAME',
    'GRAPE', 'HEART', 'IVORY', 'JOKER', 'KNIFE',
    'LEMON', 'MOUSE', 'NIGHT', 'OCEAN', 'PEACH',
    'QUEST', 'ROBIN', 'SNAKE', 'TIGER', 'ULTRA',
    'VOICE', 'WATER', 'YOUTH', 'ZEBRA', 'TESTS'
  ];

  const pendingGameRef = useRef(null);

  const startGame = async () => {
    const word = selectedWord || wordList[Math.floor(Math.random() * wordList.length)];
    
    try {
      const response = await fetch(`${getApiBase()}/api/wordle/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret_word: word })
      });
      
      if (response.ok) {
        const data = await response.json();
        setGameId(data.game_id);
        setShowStartModal(false);
        setGameState(prev => ({ ...prev, gameStarted: true, secretWord: word }));
        pendingGameRef.current = data.game_id;
        setShowCountdown(true);
      }
    } catch (error) {
      console.error('Error starting game:', error);
    }
  };

  const handleCountdownComplete = () => {
    setShowCountdown(false);
    const controller = new AbortController();
    abortRef.current = controller;
    setTimeout(() => runGameLoop(pendingGameRef.current, controller.signal), 300);
  };

  const runGameLoop = async (gid, signal) => {
    const models = ['openai', 'anthropic'];
    
    while (!signal.aborted) {
      const movePromises = models.map(model => makeGuess(gid, model, signal));
      const results = await Promise.allSettled(movePromises);
      
      if (signal.aborted) break;

      const gameOver = results.some(result => 
        result.status === 'fulfilled' && result.value && result.value.game_over
      );
      
      if (gameOver) {
        try {
          const stateResponse = await fetch(`${getApiBase()}/api/wordle/state/${gid}`, { signal });
          if (stateResponse.ok) {
            const finalState = await stateResponse.json();
            if (mountedRef.current) {
              setGameState(prev => ({
                ...prev,
                gameOver: true,
                winner: finalState.winner,
                secretWord: finalState.secret_word
              }));
            }
          }
        } catch (e) {
          if (e.name === 'AbortError') break;
        }
        break;
      }
      
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 1500);
        signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
  };

  const makeGuess = async (gid, model, signal) => {
    const playerKey = model === 'openai' ? 'player1' : 'player2';
    
    if (mountedRef.current) {
      setGameState(prev => ({
        ...prev,
        [playerKey]: { ...prev[playerKey], isThinking: true }
      }));
    }
    
    try {
      const response = await fetch(`${getApiBase()}/api/wordle/guess/${gid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
        signal,
      });
      
      if (response.ok) {
        const result = await response.json();
        
        if (!result.error && mountedRef.current) {
          setGameState(prev => ({
            ...prev,
            [playerKey]: {
              guesses: [...prev[playerKey].guesses, result.guess],
              feedback: [...prev[playerKey].feedback, result.feedback],
              reasoning: [...prev[playerKey].reasoning, result.reasoning],
              currentGuess: '',
              isThinking: false
            }
          }));
        }
        
        return result;
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error(`Error making guess for ${model}:`, error);
      if (mountedRef.current) {
        setGameState(prev => ({
          ...prev,
          [playerKey]: { ...prev[playerKey], isThinking: false }
        }));
      }
    }
  };

  const renderGrid = (player, playerKey) => {
    const guesses = gameState[playerKey].guesses;
    const feedback = gameState[playerKey].feedback;
    const isThinking = gameState[playerKey].isThinking;
    
    return (
      <div className="wordle-grid">
        {[...Array(6)].map((_, rowIndex) => (
          <div key={rowIndex} className="wordle-row">
            {[...Array(5)].map((_, colIndex) => {
              const guess = guesses[rowIndex];
              const letter = guess ? guess[colIndex] : '';
              const feedbackValue = feedback[rowIndex] ? feedback[rowIndex][colIndex] : '';
              
              let tileClass = 'wordle-tile';
              if (feedbackValue === 'green') tileClass += ' correct';
              else if (feedbackValue === 'yellow') tileClass += ' present';
              else if (feedbackValue === 'black') tileClass += ' absent';
              // Removed thinking animation to prevent moving rectangles
              
              return (
                <div key={colIndex} className={tileClass}>
                  {letter}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="wordle-container">
      {showCountdown && (
        <GameCountdown
          player1Name={player1Model.name}
          player2Name={player2Model.name}
          onComplete={handleCountdownComplete}
        />
      )}

      {/* Back Button */}
      <button 
        className="back-button"
        onClick={() => navigate('/games')}
      >
        ← Back to Games
      </button>

      {/* Start Modal */}
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
            <button onClick={startGame} className="start-button">
              Start Battle
            </button>
          </div>
        </div>
      )}

      {/* Game Content */}
      {gameState.gameStarted && (
        <div className="wordle-game">
          {/* Header */}
          <div className="wordle-header">
            <h1>WORDLE BATTLE</h1>
            <div className="secret-word-display" style={{
              fontSize: '1.5rem',
              letterSpacing: '0.5rem',
              fontWeight: 'bold',
              color: gameState.gameOver ? '#22c55e' : '#94a3b8',
              margin: '0.5rem 0'
            }}>
              {gameState.secretWord}
            </div>
            {gameState.gameOver && (
              <div className="game-result">
                <h2>{gameState.winner === 'openai' ? player1Model.name : gameState.winner === 'anthropic' ? player2Model.name : 'Nobody'} Wins!</h2>
              </div>
            )}
          </div>

          {/* Game Board */}
          <div className="wordle-board">
            {/* Player 1 Side */}
            <div className="player-section">
              <div className="player-header">
                <h2>{player1Model.name}</h2>
                <span className="provider">{player1Model.provider}</span>
              </div>
              {renderGrid(player1Model, 'player1')}
              <div className="guess-count">
                Guesses: {gameState.player1.guesses.length}/6
              </div>
            </div>

            {/* VS Divider */}
            <div className="vs-divider">
              <div className="vs-text">VS</div>
            </div>

            {/* Player 2 Side */}
            <div className="player-section">
              <div className="player-header">
                <h2>{player2Model.name}</h2>
                <span className="provider">{player2Model.provider}</span>
              </div>
              {renderGrid(player2Model, 'player2')}
              <div className="guess-count">
                Guesses: {gameState.player2.guesses.length}/6
              </div>
            </div>
          </div>

          {/* Play Again Button */}
          {gameState.gameOver && (
            <div className="play-again-container">
              <button 
                className="play-again-button"
                onClick={() => window.location.reload()}
              >
                Play Again
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default WordleGame; 