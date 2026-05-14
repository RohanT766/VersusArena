import { useState } from "react"
import { BrowserRouter as Router, Routes, Route, useNavigate } from "react-router-dom"
import "./App.css"
import Battleship from "./components/games/Battleship/Battleship"
import TriviaGame from "./components/TriviaGame"
import WordleGame from "./components/games/WordleGame"
import ConnectionsGame from "./components/games/ConnectionsGame"
import NewLandingPage from "./pages/LandingPage"
import ModelSelection from "./pages/ModelSelection"
import VotePage from "./pages/VotePage"
import Dashboard from "./pages/Dashboard"
import BenchmarkExtras from "./pages/BenchmarkExtras"
import { WordleIcon, TriviaIcon, ConnectionsIcon, BattleshipIcon } from "./components/common/PixelIcons"

const GAMES = [
  { name: "Wordle", description: "Speed & Strategy", Icon: WordleIcon },
  { name: "Trivia", description: "Knowledge Race", Icon: TriviaIcon },
  { name: "NYT Connections", description: "Pattern Recognition", Icon: ConnectionsIcon },
  { name: "Battleship", description: "Strategic Warfare", Icon: BattleshipIcon },
]

function MainMenu() {
  const navigate = useNavigate()
  const [selectedGame, setSelectedGame] = useState(null)
  
  // Get pre-selected models from sessionStorage (from model selection page)
  const storedPlayer1 = JSON.parse(sessionStorage.getItem('player1Model') || '{}')
  const storedPlayer2 = JSON.parse(sessionStorage.getItem('player2Model') || '{}')
  
  const [player1Model, setPlayer1Model] = useState(storedPlayer1.id || "gpt-5.5")
  const [player2Model, setPlayer2Model] = useState(storedPlayer2.id || "claude-sonnet-4-6")
  const [gameStarted, setGameStarted] = useState(false)

  const handleGameSelect = (game) => {
    if (game.name === "Trivia") {
      navigate("/trivia", {
        state: {
          player1Model,
          player2Model,
        },
      })
    } else {
      setSelectedGame(game)
      setGameStarted(true)
    }
  }

  const handleBackToMenu = () => {
    setSelectedGame(null)
    setGameStarted(false)
  }

  // If game has started, show the appropriate game component
  if (gameStarted && selectedGame) {
    // Handle Battleship
    if (selectedGame.name === "Battleship") {
      return (
        <Battleship
          player1Model={player1Model}
          player2Model={player2Model}
          onBack={handleBackToMenu}
        />
      )
    }
    // Handle Wordle
    else if (selectedGame.name === "Wordle") {
      return <WordleGame player1Model={player1Model} player2Model={player2Model} onBack={handleBackToMenu} />
    }
    // Handle NYT Connections
    else if (selectedGame.name === "NYT Connections") {
      return <ConnectionsGame player1Model={player1Model} player2Model={player2Model} onBack={handleBackToMenu} />
    }
    // Handle other games that aren't implemented yet
    else {
      return (
        <div className="app">
          <button
            onClick={handleBackToMenu}
            style={{
              position: "absolute",
              top: "10px",
              left: "10px",
              zIndex: 1000,
              background: "rgba(0, 0, 0, 0.8)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              color: "#fff",
              padding: "0.5rem 1rem",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.9rem",
              margin: 0,
            }}
          >
            ← Back to Menu
          </button>
          <div className="game-not-implemented">
            <h2>{selectedGame.name} - Coming Soon!</h2>
            <p>This game is not yet implemented.</p>
          </div>
        </div>
      )
    }
  }

  // Show games grid with selected models - no intermediate setup screen needed
  if (!gameStarted) {
    return (
      <div className="app game-selection-page">
        <button
          onClick={() => navigate("/")}
          className="back-button"
        >
          ← Back
        </button>
        
        <div className="models-header">
          <span className="model-name">{storedPlayer1.name || player1Model}</span> 
          <span className="vs-text">VS</span> 
          <span className="model-name">{storedPlayer2.name || player2Model}</span>
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

        <div
          className="games-footer-bar"
          style={{ marginTop: 24, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}
        >
          <button type="button" className="game-card" style={{ maxWidth: 280 }} onClick={() => navigate('/dashboard')}>
            <h3>Analytics</h3>
            <p className="game-description">Leaderboard, runs, exports</p>
          </button>
          <button
            type="button"
            className="game-card"
            style={{ maxWidth: 280 }}
            onClick={() => navigate('/benchmark-extras')}
          >
            <h3>More benchmarks</h3>
            <p className="game-description">PD, 20Q, code debug</p>
          </button>
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
        <Route path="/trivia" element={<TriviaGame />} />
        <Route path="/vote" element={<VotePage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/benchmark-extras" element={<BenchmarkExtras />} />
      </Routes>
    </Router>
  )
}

export default App
