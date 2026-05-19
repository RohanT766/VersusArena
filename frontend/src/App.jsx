import { useEffect, useRef, useState } from "react"
import { BrowserRouter as Router, Routes, Route, useNavigate, Link } from "react-router-dom"
import "./App.css"
import Battleship from "./components/games/Battleship/Battleship"
import WordleGame from "./components/games/WordleGame"
import ConnectionsGame from "./components/games/ConnectionsGame"
import MinesweeperGame from "./components/games/MinesweeperGame"
import AuctionGame from "./components/games/AuctionGame"
import PokerGame from "./components/games/PokerGame"
import BenchmarkGame from "./components/games/BenchmarkGame"
import NewLandingPage from "./pages/LandingPage"
import ModelSelection from "./pages/ModelSelection"
import Dashboard from "./pages/Dashboard"
import { MODEL_OPTIONS, getModelName } from "./config/modelCatalog"
import {
  WordleIcon, ConnectionsIcon, BattleshipIcon, AnalyticsIcon,
  MinesweeperIcon, AuctionIcon, PokerIcon,
} from "./components/common/PixelIcons"

const GAMES = [
  { name: "Wordle", description: "Speed & Strategy", Icon: WordleIcon },
  { name: "NYT Connections", description: "Pattern Recognition", Icon: ConnectionsIcon },
  { name: "Battleship", description: "Strategic Warfare", Icon: BattleshipIcon },
  { name: "Minesweeper Race", description: "Logical Deduction", Icon: MinesweeperIcon },
  { name: "Auction Blitz", description: "Risk & Resources", Icon: AuctionIcon },
  { name: "Poker Showdown", description: "Game Theory", Icon: PokerIcon },
]

function loadMenuModels() {
  const initialP1 = JSON.parse(sessionStorage.getItem('player1Model') || '{}')
  const initialP2 = JSON.parse(sessionStorage.getItem('player2Model') || '{}')
  const p1 = initialP1.id || 'gpt-5.5'
  let p2 = initialP2.id || 'claude-sonnet-4-6'
  if (p1 === p2) {
    const alt = MODEL_OPTIONS.find((m) => m.id !== p1)
    if (alt) {
      p2 = alt.id
      sessionStorage.setItem('player2Model', JSON.stringify({ id: alt.id, name: alt.name }))
    }
  }
  return { p1, p2 }
}

function MainMenu() {
  const navigate = useNavigate()
  const [selectedGame, setSelectedGame] = useState(null)
  const [{ p1: defaultP1, p2: defaultP2 }] = useState(loadMenuModels)
  const [player1Model, setPlayer1Model] = useState(defaultP1)
  const [player2Model, setPlayer2Model] = useState(defaultP2)

  const optionsForP1 = MODEL_OPTIONS.filter((m) => m.id !== player2Model)
  const optionsForP2 = MODEL_OPTIONS.filter((m) => m.id !== player1Model)
  const [gameStarted, setGameStarted] = useState(false)
  const [openPicker, setOpenPicker] = useState(null)
  const pickerWrapRef = useRef(null)

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!pickerWrapRef.current?.contains(event.target)) {
        setOpenPicker(null)
      }
    }
    const onEscape = (event) => {
      if (event.key === "Escape") setOpenPicker(null)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onEscape)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onEscape)
    }
  }, [])

  const updateModel = (slot, id) => {
    const payload = { id, name: getModelName(id) }
    if (slot === 'p1') {
      setPlayer1Model(id)
      sessionStorage.setItem('player1Model', JSON.stringify(payload))
      if (id === player2Model) {
        const alt = MODEL_OPTIONS.find((m) => m.id !== id)
        if (alt) {
          setPlayer2Model(alt.id)
          sessionStorage.setItem('player2Model', JSON.stringify({ id: alt.id, name: alt.name }))
        }
      }
    } else {
      setPlayer2Model(id)
      sessionStorage.setItem('player2Model', JSON.stringify(payload))
      if (id === player1Model) {
        const alt = MODEL_OPTIONS.find((m) => m.id !== id)
        if (alt) {
          setPlayer1Model(alt.id)
          sessionStorage.setItem('player1Model', JSON.stringify({ id: alt.id, name: alt.name }))
        }
      }
    }
    setOpenPicker(null)
  }

  const handleGameSelect = (game) => {
    setSelectedGame(game)
    setGameStarted(true)
  }

  const handleBackToMenu = () => {
    setSelectedGame(null)
    setGameStarted(false)
  }

  if (gameStarted && selectedGame) {
    if (selectedGame.name === "Battleship") {
      return <Battleship player1Model={player1Model} player2Model={player2Model} onBack={handleBackToMenu} />
    }
    if (selectedGame.name === "Wordle") {
      return <WordleGame player1Model={player1Model} player2Model={player2Model} onBack={handleBackToMenu} />
    }
    if (selectedGame.name === "NYT Connections") {
      return <ConnectionsGame player1Model={player1Model} player2Model={player2Model} onBack={handleBackToMenu} />
    }
    if (selectedGame.name === "Minesweeper Race") {
      return <MinesweeperGame player1Model={player1Model} player2Model={player2Model} onBack={handleBackToMenu} />
    }
    if (selectedGame.name === "Auction Blitz") {
      return <AuctionGame player1Model={player1Model} player2Model={player2Model} onBack={handleBackToMenu} />
    }
    if (selectedGame.name === "Poker Showdown") {
      return <PokerGame player1Model={player1Model} player2Model={player2Model} onBack={handleBackToMenu} />
    }
    if (selectedGame.benchType) {
      return <BenchmarkGame gameType={selectedGame.benchType} player1Model={player1Model} player2Model={player2Model} onBack={handleBackToMenu} />
    }
  }

  if (!gameStarted) {
    return (
      <div className="app game-selection-page">
        <button
          onClick={() => navigate("/")}
          className="back-button"
        >
          ← Back
        </button>
        
        <div className="models-header" ref={pickerWrapRef}>
          <div className="model-picker-wrap">
            <button
              type="button"
              className={`model-headline-btn ${openPicker === 'p1' ? 'open' : ''}`}
              onClick={() => setOpenPicker((p) => (p === 'p1' ? null : 'p1'))}
            >
              <span className="model-headline-name">{getModelName(player1Model)}</span>
              <span className="model-headline-hint">Click to change</span>
            </button>
            {openPicker === 'p1' && (
              <div className="model-options-panel">
                {optionsForP1.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`model-option ${player1Model === m.id ? 'selected' : ''}`}
                    onClick={() => updateModel('p1', m.id)}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="vs-text">VS</span> 
          <div className="model-picker-wrap">
            <button
              type="button"
              className={`model-headline-btn ${openPicker === 'p2' ? 'open' : ''}`}
              onClick={() => setOpenPicker((p) => (p === 'p2' ? null : 'p2'))}
            >
              <span className="model-headline-name">{getModelName(player2Model)}</span>
              <span className="model-headline-hint">Click to change</span>
            </button>
            {openPicker === 'p2' && (
              <div className="model-options-panel">
                {optionsForP2.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`model-option ${player2Model === m.id ? 'selected' : ''}`}
                    onClick={() => updateModel('p2', m.id)}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="header-actions">
            <Link to="/dashboard" className="header-analytics-link">
              <AnalyticsIcon size={28} />
              <span>Analytics</span>
            </Link>
          </div>
        </div>

        <div className="games-grid">
          {GAMES.map((game) => (
            <button key={game.name} className="game-card" onClick={() => handleGameSelect(game)}>
              <div className="game-icon-svg">
                <game.Icon size={72} />
              </div>
              <h3>{game.name}</h3>
              <p className="game-description">{game.description}</p>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return null
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<NewLandingPage />} />
        <Route path="/model-selection" element={<ModelSelection />} />
        <Route path="/games" element={<MainMenu />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </Router>
  )
}

export default App
