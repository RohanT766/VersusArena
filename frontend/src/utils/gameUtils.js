// Common utilities for all games

export const MODELS = {
  GEMINI: 'GEMINI',
  ANTHROPIC: 'ANTHROPIC',
  OPENAI: 'OPENAI',
  CUSTOM: 'CUSTOM UPLOAD'
};

export const GAME_STATUS = {
  WAITING: 'waiting',
  IN_PROGRESS: 'in_progress',
  PAUSED: 'paused',
  FINISHED: 'finished'
};

// WebSocket connection helper
export const createGameWebSocket = (gameType, gameId) => {
  const hostname = window.location.hostname;
  const host = (hostname === 'localhost' || hostname === '127.0.0.1')
    ? 'localhost:8000'
    : `${hostname}:8000`;
  const wsUrl = `ws://${host}/games/${gameType}/${gameId}`;
  return new WebSocket(wsUrl);
};

// Format player info
export const formatPlayer = (model, playerNumber) => ({
  id: playerNumber,
  model: model,
  name: `Player ${playerNumber} (${model})`,
  score: 0
});

// Common game messages
export const GAME_MESSAGES = {
  WAITING_FOR_MOVE: 'Waiting for move...',
  INVALID_MOVE: 'Invalid move! Try again.',
  GAME_OVER: 'Game Over!',
  YOUR_TURN: 'Your turn!',
  OPPONENT_TURN: "Opponent's turn..."
}; 