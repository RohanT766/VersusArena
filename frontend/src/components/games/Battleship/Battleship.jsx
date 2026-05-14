import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import GameCountdown from '../../common/GameCountdown';
import GameLayout from '../../common/GameLayout';
import { getDisplayName } from '../../../utils/modelUtils';
import useGameFlow from '../../../hooks/useGameFlow';
import './Battleship.css';

const SHIP_DEFS = {
  carrier:    { name: 'Carrier',    len: 5, color: '#6a7b8a' },
  battleship: { name: 'Battleship', len: 4, color: '#5a7a6a' },
  destroyer:  { name: 'Destroyer',  len: 3, color: '#7a8a9a' },
  submarine:  { name: 'Submarine',  len: 3, color: '#4a6a5a' },
  patrol:     { name: 'Patrol',     len: 2, color: '#8a8a7a' },
  cruiser:    { name: 'Cruiser',    len: 3, color: '#6a6a8a' },
  scout:      { name: 'Scout',      len: 2, color: '#7a7a6a' },
};

const BOARD_SIZE = 10;
const emptyBoard = (n) => Array(n).fill(null).map(() => Array(n).fill(null));

const GAME_STATUS = {
  WAITING: 'waiting',
  IN_PROGRESS: 'in_progress',
  FINISHED: 'finished',
  ERROR: 'error'
};

const Battleship = ({ player1Model, player2Model, onBack = () => window.history.back() }) => {
  const [boardSize, setBoardSize] = useState(BOARD_SIZE);
  const [gameId, setGameId] = useState('');
  const [gameStatus, setGameStatus] = useState(GAME_STATUS.WAITING);
  const [currentPlayer, setCurrentPlayer] = useState(1);
  const [player1Board, setPlayer1Board] = useState(() => emptyBoard(BOARD_SIZE));
  const [player2Board, setPlayer2Board] = useState(() => emptyBoard(BOARD_SIZE));
  const [player1Shots, setPlayer1Shots] = useState(() => emptyBoard(BOARD_SIZE));
  const [player2Shots, setPlayer2Shots] = useState(() => emptyBoard(BOARD_SIZE));
  const [message, setMessage] = useState('Starting game...');
  const [winner, setWinner] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const { isCountdown, isRunning, startCountdown, startRunning } = useGameFlow();
  const wsRef = useRef(null);
  const handlerRef = useRef(null);

  const getBackendModelName = (modelId) => modelId || 'gpt-5.5';
  const backendPlayer1 = getBackendModelName(player1Model);
  const backendPlayer2 = getBackendModelName(player2Model);


  const player1DisplayName = getDisplayName(player1Model);
  const player2DisplayName = getDisplayName(player2Model);

  const getShipStatus = (board, opponentShots) => {
    const ships = {};
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        const val = board[r][c];
        if (val) {
          if (!ships[val]) ships[val] = { cells: [], hits: 0 };
          const isHit = opponentShots[r][c] === 'hit';
          ships[val].cells.push({ r, c, hit: isHit });
          if (isHit) ships[val].hits++;
        }
      }
    }
    return ships;
  };

  const getColumnLabel = (index) => String.fromCharCode(65 + index);

  const p1Ships = useMemo(() => getShipStatus(player1Board, player2Shots), [player1Board, player2Shots, boardSize]);
  const p2Ships = useMemo(() => getShipStatus(player2Board, player1Shots), [player2Board, player1Shots, boardSize]);

  const countShots = (shots) => {
    let hits = 0, misses = 0;
    for (let r = 0; r < boardSize; r++)
      for (let c = 0; c < boardSize; c++) {
        if (shots[r][c] === 'hit') hits++;
        else if (shots[r][c] === 'miss') misses++;
      }
    return { hits, misses, total: hits + misses };
  };

  const p1ShotStats = useMemo(() => countShots(player1Shots), [player1Shots, boardSize]);
  const p2ShotStats = useMemo(() => countShots(player2Shots), [player2Shots, boardSize]);

  const getShipSegment = (board, row, col) => {
    const val = board[row][col];
    if (!val) return null;
    if (!SHIP_DEFS[val]) return 'single';
    const left  = col > 0 && board[row][col-1] === val;
    const right = col < boardSize-1 && board[row][col+1] === val;
    const up    = row > 0 && board[row-1][col] === val;
    const down  = row < boardSize-1 && board[row+1][col] === val;
    const horizontal = left || right;
    const vertical = up || down;
    if (horizontal) {
      if (!left && right) return 'h-bow';
      if (left && !right) return 'h-stern';
      return 'h-mid';
    }
    if (vertical) {
      if (!up && down) return 'v-bow';
      if (up && !down) return 'v-stern';
      return 'v-mid';
    }
    return 'single';
  };

  useEffect(() => {
    const newGameId = `battleship-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setGameId(newGameId);
    startCountdown();
    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  }, [startCountdown]);

  const connectWebSocket = (gid) => {
    try {
      const h = window.location.hostname;
      const wsHost = (h === 'localhost' || h === '127.0.0.1') ? 'localhost:8000' : `${h}:8000`;
      const ws = new WebSocket(`ws://${wsHost}/games/battleship/${gid}`);
      ws.onopen = () => {
        setIsConnected(true);
        setMessage('Connected! Setting up ships...');
        if (!gameStarted) {
          ws.send(JSON.stringify({
            type: 'start_game',
            player1Model: backendPlayer1,
            player2Model: backendPlayer2,
            board_size: 10,
            llm_placement: false,
          }));
          setGameStarted(true);
          setGameStatus(GAME_STATUS.IN_PROGRESS);
        }
      };
      ws.onmessage = (event) => { try { handlerRef.current(JSON.parse(event.data)); } catch(e) {} };
      ws.onerror = () => { setIsConnected(false); setupDemoGame(); };
      ws.onclose = () => { setIsConnected(false); if (!winner) setupDemoGame(); };
      wsRef.current = ws;
    } catch { setupDemoGame(); }
  };

  const setupDemoGame = () => {
    const sz = BOARD_SIZE;
    const b1 = emptyBoard(sz), b2 = emptyBoard(sz);
    for (let i = 0; i < 5; i++) b1[0][i] = 'carrier';
    for (let i = 0; i < 4; i++) b1[2][i] = 'battleship';
    for (let i = 0; i < 3; i++) b1[4][i] = 'cruiser';
    for (let i = 0; i < 3; i++) b1[i][6] = 'submarine';
    for (let i = 0; i < 2; i++) b1[6][i] = 'patrol';
    for (let i = 0; i < 5; i++) b2[1][i+1] = 'carrier';
    for (let i = 0; i < 4; i++) b2[3][i+2] = 'battleship';
    for (let i = 0; i < 3; i++) b2[5][i] = 'cruiser';
    for (let i = 0; i < 3; i++) b2[i+3][7] = 'submarine';
    for (let i = 0; i < 2; i++) b2[7][i+4] = 'patrol';
    setPlayer1Board(b1); setPlayer2Board(b2);
    setGameStatus(GAME_STATUS.IN_PROGRESS);
    setMessage('Demo mode - AI battle simulation');
    setTimeout(() => {
      const s1 = emptyBoard(sz), s2 = emptyBoard(sz);
      s1[1][1] = 'hit'; s1[3][3] = 'miss'; s1[1][2] = 'hit';
      s2[0][0] = 'hit'; s2[2][1] = 'miss'; s2[0][1] = 'hit';
      setPlayer1Shots(s1); setPlayer2Shots(s2);
      setMessage(`${player1DisplayName} and ${player2DisplayName} exchanging fire!`);
    }, 2000);
  };

  const handleGameStateUpdate = useCallback((data) => {
    if (data.type === 'placement_complete') {
      if (data.board_size) setBoardSize(Number(data.board_size));
      setPlayer1Board(data.player1Board); setPlayer2Board(data.player2Board);
      setMessage(data.message); setGameStatus(GAME_STATUS.IN_PROGRESS);
    } else if (data.type === 'game_state') {
      if (data.board_size) setBoardSize(Number(data.board_size));
      setCurrentPlayer(data.currentPlayer);
      if (data.player1Shots) setPlayer1Shots(data.player1Shots);
      if (data.player2Shots) setPlayer2Shots(data.player2Shots);
      if (data.player1Board) setPlayer1Board(data.player1Board);
      if (data.player2Board) setPlayer2Board(data.player2Board);
      if (data.status) setGameStatus(data.status);
      if (data.winner) setWinner(data.winner);
      if (data.message) setMessage(data.message);
    } else if (data.type === 'game_over') {
      setWinner(data.winner); setGameStatus(GAME_STATUS.FINISHED); setMessage(data.message);
    } else if (data.type === 'ship_placed') {
      if (data.player === 1) setPlayer1Board(data.board); else setPlayer2Board(data.board);
    }
  }, []);

  handlerRef.current = handleGameStateUpdate;

  const ShipSVG = ({ seg, color }) => {
    const c = color;
    const hi = '#9aa8b4';
    const dk = '#2a3a4a';
    const deck = '#3a4a5a';

    if (seg === 'h-bow') return (
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <polygon points="6,8 40,8 40,32 6,32 0,20" fill={c} />
        <polygon points="6,8 40,8 40,16 6,16 2,12" fill={hi} opacity="0.2" />
        <line x1="6" y1="20" x2="40" y2="20" stroke={dk} strokeWidth="1.5" />
        <rect x="20" y="14" width="6" height="4" rx="1" fill={deck} />
        <rect x="12" y="18" width="10" height="1" fill={dk} />
      </svg>
    );
    if (seg === 'h-mid') return (
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <rect x="0" y="8" width="40" height="24" fill={c} />
        <rect x="0" y="8" width="40" height="8" fill={hi} opacity="0.15" />
        <line x1="0" y1="20" x2="40" y2="20" stroke={dk} strokeWidth="1.5" />
        <rect x="14" y="11" width="12" height="8" rx="1" fill={deck} />
        <rect x="16" y="13" width="8" height="4" rx="1" fill={hi} opacity="0.2" />
        <rect x="8" y="26" width="4" height="3" rx="0.5" fill={deck} />
        <rect x="28" y="26" width="4" height="3" rx="0.5" fill={deck} />
      </svg>
    );
    if (seg === 'h-stern') return (
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <polygon points="0,8 34,8 40,14 40,26 34,32 0,32" fill={c} />
        <polygon points="0,8 34,8 40,14 40,12 34,12 0,12" fill={hi} opacity="0.2" />
        <line x1="0" y1="20" x2="36" y2="20" stroke={dk} strokeWidth="1.5" />
        <rect x="6" y="14" width="6" height="4" rx="1" fill={deck} />
      </svg>
    );
    if (seg === 'v-bow') return (
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <polygon points="8,6 32,6 32,40 8,40 8,6" fill={c} />
        <polygon points="20,0 32,6 32,40 8,40 8,6" fill={c} />
        <polygon points="20,0 32,6 32,14 8,14 8,6" fill={hi} opacity="0.2" />
        <line x1="20" y1="6" x2="20" y2="40" stroke={dk} strokeWidth="1.5" />
        <rect x="14" y="20" width="4" height="6" rx="1" fill={deck} />
        <rect x="18" y="12" width="1" height="10" fill={dk} />
      </svg>
    );
    if (seg === 'v-mid') return (
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <rect x="8" y="0" width="24" height="40" fill={c} />
        <rect x="8" y="0" width="8" height="40" fill={hi} opacity="0.15" />
        <line x1="20" y1="0" x2="20" y2="40" stroke={dk} strokeWidth="1.5" />
        <rect x="11" y="14" width="8" height="12" rx="1" fill={deck} />
        <rect x="13" y="16" width="4" height="8" rx="1" fill={hi} opacity="0.2" />
        <rect x="26" y="8" width="3" height="4" rx="0.5" fill={deck} />
        <rect x="26" y="28" width="3" height="4" rx="0.5" fill={deck} />
      </svg>
    );
    if (seg === 'v-stern') return (
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <polygon points="8,0 32,0 32,34 26,40 14,40 8,34" fill={c} />
        <polygon points="8,0 16,0 16,34 14,40 8,34" fill={hi} opacity="0.2" />
        <line x1="20" y1="0" x2="20" y2="36" stroke={dk} strokeWidth="1.5" />
        <rect x="14" y="6" width="4" height="6" rx="1" fill={deck} />
      </svg>
    );
    return (
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <ellipse cx="20" cy="20" rx="14" ry="14" fill={c} />
        <ellipse cx="20" cy="16" rx="14" ry="8" fill={hi} opacity="0.15" />
        <rect x="14" y="14" width="12" height="8" rx="2" fill={deck} />
        <rect x="16" y="16" width="8" height="4" rx="1" fill={hi} opacity="0.2" />
      </svg>
    );
  };

  const renderShipCell = (board, opponentShots, row, col) => {
    const val = board[row][col];
    const isHit = opponentShots[row][col] === 'hit';
    const isMiss = opponentShots[row][col] === 'miss';

    if (!val && isMiss) return <div className="cell-miss" />;
    if (!val) return null;

    const def = SHIP_DEFS[val] || { name: val, len: 1, color: '#888' };
    const seg = getShipSegment(board, row, col);

    return (
      <div className={`cell-ship-px ${isHit ? 'cell-ship-damaged' : ''}`}>
        <ShipSVG seg={seg} color={def.color} />
        {isHit && <div className="damage-overlay" />}
      </div>
    );
  };

  const renderBoard = (board, opponentShots) => (
    <div className="board-wrap">
      <table className="bs-table">
        <thead>
          <tr>
            <th className="corner"></th>
            {Array.from({ length: boardSize }, (_, i) => (
              <th key={i} className="col-lbl">{getColumnLabel(i)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: boardSize }, (_, row) => (
            <tr key={row}>
              <td className="row-lbl">{row + 1}</td>
              {Array.from({ length: boardSize }, (_, col) => (
                <td key={`${row}-${col}`} className="bs-cell">
                  {renderShipCell(board, opponentShots, row, col)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const FleetPanel = ({ ships }) => (
    <div className="fleet-panel">
      {Object.entries(SHIP_DEFS).map(([key, def]) => {
        const ship = ships[key];
        if (!ship) return null;
        const totalCells = ship.cells.length;
        const hitCount = ship.hits;
        const sunk = hitCount >= totalCells;
        return (
          <div key={key} className={`fleet-row ${sunk ? 'sunk' : ''}`}>
            <span className="fleet-name">{def.name}</span>
            <div className="fleet-pips">
              {Array.from({ length: totalCells }, (_, i) => (
                <div key={i} className={`pip ${i < hitCount ? 'pip-hit' : 'pip-ok'}`}
                  style={{ '--pip-color': def.color }} />
              ))}
            </div>
            {sunk && <span className="sunk-tag">SUNK</span>}
          </div>
        );
      })}
    </div>
  );

  const isP1Active = currentPlayer === 1 && !winner && gameStatus === GAME_STATUS.IN_PROGRESS;
  const isP2Active = currentPlayer === 2 && !winner && gameStatus === GAME_STATUS.IN_PROGRESS;

  const bsStatusText = winner
    ? `${winner === 1 ? player1DisplayName : player2DisplayName} Wins!`
    : message;

  return (
    <GameLayout
      gameName="Battleship"
      player1Name={player1DisplayName}
      player2Name={player2DisplayName}
      onBack={onBack}
      statusText={bsStatusText}
    >
      {isCountdown && (
        <GameCountdown player1Name={player1DisplayName} player2Name={player2DisplayName}
          onComplete={() => {
            if (!gameId) return;
            startRunning();
            connectWebSocket(gameId);
          }} />
      )}

      {winner && (
        <div className="bs-overlay">
          <div className="bs-overlay-box">
            <h2 className="bs-over-title">GAME OVER</h2>
            <div className="bs-winner">
              {winner === 1 ? player1DisplayName : player2DisplayName} WINS
            </div>
            <div className="bs-final-stats">
              <div className="bs-stat">
                <div className="bs-stat-name">{player1DisplayName}</div>
                <div className="bs-stat-val">{p1ShotStats.hits}/{p1ShotStats.total}</div>
              </div>
              <div className="bs-stat">
                <div className="bs-stat-name">{player2DisplayName}</div>
                <div className="bs-stat-val">{p2ShotStats.hits}/{p2ShotStats.total}</div>
              </div>
            </div>
            <button onClick={() => {
              if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
              onBack();
            }} className="bs-back-btn">Back to Arena</button>
          </div>
        </div>
      )}

      {isRunning && !isCountdown && (
        <div className="bs-main">
          <div className={`bs-side ${isP1Active ? 'side-active' : ''}`}>
            {isP1Active && <div className="firing-badge">FIRING</div>}
            {renderBoard(player1Board, player2Shots)}
            <FleetPanel ships={p1Ships} />
          </div>

          <div className="game-split-vs">VS</div>

          <div className={`bs-side ${isP2Active ? 'side-active' : ''}`}>
            {isP2Active && <div className="firing-badge">FIRING</div>}
            {renderBoard(player2Board, player1Shots)}
            <FleetPanel ships={p2Ships} />
          </div>
        </div>
      )}

      {isRunning && !isCountdown && !isConnected && (
        <div className="bs-demo-badge">DEMO MODE</div>
      )}
    </GameLayout>
  );
};

export default Battleship;
