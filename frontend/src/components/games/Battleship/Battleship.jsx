import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import GameCountdown from '../../common/GameCountdown';
import GameLayout from '../../common/GameLayout';
import GameOverModal from '../../common/GameOverModal';
import { getDisplayName } from '../../../utils/modelUtils';
import { cancelBenchmarkRun } from '../../../utils/networkUtils';
import useGameFlow from '../../../hooks/useGameFlow';
import PlayerLabel from '../../common/PlayerLabel';
import './Battleship.css';
import { ShipSegmentSprite, FLEET_HULL_COLOR } from './ShipSprites';
import { ShotEffect } from './ShotEffect';

const SHIP_DEFS = {
  carrier:    { name: 'Carrier',    len: 5 },
  battleship: { name: 'Battleship', len: 4 },
  destroyer:  { name: 'Destroyer',  len: 3 },
  submarine:  { name: 'Submarine',  len: 3 },
  patrol:     { name: 'Patrol',     len: 2 },
  cruiser:    { name: 'Cruiser',    len: 3 },
  scout:      { name: 'Scout',      len: 2 },
};

function findNewShot(prev, next, size) {
  if (!prev || !next) return null;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const n = next[r]?.[c];
      if ((n === 'hit' || n === 'miss') && !prev[r]?.[c]) {
        return { row: r, col: c, result: n };
      }
    }
  }
  return null;
}

function cloneShots(shots, size) {
  return shots?.map((row) => [...row]) ?? emptyBoard(size);
}

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
  const [actionFeed, setActionFeed] = useState([]);
  const [winner, setWinner] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const { isCountdown, isRunning, startCountdown, startRunning } = useGameFlow();
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const handlerRef = useRef(null);
  const benchmarkRunIdRef = useRef(null);
  const gameFinishedRef = useRef(false);
  const [gameOverDismissed, setGameOverDismissed] = useState(false);
  const [revealedP1Shots, setRevealedP1Shots] = useState(() => emptyBoard(BOARD_SIZE));
  const [revealedP2Shots, setRevealedP2Shots] = useState(() => emptyBoard(BOARD_SIZE));
  const [activeShotAnim, setActiveShotAnim] = useState(null);
  const prevShotsRef = useRef({ p1: null, p2: null });
  const shotsInitRef = useRef(false);

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
    const handleUnload = () => {
      if (!gameFinishedRef.current) cancelBenchmarkRun(benchmarkRunIdRef.current);
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (!gameFinishedRef.current) cancelBenchmarkRun(benchmarkRunIdRef.current);
    };
  }, [startCountdown]);

  const connectWebSocket = useCallback((gid) => {
    const retryLater = () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (gameFinishedRef.current) return;
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (!gameFinishedRef.current) connectWebSocket(gid);
      }, 1500);
    };
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    try {
      const h = window.location.hostname;
      const wsHost = (h === 'localhost' || h === '127.0.0.1') ? 'localhost:8000' : `${h}:8000`;
      const ws = new WebSocket(`ws://${wsHost}/games/battleship/${gid}`);
      ws.onopen = () => {
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
      ws.onmessage = (event) => { try { handlerRef.current(JSON.parse(event.data)); } catch (e) { /* ignore */ } };
      ws.onerror = () => {
        setMessage('Connection lost — retrying…');
      };
      ws.onclose = () => {
        wsRef.current = null;
        retryLater();
      };
      wsRef.current = ws;
    } catch {
      setMessage('Could not connect — retrying…');
      retryLater();
    }
  }, [backendPlayer1, backendPlayer2, gameStarted]);

  const handleGameStateUpdate = useCallback((data) => {
    if (data.benchmark_run_id) benchmarkRunIdRef.current = data.benchmark_run_id;
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
      if (data.winner) { gameFinishedRef.current = true;
      setGameOverDismissed(false); setWinner(data.winner); }
      if (data.message) setMessage(data.message);
    } else if (data.type === 'game_over') {
      gameFinishedRef.current = true;
      setWinner(data.winner); setGameStatus(GAME_STATUS.FINISHED); setMessage(data.message);
    } else if (data.type === 'ship_placed') {
      if (data.player === 1) setPlayer1Board(data.board); else setPlayer2Board(data.board);
    }
  }, []);

  handlerRef.current = handleGameStateUpdate;

  useEffect(() => {
    if (!shotsInitRef.current) {
      prevShotsRef.current = { p1: player1Shots, p2: player2Shots };
      setRevealedP1Shots(cloneShots(player1Shots, boardSize));
      setRevealedP2Shots(cloneShots(player2Shots, boardSize));
      shotsInitRef.current = true;
      return;
    }
    if (activeShotAnim) return;
    const onP1 = findNewShot(prevShotsRef.current.p2, player2Shots, boardSize);
    if (onP1) {
      setActiveShotAnim({ board: 'p1', ...onP1 });
      setActionFeed((prev) => [...prev, {
        id: `bs-p1-${onP1.row}-${onP1.col}-${Date.now()}`,
        side: 'player1',
        verb: onP1.result === 'hit' ? 'hit' : 'miss',
        detail: `(${onP1.row + 1},${getColumnLabel(onP1.col)})`,
      }].slice(-8));
      prevShotsRef.current = { p1: player1Shots, p2: player2Shots };
      return;
    }
    const onP2 = findNewShot(prevShotsRef.current.p1, player1Shots, boardSize);
    if (onP2) {
      setActiveShotAnim({ board: 'p2', ...onP2 });
      setActionFeed((prev) => [...prev, {
        id: `bs-p2-${onP2.row}-${onP2.col}-${Date.now()}`,
        side: 'player2',
        verb: onP2.result === 'hit' ? 'hit' : 'miss',
        detail: `(${onP2.row + 1},${getColumnLabel(onP2.col)})`,
      }].slice(-8));
    }
    prevShotsRef.current = { p1: player1Shots, p2: player2Shots };
  }, [player1Shots, player2Shots, boardSize, activeShotAnim]);

  const completeShotAnim = useCallback(() => {
    if (!activeShotAnim) return;
    const { board, row, col, result } = activeShotAnim;
    if (board === 'p1') {
      setRevealedP2Shots((prev) => {
        const next = prev.map((r) => [...r]);
        next[row][col] = result;
        return next;
      });
    } else {
      setRevealedP1Shots((prev) => {
        const next = prev.map((r) => [...r]);
        next[row][col] = result;
        return next;
      });
    }
    setActiveShotAnim(null);
  }, [activeShotAnim]);

  const renderShipCell = (board, revealedShots, row, col, boardSide) => {
    const val = board[row][col];
    const isHit = revealedShots[row][col] === 'hit';
    const isMiss = revealedShots[row][col] === 'miss';
    const isAnimating =
      activeShotAnim?.board === boardSide
      && activeShotAnim.row === row
      && activeShotAnim.col === col;

    const cellContent = (() => {
      if (!val && isMiss) return <div className="cell-miss cell-miss-reveal" />;
      if (!val) return null;
      const seg = getShipSegment(board, row, col);
      return (
        <div className={`cell-ship-px ${isHit ? 'cell-ship-damaged' : ''}`} data-seg={seg}>
          <ShipSegmentSprite seg={seg} damaged={isHit} />
          {isHit && <div className="damage-overlay" />}
        </div>
      );
    })();

    return (
      <>
        {cellContent}
        {isAnimating && (
          <ShotEffect result={activeShotAnim.result} onComplete={completeShotAnim} />
        )}
      </>
    );
  };

  const renderBoard = (board, revealedShots, boardSide) => (
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
                  {renderShipCell(board, revealedShots, row, col, boardSide)}
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
                  style={{ '--pip-color': FLEET_HULL_COLOR }} />
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

  const bsPhaseText = winner
    ? `${winner === 1 ? player1DisplayName : player2DisplayName} wins`
    : gameStatus === GAME_STATUS.WAITING
      ? 'Setting up fleets'
      : message?.toLowerCase().includes('placement')
        ? 'Placing ships'
        : 'Turn-based battle';

  return (
    <GameLayout
      gameName="Battleship"
      player1Name={player1DisplayName}
      player2Name={player2DisplayName}
      actionFeed={actionFeed}
      onBack={() => {
        if (!gameFinishedRef.current) cancelBenchmarkRun(benchmarkRunIdRef.current);
        if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
        onBack();
      }}
      statusText={bsPhaseText}
    >
      {isCountdown && (
        <GameCountdown player1Name={player1DisplayName} player2Name={player2DisplayName}
          onComplete={() => {
            if (!gameId) return;
            startRunning();
            connectWebSocket(gameId);
          }} />
      )}

            <GameOverModal
        open={Boolean(winner && !gameOverDismissed)}
        onClose={() => setGameOverDismissed(true)}
        actions={
          <button type="button" onClick={() => {
            if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
            onBack();
          }} className="new-game-overlay-button">Back to Arena</button>
        }
      >
        <div className="winner-name">
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
      </GameOverModal>

      {isRunning && !isCountdown && (
        <div className="bs-main">
          <div className={`bs-side ${isP1Active ? 'side-active' : ''}`}>
            <PlayerLabel name={player1DisplayName} thinking={isP1Active} className="bs-label-p1" />
            {renderBoard(player1Board, revealedP2Shots, 'p1')}
            <FleetPanel ships={p1Ships} />
          </div>

          <div className="game-split-vs">VS</div>

          <div className={`bs-side ${isP2Active ? 'side-active' : ''}`}>
            <PlayerLabel name={player2DisplayName} thinking={isP2Active} className="bs-label-p2" />
            {renderBoard(player2Board, revealedP1Shots, 'p2')}
            <FleetPanel ships={p2Ships} />
          </div>
        </div>
      )}

    </GameLayout>
  );
};

export default Battleship;
