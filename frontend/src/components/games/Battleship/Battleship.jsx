import React, { useState, useEffect, useRef, useMemo } from 'react';
import SidebarVote from '../../SidebarVote';
import GameTimer from '../../common/GameTimer';
import GameCountdown from '../../common/GameCountdown';
import './Battleship.css';

const BOARD_SIZE = 8;

const SHIP_DEFS = {
  carrier:    { name: 'Carrier',    len: 5, color: '#FF6B6B' },
  battleship: { name: 'Battleship', len: 4, color: '#4ECDC4' },
  destroyer:  { name: 'Destroyer',  len: 3, color: '#45B7D1' },
  submarine:  { name: 'Submarine',  len: 3, color: '#96CEB4' },
  patrol:     { name: 'Patrol',     len: 2, color: '#DDA0DD' },
};

const GAME_STATUS = {
  WAITING: 'waiting',
  IN_PROGRESS: 'in_progress',
  FINISHED: 'finished',
  ERROR: 'error'
};

const Battleship = ({ player1Model, player2Model, onBack = () => window.history.back() }) => {
  const [gameId, setGameId] = useState('');
  const [gameStatus, setGameStatus] = useState(GAME_STATUS.WAITING);
  const [currentPlayer, setCurrentPlayer] = useState(1);
  const [player1Board, setPlayer1Board] = useState(createEmptyBoard());
  const [player2Board, setPlayer2Board] = useState(createEmptyBoard());
  const [player1Shots, setPlayer1Shots] = useState(createEmptyBoard());
  const [player2Shots, setPlayer2Shots] = useState(createEmptyBoard());
  const [message, setMessage] = useState('Starting game...');
  const [winner, setWinner] = useState(null);
  const [gameStartTime, setGameStartTime] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);
  const [votingDone, setVotingDone] = useState(false);
  const wsRef = useRef(null);

  const getBackendModelName = (modelId) => modelId || 'gpt-5.5';
  const backendPlayer1 = getBackendModelName(player1Model);
  const backendPlayer2 = getBackendModelName(player2Model);

  const getDisplayName = (modelId) => {
    if (!modelId) return 'Unknown';
    const s = modelId.toString();
    if (s.includes('gpt-5.5')) return 'GPT-5.5';
    if (s.includes('gpt-5.4-mini')) return 'GPT-5.4 Mini';
    if (s.includes('gpt-4o')) return 'GPT-4o';
    if (s.includes('o4-mini')) return 'o4-mini';
    if (s.includes('claude-opus-4-7')) return 'Claude Opus 4.7';
    if (s.includes('claude-sonnet-4-6')) return 'Claude Sonnet 4.6';
    if (s.includes('claude-haiku-4-5')) return 'Claude Haiku 4.5';
    if (s.includes('claude-sonnet-4')) return 'Claude Sonnet 4';
    if (s.includes('gemini-3.1-pro')) return 'Gemini 3.1 Pro';
    if (s.includes('gemini-2.5-pro')) return 'Gemini 2.5 Pro';
    if (s.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const player1DisplayName = getDisplayName(player1Model);
  const player2DisplayName = getDisplayName(player2Model);

  function createEmptyBoard() {
    return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
  }

  const getColumnLabel = (index) => String.fromCharCode(65 + index);

  const getShipStatus = (board, opponentShots) => {
    const ships = {};
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const val = board[r][c];
        if (val && SHIP_DEFS[val]) {
          if (!ships[val]) ships[val] = { cells: [], hits: 0 };
          const isHit = opponentShots[r][c] === 'hit';
          ships[val].cells.push({ r, c, hit: isHit });
          if (isHit) ships[val].hits++;
        }
      }
    }
    return ships;
  };

  const p1Ships = useMemo(() => getShipStatus(player1Board, player2Shots), [player1Board, player2Shots]);
  const p2Ships = useMemo(() => getShipStatus(player2Board, player1Shots), [player2Board, player1Shots]);

  const countShots = (shots) => {
    let hits = 0, misses = 0;
    for (let r = 0; r < BOARD_SIZE; r++)
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (shots[r][c] === 'hit') hits++;
        else if (shots[r][c] === 'miss') misses++;
      }
    return { hits, misses, total: hits + misses };
  };

  const p1ShotStats = useMemo(() => countShots(player1Shots), [player1Shots]);
  const p2ShotStats = useMemo(() => countShots(player2Shots), [player2Shots]);

  const getShipSegment = (board, row, col) => {
    const val = board[row][col];
    if (!val || !SHIP_DEFS[val]) return null;
    const left  = col > 0 && board[row][col-1] === val;
    const right = col < BOARD_SIZE-1 && board[row][col+1] === val;
    const up    = row > 0 && board[row-1][col] === val;
    const down  = row < BOARD_SIZE-1 && board[row+1][col] === val;
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
    setGameStartTime(Date.now());
    connectWebSocket(newGameId);
    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  }, []);

  const connectWebSocket = (gid) => {
    try {
      const h = window.location.hostname;
      const wsHost = (h === 'localhost' || h === '127.0.0.1') ? 'localhost:8000' : `${h}:8000`;
      const ws = new WebSocket(`ws://${wsHost}/games/battleship/${gid}`);
      ws.onopen = () => {
        setIsConnected(true);
        setMessage('Connected! Setting up ships...');
        if (!gameStarted) {
          ws.send(JSON.stringify({ type: 'start_game', player1Model: backendPlayer1, player2Model: backendPlayer2, autoPlaceShips: true }));
          setGameStarted(true);
          setGameStatus(GAME_STATUS.IN_PROGRESS);
        }
      };
      ws.onmessage = (event) => { try { handleGameStateUpdate(JSON.parse(event.data)); } catch(e) {} };
      ws.onerror = () => { setIsConnected(false); setupDemoGame(); };
      ws.onclose = () => { setIsConnected(false); if (!winner) setupDemoGame(); };
      wsRef.current = ws;
    } catch { setupDemoGame(); }
  };

  const setupDemoGame = () => {
    const b1 = createEmptyBoard(), b2 = createEmptyBoard();
    for (let i = 0; i < 5; i++) b1[0][i] = 'carrier';
    for (let i = 0; i < 4; i++) b1[2][i] = 'battleship';
    for (let i = 0; i < 3; i++) b1[4][i] = 'destroyer';
    for (let i = 0; i < 3; i++) b1[i][6] = 'submarine';
    for (let i = 0; i < 2; i++) b1[6][i] = 'patrol';
    for (let i = 0; i < 5; i++) b2[1][i+1] = 'carrier';
    for (let i = 0; i < 4; i++) b2[3][i+2] = 'battleship';
    for (let i = 0; i < 3; i++) b2[5][i] = 'destroyer';
    for (let i = 0; i < 3; i++) b2[i+3][7] = 'submarine';
    for (let i = 0; i < 2; i++) b2[7][i+4] = 'patrol';
    setPlayer1Board(b1); setPlayer2Board(b2);
    setGameStatus(GAME_STATUS.IN_PROGRESS);
    setMessage('Demo mode - AI battle simulation');
    setTimeout(() => {
      const s1 = createEmptyBoard(), s2 = createEmptyBoard();
      s1[1][1] = 'hit'; s1[3][3] = 'miss'; s1[1][2] = 'hit';
      s2[0][0] = 'hit'; s2[2][1] = 'miss'; s2[0][1] = 'hit';
      setPlayer1Shots(s1); setPlayer2Shots(s2);
      setMessage(`${player1DisplayName} and ${player2DisplayName} exchanging fire!`);
    }, 2000);
  };

  const handleGameStateUpdate = (data) => {
    if (data.type === 'placement_complete') {
      setPlayer1Board(data.player1Board); setPlayer2Board(data.player2Board);
      setMessage(data.message); setGameStatus(GAME_STATUS.IN_PROGRESS);
    } else if (data.type === 'game_state') {
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
  };

  const renderShipCell = (board, opponentShots, row, col) => {
    const val = board[row][col];
    const isHit = opponentShots[row][col] === 'hit';
    const isMiss = opponentShots[row][col] === 'miss';

    if (!val && isMiss) return <div className="cell-miss">~</div>;
    if (!val) return null;

    const def = SHIP_DEFS[val];
    if (!def) return null;
    const seg = getShipSegment(board, row, col);

    return (
      <div className={`cell-ship-px ${isHit ? 'cell-ship-damaged' : ''}`} style={{ '--ship-color': def.color }}>
        <div className={`ship-seg ship-seg-${seg}`} />
        {isHit && <div className="damage-overlay">X</div>}
      </div>
    );
  };

  const renderBoard = (board, opponentShots) => (
    <div className="board-wrap">
      <table className="bs-table">
        <thead>
          <tr>
            <th className="corner"></th>
            {Array.from({ length: BOARD_SIZE }, (_, i) => (
              <th key={i} className="col-lbl">{getColumnLabel(i)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: BOARD_SIZE }, (_, row) => (
            <tr key={row}>
              <td className="row-lbl">{row + 1}</td>
              {Array.from({ length: BOARD_SIZE }, (_, col) => (
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
        const totalCells = ship ? ship.cells.length : def.len;
        const hitCount = ship ? ship.hits : 0;
        const sunk = ship && hitCount >= totalCells;
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

  return (
    <div className="bs-game">
      {showCountdown && (
        <GameCountdown player1Name={player1DisplayName} player2Name={player2DisplayName}
          onComplete={() => setShowCountdown(false)} />
      )}

      <SidebarVote gameId={gameId}
        gameName={`Battleship: ${player1DisplayName} vs ${player2DisplayName}`}
        onGameStart={() => { setVotingDone(true); setShowCountdown(true); }} />

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
            }} className="bs-back-btn">BACK TO MENU</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bs-header">
        <button className="bs-menu-btn" onClick={onBack}>BACK</button>

        <div className={`bs-player-tag ${isP1Active ? 'tag-active' : ''}`}>
          {isP1Active && <span className="tag-dot" />}
          {player1DisplayName}
          <span className="tag-shots">{p1ShotStats.hits}/{p1ShotStats.total}</span>
        </div>

        <div className="bs-timer-wrap">
          <GameTimer isActive={gameStatus === GAME_STATUS.IN_PROGRESS && !winner} />
        </div>

        <div className={`bs-player-tag ${isP2Active ? 'tag-active' : ''}`}>
          {isP2Active && <span className="tag-dot" />}
          {player2DisplayName}
          <span className="tag-shots">{p2ShotStats.hits}/{p2ShotStats.total}</span>
        </div>
      </div>

      {/* Status message */}
      <div className="bs-status">{message}</div>

      {/* Main boards */}
      <div className="bs-main">
        <div className={`bs-side ${isP1Active ? 'side-active' : ''}`}>
          {isP1Active && <div className="firing-badge">FIRING</div>}
          {renderBoard(player1Board, player2Shots)}
          <FleetPanel ships={p1Ships} />
        </div>

        <div className="bs-vs">VS</div>

        <div className={`bs-side ${isP2Active ? 'side-active' : ''}`}>
          {isP2Active && <div className="firing-badge">FIRING</div>}
          {renderBoard(player2Board, player1Shots)}
          <FleetPanel ships={p2Ships} />
        </div>
      </div>

      {!isConnected && (
        <div className="bs-demo-badge">DEMO MODE</div>
      )}
    </div>
  );
};

export default Battleship;
