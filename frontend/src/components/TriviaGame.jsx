import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import TriviaGameView from './TriviaGameView'
import './TriviaGameView.css' // Import CSS to ensure styles are loaded

const TriviaGame = () => {
  const navigate = useNavigate()
  const [gameId, setGameId] = useState(null)
  const [gameStarted, setGameStarted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  // Get stored models from sessionStorage (matching how they're stored in ModelSelection)
  const storedPlayer1 = JSON.parse(sessionStorage.getItem('player1Model') || '{}')
  const storedPlayer2 = JSON.parse(sessionStorage.getItem('player2Model') || '{}')
  
  const player1Model = {
    id: storedPlayer1.id || 'gpt-5.5',
    name: storedPlayer1.name || 'GPT-5.5',
    provider: storedPlayer1.provider || 'openai'
  }
  
  const player2Model = {
    id: storedPlayer2.id || 'claude-sonnet-4-6',
    name: storedPlayer2.name || 'Claude Sonnet 4.6',
    provider: storedPlayer2.provider || 'anthropic'
  }

  useEffect(() => {
    startNewGame()
  }, [])

  const startNewGame = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const requestBody = {
        player1_model: player1Model.id,
        player2_model: player2Model.id,
        question_count: 50
      }

      const h = window.location.hostname
      const apiBase = (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:8000' : `http://${h}:8000`
      const response = await fetch(`${apiBase}/api/trivia/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })


      if (!response.ok) {
        const errorData = await response.json()
        console.error('Error response:', errorData)
        throw new Error(errorData.detail || 'Failed to start game')
      }

      const data = await response.json()
      setGameId(data.game_id)
      setGameStarted(true)
    } catch (err) {
      console.error('Error starting trivia game:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGameEnd = () => {
    // Navigate back to games menu
    navigate('/games')
  }

  if (error) {
    return (
      <div className="trivia-container">
        <div className="error-screen">
          <h1>ERROR</h1>
          <p>{error}</p>
          <button 
            className="back-button-styled" 
            onClick={() => navigate('/games')}
          >
            BACK TO GAMES
          </button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="trivia-container">
        <div className="loading-screen">
          <div className="loading-text">INITIALIZING TRIVIA...</div>
          <div className="loading-subtext">
            {player1Model.name} VS {player2Model.name}
          </div>
        </div>
      </div>
    )
  }

  if (!gameStarted || !gameId) {
    return (
      <div className="trivia-container">
        <div className="loading-screen">
          <div className="loading-text">INITIALIZING TRIVIA...</div>
          <div className="loading-subtext">
            {player1Model.name} VS {player2Model.name}
          </div>
        </div>
      </div>
    )
  }

  return (
    <TriviaGameView 
      gameId={gameId}
      player1Model={player1Model}
      player2Model={player2Model}
      onGameEnd={handleGameEnd}
      onBack={handleGameEnd}
    />
  )
}

export default TriviaGame 