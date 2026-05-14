import React, { useState, useEffect, useRef, useCallback } from 'react'
import SidebarVote from './SidebarVote'
import GameCountdown from './common/GameCountdown'
import GameLayout from './common/GameLayout'
import './TriviaGameView.css'

const TOTAL_TO_WIN = 20

const TriviaGameView = ({ gameId, player1Model, player2Model, onGameEnd, onBack }) => {
  const mountedRef = useRef(true)
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const getModelInfo = (modelId) => {
    if (!modelId) return { name: 'Unknown', color: '#6b7280' }
    const id = (typeof modelId === 'object' ? (modelId.id || '') : String(modelId)).toLowerCase()
    if (id.includes('gpt-5.5')) return { name: 'GPT-5.5', color: '#10a37f' }
    if (id.includes('gpt-5.4-mini')) return { name: 'GPT-5.4 Mini', color: '#10a37f' }
    if (id.includes('gpt-4o')) return { name: 'GPT-4o', color: '#10a37f' }
    if (id.includes('o4-mini')) return { name: 'o4-mini', color: '#10a37f' }
    if (id.includes('gpt') || id.includes('openai')) return { name: 'GPT', color: '#10a37f' }
    if (id.includes('claude-opus-4-7')) return { name: 'Claude Opus 4.7', color: '#d97706' }
    if (id.includes('claude-sonnet-4-6')) return { name: 'Claude Sonnet 4.6', color: '#d97706' }
    if (id.includes('claude-haiku-4-5')) return { name: 'Claude Haiku 4.5', color: '#d97706' }
    if (id.includes('claude-sonnet-4')) return { name: 'Claude Sonnet 4', color: '#d97706' }
    if (id.includes('claude') || id.includes('anthropic')) return { name: 'Claude', color: '#d97706' }
    if (id.includes('gemini-3.1-pro')) return { name: 'Gemini 3.1 Pro', color: '#4285f4' }
    if (id.includes('gemini-2.5-pro')) return { name: 'Gemini 2.5 Pro', color: '#4285f4' }
    if (id.includes('gemini-2.5-flash')) return { name: 'Gemini 2.5 Flash', color: '#4285f4' }
    if (id.includes('gemini')) return { name: 'Gemini', color: '#4285f4' }
    const displayName = typeof modelId === 'object' ? (modelId.name || modelId.id || 'Unknown') : String(modelId)
    return { name: displayName.charAt(0).toUpperCase() + displayName.slice(1), color: '#6b7280' }
  }

  const player1Info = getModelInfo(player1Model)
  const player2Info = getModelInfo(player2Model)

  const [p1, setP1] = useState({ score: 0, qIndex: 0, question: null, isThinking: false, responses: [], finished: false })
  const [p2, setP2] = useState({ score: 0, qIndex: 0, question: null, isThinking: false, responses: [], finished: false })
  const [votingDone, setVotingDone] = useState(false)
  const [showCountdown, setShowCountdown] = useState(false)
  const [raceStarted, setRaceStarted] = useState(false)
  const [raceFinished, setRaceFinished] = useState(false)
  const [raceWinner, setRaceWinner] = useState(null)

  const getApiBase = () => {
    const h = window.location.hostname
    return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:8000' : `http://${h}:8000`
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms))

  const runPlayerLoop = useCallback(async (player) => {
    const apiBase = getApiBase()
    const setState = player === 1 ? setP1 : setP2

    while (mountedRef.current) {
      // Fetch current question
      try {
        const qRes = await fetch(`${apiBase}/api/trivia/game/${gameId}/player/${player}/current-question`)
        if (!qRes.ok) break
        const qData = await qRes.json()
        if (qData.finished) {
          setState(prev => ({ ...prev, finished: true, isThinking: false }))
          break
        }

        setState(prev => ({
          ...prev,
          question: qData.current_question,
          qIndex: qData.question_index,
          isThinking: true,
        }))

        // POST to get AI answer
        const aRes = await fetch(`${apiBase}/api/trivia/game/${gameId}/player/${player}/next-question`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        if (!aRes.ok) break
        const result = await aRes.json()
        if (result.error) break

        if (!mountedRef.current) break

        const isCorrect = result.correct
        setState(prev => {
          const newScore = isCorrect ? prev.score + 1 : Math.max(0, prev.score - 1)
          return {
            ...prev,
            score: newScore,
            qIndex: result.question_number,
            isThinking: false,
            responses: [...prev.responses, result],
          }
        })

        if (isCorrect) {
          // Check if this player reached the target
          const checkState = player === 1 ? setP1 : setP2
          let won = false
          checkState(prev => {
            if (prev.score >= TOTAL_TO_WIN && !raceFinished) {
              won = true
            }
            return prev
          })
          // Small delay, then check win via a ref-based approach
        }

        await sleep(isCorrect ? 1200 : 2000)
      } catch (err) {
        if (!mountedRef.current) break
        console.error(`Player ${player} loop error:`, err)
        await sleep(2000)
      }
    }
  }, [gameId])

  // Track scores via refs to detect winner across concurrent loops
  const p1ScoreRef = useRef(0)
  const p2ScoreRef = useRef(0)
  const raceFinishedRef = useRef(false)

  useEffect(() => { p1ScoreRef.current = p1.score }, [p1.score])
  useEffect(() => { p2ScoreRef.current = p2.score }, [p2.score])

  // Check for winner whenever scores change
  useEffect(() => {
    if (raceFinishedRef.current) return
    if (p1.score >= TOTAL_TO_WIN) {
      raceFinishedRef.current = true
      setRaceFinished(true)
      setRaceWinner(1)
    } else if (p2.score >= TOTAL_TO_WIN) {
      raceFinishedRef.current = true
      setRaceFinished(true)
      setRaceWinner(2)
    }
  }, [p1.score, p2.score])

  const handleCountdownComplete = () => {
    setShowCountdown(false)
    setRaceStarted(true)
    runPlayerLoop(1)
    runPlayerLoop(2)
  }

  const triviaStatus = raceFinished
    ? `${raceWinner === 1 ? player1Info.name : player2Info.name} Wins!`
    : raceStarted ? 'RACING...'
    : votingDone ? 'READY' : null

  const renderPlayerSide = (state, info) => {
    const progressPct = Math.min(100, (state.score / TOTAL_TO_WIN) * 100)
    const lastResult = state.responses.length > 0 ? state.responses[state.responses.length - 1] : null

    return (
      <div className="player-race-side" style={{ borderColor: info.color }}>
        <div className="player-race-name" style={{ color: info.color }}>{info.name}</div>

        <div className="player-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progressPct}%`, backgroundColor: info.color }} />
          </div>
          <div className="progress-text">
            {state.score}/{TOTAL_TO_WIN} correct
          </div>
        </div>

        <div className="current-question-area">
          {state.isThinking && state.question && (
            <div className="question-display">
              <h3>Q{(state.qIndex || 0) + 1}: {state.question.question}</h3>
              {state.question.choices && (
                <div className="choices">
                  {state.question.choices.map((choice, i) => (
                    <div key={i} className="choice">{String.fromCharCode(65 + i)}. {choice}</div>
                  ))}
                </div>
              )}
              <div className="answering-state">
                <span className="game-player-thinking">THINKING...</span>
              </div>
            </div>
          )}

          {!state.isThinking && lastResult && (
            <div className="question-display">
              <h3>Q{lastResult.question_number}: {lastResult.question?.question || ''}</h3>
              {lastResult.question?.choices && (
                <div className="choices">
                  {lastResult.question.choices.map((choice, i) => {
                    const letter = String.fromCharCode(65 + i)
                    const isCorrectChoice = letter === lastResult.correct_answer
                    const isSelected = lastResult.response?.toUpperCase().startsWith(letter)
                    let cls = 'choice'
                    if (isCorrectChoice) cls += ' choice-correct'
                    else if (isSelected && !lastResult.correct) cls += ' choice-wrong'
                    return <div key={i} className={cls}>{letter}. {choice}</div>
                  })}
                </div>
              )}
              <div className={`result-badge ${lastResult.correct ? 'correct' : 'incorrect'}`}>
                {lastResult.correct ? 'CORRECT' : 'WRONG (-1)'} ({(lastResult.time || 0).toFixed(1)}s)
              </div>
            </div>
          )}

          {!state.isThinking && !lastResult && !state.finished && (
            <div className="answering-state">
              <span style={{ color: '#555', fontSize: '1.2rem' }}>WAITING...</span>
            </div>
          )}

          {state.finished && (
            <div className="finished-state">
              <h2>FINISHED</h2>
              <p>Score: {state.score}/{TOTAL_TO_WIN}</p>
            </div>
          )}
        </div>

        <div className="recent-responses">
          {state.responses.slice(-5).map((r, i) => (
            <div key={i} className={`mini-response ${r.correct ? 'correct' : 'incorrect'}`}>
              Q{r.question_number}: {r.correct ? 'correct' : 'wrong'} ({(r.time || 0).toFixed(1)}s)
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <GameLayout
      gameName="Trivia"
      player1Name={player1Info.name}
      player2Name={player2Info.name}
      onBack={onBack}
      statusText={triviaStatus}
    >
      {!votingDone && (
        <SidebarVote gameId={gameId} onGameStart={() => { setVotingDone(true); setShowCountdown(true) }} onBack={onBack} />
      )}

      {showCountdown && (
        <GameCountdown
          player1Name={player1Info.name}
          player2Name={player2Info.name}
          onComplete={handleCountdownComplete}
        />
      )}

      {raceFinished && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, animation: 'fadeIn 0.3s ease-out',
        }}>
          <div style={{
            background: '#0a0a0a', border: '2px solid #4CAF50',
            padding: '48px 60px', textAlign: 'center',
          }}>
            <h2 style={{ fontSize: '48px', fontFamily: "'VT323', monospace", color: '#4CAF50', margin: '0 0 16px', letterSpacing: '4px' }}>GAME OVER</h2>
            <div style={{ fontSize: '32px', fontFamily: "'VT323', monospace", color: '#fff', marginBottom: '32px' }}>
              {raceWinner === 1 ? player1Info.name : player2Info.name} WINS!
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '48px', marginBottom: '32px', fontFamily: "'VT323', monospace" }}>
              <div style={{ textAlign: 'center', fontSize: '20px', color: '#aaa' }}>
                <div style={{ fontSize: '24px', color: '#10b981', marginBottom: '8px' }}>{player1Info.name}</div>
                <div>{p1.score}/{TOTAL_TO_WIN} correct</div>
              </div>
              <div style={{ textAlign: 'center', fontSize: '20px', color: '#aaa' }}>
                <div style={{ fontSize: '24px', color: '#a78bfa', marginBottom: '8px' }}>{player2Info.name}</div>
                <div>{p2.score}/{TOTAL_TO_WIN} correct</div>
              </div>
            </div>
            <button onClick={onGameEnd} style={{
              background: '#4CAF50', color: '#000', border: 'none',
              padding: '12px 36px', fontSize: '22px', fontFamily: "'VT323', monospace",
              cursor: 'pointer', letterSpacing: '2px',
            }}>BACK</button>
          </div>
        </div>
      )}

      {!raceFinished && votingDone && !showCountdown && raceStarted ? (
        <div className="race-split-view">
          {renderPlayerSide(p1, player1Info)}
          <div className="game-split-vs">VS</div>
          {renderPlayerSide(p2, player2Info)}
        </div>
      ) : votingDone && !showCountdown ? (
        <div className="trivia-pre-race">
          <div className="trivia-pre-info">RACE TO {TOTAL_TO_WIN} CORRECT ANSWERS</div>
          <div className="trivia-pre-sub">Wrong answers cost 1 point</div>
          <button className="start-game-btn" onClick={() => setShowCountdown(true)}>START RACE</button>
        </div>
      ) : null}
    </GameLayout>
  )
}

export default TriviaGameView
