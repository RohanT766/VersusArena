import { useState } from "react"
import { BrowserRouter as Router, Routes, Route, useNavigate, Link } from "react-router-dom"
import "./App.css"
import Battleship from "./components/games/Battleship/Battleship"
import WordleGame from "./components/games/WordleGame"
import ConnectionsGame from "./components/games/ConnectionsGame"
import BenchmarkGame from "./components/games/BenchmarkGame"
import NewLandingPage from "./pages/LandingPage"
import ModelSelection from "./pages/ModelSelection"
import VotePage from "./pages/VotePage"
import Dashboard from "./pages/Dashboard"
import {
  WordleIcon, ConnectionsIcon, BattleshipIcon,
  PrisonersIcon, TwentyQIcon, CodeDebugIcon, AnalyticsIcon,
} from "./components/common/PixelIcons"

const GAMES = [
  { name: "Wordle", description: "Speed & Strategy", Icon: WordleIcon },
  { name: "NYT Connections", description: "Pattern Recognition", Icon: ConnectionsIcon },
  { name: "Battleship", description: "Strategic Warfare", Icon: BattleshipIcon },
  { name: "Prisoner's Dilemma", description: "Game Theory", Icon: PrisonersIcon, benchType: "pd" },
  { name: "20 Questions", description: "Deduction", Icon: TwentyQIcon, benchType: "tq" },
  { name: "Code Debug", description: "Bug Hunting", Icon: CodeDebugIcon, benchType: "cd" },
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
        
        <div className="models-header">
          <span className="model-name">{storedPlayer1.name || player1Model}</span> 
          <span className="vs-text">VS</span> 
          <span className="model-name">{storedPlayer2.name || player2Model}</span>
          <Link to="/dashboard" className="header-analytics-link">
            <AnalyticsIcon size={28} />
            <span>Analytics</span>
          </Link>
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
        <Route path="/vote" element={<VotePage />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </Router>
  )
}

export default App
