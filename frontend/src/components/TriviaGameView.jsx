import React, { useState, useEffect, useRef } from 'react'
import SidebarVote from './SidebarVote'
import './TriviaGameView.css'

const TriviaGameView = ({ gameId, player1Model, player2Model, onGameEnd }) => {
  // Get display names and info for models
  const getModelInfo = (modelId) => {
    if (!modelId) return { name: 'Unknown', color: '#6b7280', emoji: '🤖' }
    
    const id = (typeof modelId === 'object' ? (modelId.id || '') : String(modelId)).toLowerCase()
    
    // OpenAI models
    if (id.includes('gpt-4o')) return { name: 'GPT-4o', color: '#10a37f', emoji: '🤖' }
    if (id.includes('gpt-4-turbo')) return { name: 'GPT-4 Turbo', color: '#10a37f', emoji: '🤖' }
    if (id.includes('gpt-3.5')) return { name: 'GPT-3.5', color: '#10a37f', emoji: '🤖' }
    if (id.includes('gpt') || id.includes('openai')) return { name: 'GPT-4', color: '#10a37f', emoji: '🤖' }
    
    // Anthropic models
    if (id.includes('claude-3-opus')) return { name: 'Claude 3 Opus', color: '#d97706', emoji: '🧠' }
    if (id.includes('claude-3-sonnet')) return { name: 'Claude 3 Sonnet', color: '#d97706', emoji: '🧠' }
    if (id.includes('claude-3-haiku')) return { name: 'Claude 3 Haiku', color: '#d97706', emoji: '🧠' }
    if (id.includes('claude') || id.includes('anthropic')) return { name: 'Claude 3', color: '#d97706', emoji: '🧠' }
    
    // Google models
    if (id.includes('gemini-1.5-pro')) return { name: 'Gemini 1.5 Pro', color: '#4285f4', emoji: '✨' }
    if (id.includes('gemini-1.5-flash')) return { name: 'Gemini 1.5 Flash', color: '#4285f4', emoji: '✨' }
    if (id.includes('gemini')) return { name: 'Gemini Pro', color: '#4285f4', emoji: '✨' }
    
    const displayName = typeof modelId === 'object' ? (modelId.name || modelId.id || 'Unknown') : String(modelId)
    return { 
      name: displayName.charAt(0).toUpperCase() + displayName.slice(1), 
      color: '#6b7280', 
      emoji: '🤖' 
    }
  }

  const player1Info = getModelInfo(player1Model)
  const player2Info = getModelInfo(player2Model)

  // Race state for each player
  const [player1State, setPlayer1State] = useState({
    questionIndex: 0,
    score: 0,
    currentQuestion: null,
    isAnswering: false,
    finished: false,
    responses: []
  })
  
  const [player2State, setPlayer2State] = useState({
    questionIndex: 0,
    score: 0,
    currentQuestion: null,
    isAnswering: false,
    finished: false,
    responses: []
  })
  
  const [raceState, setRaceState] = useState({
    totalQuestions: 20,
    votingComplete: false,
    raceStarted: false,
    raceFinished: false,
    winner: null,
    raceTime: 0
  })
  
  const [websocket, setWebsocket] = useState(null)
  
  const wsRef = useRef(null)

  // Handle when voting period ends
  const handleGameStart = () => {
    console.log('🎮 Voting complete, showing trivia start screen...')
    setRaceState(prev => ({ ...prev, votingComplete: true }))
  }

  // WebSocket connection (only after voting is complete)
  useEffect(() => {
    if (gameId && raceState.votingComplete) {
      const host = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'localhost:8000' : `${window.location.hostname}:8000`
      const ws = new WebSocket(`ws://${host}/api/trivia/ws/${gameId}`)
      
      ws.onopen = () => {
        console.log('WebSocket connected')
        setWebsocket(ws)
        wsRef.current = ws
      }
      
      ws.onmessage = (event) => {
        let message
        try {
          message = JSON.parse(event.data)
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err)
          return
        }
        
        if (message.type === 'player_question_result') {
          handlePlayerQuestionResult(message.data)
        } else if (message.type === 'race_finished') {
          handleRaceFinished(message.data)
        } else if (message.type === 'error') {
          console.error('Game error:', message.message)
        }
      }
      
      ws.onclose = () => {
        console.log('WebSocket disconnected')
      }
      
      return () => {
        if (ws) {
          ws.close()
        }
      }
    }
  }, [gameId, raceState.votingComplete])

  const handlePlayerQuestionResult = (result) => {
    const { player, question_number, response, correct, time } = result
    
    // Update the specific player's state
    if (player === 1) {
      setPlayer1State(prev => ({
        ...prev,
        questionIndex: question_number,
        score: prev.score + (correct ? 1 : 0),
        isAnswering: false,
        responses: [...prev.responses, result]
      }))
    } else {
      setPlayer2State(prev => ({
        ...prev,
        questionIndex: question_number,
        score: prev.score + (correct ? 1 : 0),
        isAnswering: false,
        responses: [...prev.responses, result]
      }))
    }
    
    // Continue the race for this player if they haven't finished
    setTimeout(() => {
      if (!raceState.raceFinished) {
        askNextQuestion(player)
      }
    }, 2000) // 2 second delay to show the result
  }

  const handleRaceFinished = (finalResults) => {
    setRaceState(prev => ({
      ...prev,
      raceFinished: true,
      winner: finalResults.race_winner,
      raceTime: finalResults.race_time
    }))
    
    // Mark both players as finished
    setPlayer1State(prev => ({ ...prev, finished: true, isAnswering: false }))
    setPlayer2State(prev => ({ ...prev, finished: true, isAnswering: false }))
  }

  const askNextQuestion = async (player) => {
    try {
      // First get the current question for this player
      const apiBase = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:8000' : `http://${window.location.hostname}:8000`
      const questionResponse = await fetch(`${apiBase}/api/trivia/game/${gameId}/player/${player}/current-question`)
      const questionData = await questionResponse.json()
      
      if (questionData.finished) {
        return // Player has finished all questions
      }
      
      // Update player state with current question
      if (player === 1) {
        setPlayer1State(prev => ({
          ...prev,
          currentQuestion: questionData.current_question,
          isAnswering: true
        }))
      } else {
        setPlayer2State(prev => ({
          ...prev,
          currentQuestion: questionData.current_question,
          isAnswering: true
        }))
      }
      
      // Ask the question to the model
      const response = await fetch(`${apiBase}/api/trivia/game/${gameId}/player/${player}/next-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error(`Failed to get next question for player ${player}`)
      }
      
      // Result will come through WebSocket
    } catch (error) {
      console.error(`Error getting next question for player ${player}:`, error)
      
      // Mark player as not answering if there's an error
      if (player === 1) {
        setPlayer1State(prev => ({ ...prev, isAnswering: false }))
      } else {
        setPlayer2State(prev => ({ ...prev, isAnswering: false }))
      }
    }
  }

  const startRace = () => {
    setRaceState(prev => ({ ...prev, raceStarted: true }))
    
    // Start asking questions to both players
    askNextQuestion(1)
    askNextQuestion(2)
  }

  // Show voting interface first
  if (!raceState.votingComplete) {
    return (
      <div className="trivia-game-container">
        <SidebarVote 
          gameId={gameId} 
          onGameStart={handleGameStart}
        />
        
        <div className="game-start-screen">
          <h1>🏁 TRIVIA RACE</h1>
          
          <div className="vs-setup">
            <div className="player-card">
              <div className="player-emoji">{player1Info.emoji}</div>
              <h3>{player1Info.name}</h3>
              <p>Player 1</p>
            </div>
            
            <div className="vs-divider">VS</div>
            
            <div className="player-card">
              <div className="player-emoji">{player2Info.emoji}</div>
              <h3>{player2Info.name}</h3>
              <p>Player 2</p>
            </div>
          </div>
          
          <div className="game-info">
            <p>🏁 RACE TO FINISH 20 QUESTIONS FIRST!</p>
            <p>Pre-game voting in progress...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!raceState.raceStarted) {
    return (
      <div className="trivia-game-container">
        <div className="game-start-screen">
          <h1>🏁 TRIVIA RACE</h1>
          
          <div className="vs-setup">
            <div className="player-card">
              <div className="player-emoji">{player1Info.emoji}</div>
              <h3>{player1Info.name}</h3>
              <p>Player 1</p>
            </div>
            
            <div className="vs-divider">VS</div>
            
            <div className="player-card">
              <div className="player-emoji">{player2Info.emoji}</div>
              <h3>{player2Info.name}</h3>
              <p>Player 2</p>
            </div>
          </div>
          
          <div className="game-info">
            <p>🏁 RACE TO FINISH 20 QUESTIONS FIRST!</p>
            <p>Each model answers independently • First to complete wins!</p>
          </div>
          
          <button className="start-game-btn" onClick={startRace}>
            START RACE
          </button>
        </div>
      </div>
    )
  }

  if (raceState.raceFinished) {
    return (
      <div className="trivia-game-container">
        <div className="game-over-screen">
          <h1>🏆 RACE FINISHED!</h1>
          
          <div className="final-scores">
            <div className={`final-score-card ${raceState.winner === 1 ? 'winner' : ''}`}>
              <div className="player-emoji">{player1Info.emoji}</div>
              <h3>{player1Info.name}</h3>
              <div className="score">{player1State.score}/20</div>
              <div className="questions-completed">{player1State.questionIndex} questions</div>
              {raceState.winner === 1 && <div className="winner-badge">WINNER!</div>}
            </div>
            
            <div className={`final-score-card ${raceState.winner === 2 ? 'winner' : ''}`}>
              <div className="player-emoji">{player2Info.emoji}</div>
              <h3>{player2Info.name}</h3>
              <div className="score">{player2State.score}/20</div>
              <div className="questions-completed">{player2State.questionIndex} questions</div>
              {raceState.winner === 2 && <div className="winner-badge">WINNER!</div>}
            </div>
          </div>
          
          <div className="race-time">
            Race completed in {(raceState.raceTime || 0).toFixed(1)} seconds
          </div>
          
          <button className="new-game-btn" onClick={onGameEnd}>
            NEW RACE
          </button>
        </div>

      </div>
    )
  }

  // Race view - split screen
  return (
    <div className="trivia-race-container">
      {/* Race Header */}
      <div className="race-header">
        <h1>🏁 TRIVIA RACE</h1>
        <div className="race-status">
          {raceState.raceFinished ? 'RACE FINISHED!' : 'RACING...'}
        </div>
      </div>

      {/* Split Screen Race View */}
      <div className="race-split-view">
        {/* Player 1 Side */}
        <div className="player-race-side" style={{ borderColor: player1Info.color }}>
          <div className="player-header">
            <div className="player-info">
              <span className="player-emoji">{player1Info.emoji}</span>
              <h2>{player1Info.name}</h2>
            </div>
            <div className="player-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ 
                    width: `${(player1State.questionIndex / raceState.totalQuestions) * 100}%`,
                    backgroundColor: player1Info.color
                  }}
                />
              </div>
              <div className="progress-text">
                {player1State.questionIndex}/{raceState.totalQuestions} • Score: {player1State.score}
              </div>
            </div>
          </div>

          <div className="current-question-area">
            {player1State.isAnswering && (
              <div className="answering-state">
                <div className="spinner" />
                <p>Thinking...</p>
              </div>
            )}

            {player1State.currentQuestion && !player1State.isAnswering && (
              <div className="question-display">
                <h3>Q{player1State.questionIndex}: {player1State.currentQuestion.question}</h3>
                {player1State.currentQuestion.choices && (
                  <div className="choices">
                    {player1State.currentQuestion.choices.map((choice, index) => (
                      <div key={index} className="choice">
                        {String.fromCharCode(65 + index)}. {choice}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {player1State.finished && (
              <div className="finished-state">
                <h2>🏁 FINISHED!</h2>
                <p>Final Score: {player1State.score}/20</p>
              </div>
            )}
          </div>

          {/* Recent responses */}
          <div className="recent-responses">
            {player1State.responses.slice(-3).map((response, index) => (
              <div 
                key={index} 
                className={`mini-response ${response.correct ? 'correct' : 'incorrect'}`}
              >
                Q{response.question_number}: {response.correct ? '✅' : '❌'} ({(response.time || 0).toFixed(1)}s)
              </div>
            ))}
          </div>
        </div>

        {/* VS Divider */}
        <div className="vs-divider-race">
          <span>VS</span>
        </div>

        {/* Player 2 Side */}
        <div className="player-race-side" style={{ borderColor: player2Info.color }}>
          <div className="player-header">
            <div className="player-info">
              <span className="player-emoji">{player2Info.emoji}</span>
              <h2>{player2Info.name}</h2>
            </div>
            <div className="player-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ 
                    width: `${(player2State.questionIndex / raceState.totalQuestions) * 100}%`,
                    backgroundColor: player2Info.color
                  }}
                />
              </div>
              <div className="progress-text">
                {player2State.questionIndex}/{raceState.totalQuestions} • Score: {player2State.score}
              </div>
            </div>
          </div>

          <div className="current-question-area">
            {player2State.isAnswering && (
              <div className="answering-state">
                <div className="spinner" />
                <p>Thinking...</p>
              </div>
            )}

            {player2State.currentQuestion && !player2State.isAnswering && (
              <div className="question-display">
                <h3>Q{player2State.questionIndex}: {player2State.currentQuestion.question}</h3>
                {player2State.currentQuestion.choices && (
                  <div className="choices">
                    {player2State.currentQuestion.choices.map((choice, index) => (
                      <div key={index} className="choice">
                        {String.fromCharCode(65 + index)}. {choice}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {player2State.finished && (
              <div className="finished-state">
                <h2>🏁 FINISHED!</h2>
                <p>Final Score: {player2State.score}/20</p>
              </div>
            )}
          </div>

          {/* Recent responses */}
          <div className="recent-responses">
            {player2State.responses.slice(-3).map((response, index) => (
              <div 
                key={index} 
                className={`mini-response ${response.correct ? 'correct' : 'incorrect'}`}
              >
                Q{response.question_number}: {response.correct ? '✅' : '❌'} ({(response.time || 0).toFixed(1)}s)
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}

export default TriviaGameView 