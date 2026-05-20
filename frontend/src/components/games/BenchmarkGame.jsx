import React, { useEffect, useState, useRef } from 'react';
import GameLayout from '../common/GameLayout';
import GameCountdown from '../common/GameCountdown';
import { getDisplayName } from '../../utils/modelUtils';
import { getBackendUrl } from '../../utils/networkUtils';
import useGameFlow, { GAME_FLOW_PHASES } from '../../hooks/useGameFlow';
import './BenchmarkGame.css';

const GAME_CONFIG = {
  pd: {
    title: "Prisoner's Dilemma",
    subtitle: 'Watch two AI models play 8 rounds of the classic cooperation dilemma. Will they cooperate — or betray each other?',
    description: 'Each round, both models choose to COOPERATE or DEFECT.',
    heroAction: 'Begin the Dilemma',
  },
  tq: {
    title: '20 Questions',
    subtitle: 'One model thinks of a word; the other asks yes/no questions to guess it.',
    description: 'One model thinks of a word; the other asks yes/no questions to guess it.',
    heroAction: 'Start Session',
  },
  cd: {
    title: 'Code Debug',
    subtitle: 'Both models receive the same broken code. Watch them race to debug and fix it.',
    description: 'Both models try to fix the same buggy function. Scored against the correct solution.',
    heroAction: 'Start the Challenge',
  },
};

const CHOICE_COLORS = { C: '#538d4e', D: '#b59f3b' };

const BenchmarkGame = ({ gameType, player1Model, player2Model, onBack }) => {
  const base = getBackendUrl();
  const config = GAME_CONFIG[gameType];
  const p1 = player1Model || 'gpt-5.5';
  const p2 = player2Model || 'claude-sonnet-4-6';
  const p1Name = getDisplayName(p1);
  const p2Name = getDisplayName(p2);

  const [sessionId, setSessionId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState('');
  const [rounds, setRounds] = useState([]);
  const [scores, setScores] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [submissions, setSubmissions] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [startingSession, setStartingSession] = useState(false);
  const [pendingStartAfterCountdown, setPendingStartAfterCountdown] = useState(false);
  const mountedRef = useRef(true);

  const initialPhase = gameType === 'tq' ? GAME_FLOW_PHASES.COUNTDOWN : GAME_FLOW_PHASES.SETUP;
  const { isSetup, isCountdown, isRunning, startRunning, startCountdown, goToSetup } = useGameFlow(initialPhase);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const api = async (path, body) => {
    const opts = body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { method: 'POST' };
    const r = await fetch(`${base}${path}`, opts);
    return r.json();
  };

  const performSessionStart = async () => {
    if (startingSession) return;
    setStartingSession(true);
    setBusy(true);
    setRounds([]);
    setTranscript([]);
    setSubmissions(null);
    setChallenge(null);
    setScores(null);
    setDone(false);
    try {
      let data;
      if (gameType === 'pd') {
        data = await api('/api/prisoners/start', { player1_model: p1, player2_model: p2, rounds: 8 });
        setSessionId(data.session_id);
        setStatus(`Round 1 of ${data.rounds_total}`);
      } else if (gameType === 'tq') {
        data = await api('/api/twenty-questions/start', { answerer_model: p1, questioner_model: p2, max_questions: 20 });
        setSessionId(data.session_id);
        setStatus('Generating first question...');
      } else {
        data = await api('/api/code-debug/start', { player1_model: p1, player2_model: p2, challenge_index: 0 });
        setSessionId(data.session_id);
        setChallenge(data.challenge || null);
        setStatus('Models are analyzing the code...');
      }
    } catch (e) {
      setStatus('Connecting…');
      setTimeout(() => { if (mountedRef.current) performSessionStart(); }, 1200);
    } finally {
      setBusy(false);
      setStartingSession(false);
    }
  };

  const step = async () => {
    if (!sessionId || !mountedRef.current) return;
    setBusy(true);
    try {
      let data;
      if (gameType === 'pd') {
        data = await api(`/api/prisoners/${sessionId}/step`);
        if (!mountedRef.current) return;
        if (data.round) setRounds((prev) => [...prev, data.round]);
        if (data.scores) setScores(data.scores);
        if (data.done) {
          setDone(true);
          setStatus('Match complete.');
        } else {
          setStatus(`Round ${(data.round_index || rounds.length + 1) + 1} of 8`);
        }
      } else if (gameType === 'tq') {
        data = await api(`/api/twenty-questions/${sessionId}/step`);
        if (!mountedRef.current) return;
        if (data.exchange) {
          const exchange = {
            question: data.exchange.question || data.exchange.q || '',
            answer: data.exchange.answer || data.exchange.a || '',
            guess: data.exchange.guess || data.guess || '',
          };
          setTranscript((prev) => [...prev, exchange]);
        }
        if (data.done || data.guessed) {
          setDone(true);
          if (data.outcome === 'win' || data.guessed) setStatus(`Correct guess! Secret: ${data.secret || 'hidden'}`);
          else if (data.outcome === 'loss') setStatus(`Wrong final guess. Secret: ${data.secret || 'hidden'}`);
          else setStatus(`Out of questions. Secret: ${data.secret || 'hidden'}`);
        } else {
          setStatus(`Question ${data.count || transcript.length + 1} / 20`);
        }
      } else {
        data = await api(`/api/code-debug/${sessionId}/run`);
        if (!mountedRef.current) return;
        setSubmissions(data.submissions || data);
        setDone(true);
        setStatus('Match complete.');
      }
    } catch (e) {
      if (mountedRef.current) {
        setStatus('Resuming…');
        setTimeout(() => { if (mountedRef.current && !done) step(); }, 1200);
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const handleHeroStart = () => {
    if (gameType === 'tq') return;
    setPendingStartAfterCountdown(true);
    startCountdown();
  };

  const resetGame = () => {
    setSessionId(null);
    setDone(false);
    setStatus('');
    setRounds([]);
    setTranscript([]);
    setSubmissions(null);
    setChallenge(null);
    setScores(null);
    setPendingStartAfterCountdown(false);
    if (gameType === 'tq') startCountdown();
    else goToSetup();
  };

  // 20Q: auto-start session after countdown
  useEffect(() => {
    if (gameType !== 'tq' || isCountdown || sessionId || busy || done || startingSession) return;
    performSessionStart();
  }, [gameType, isCountdown, sessionId, busy, done, startingSession]);

  // 20Q: auto-step loop
  useEffect(() => {
    if (gameType !== 'tq' || !sessionId || done || busy) return;
    const timer = setTimeout(() => { step(); }, 650);
    return () => clearTimeout(timer);
  }, [gameType, sessionId, done, busy, transcript.length]);

  // PD: auto-step loop after session starts
  useEffect(() => {
    if (gameType !== 'pd' || !sessionId || done || busy) return;
    const timer = setTimeout(() => { step(); }, 900);
    return () => clearTimeout(timer);
  }, [gameType, sessionId, done, busy, rounds.length]);

  // CD: auto-run after session starts
  useEffect(() => {
    if (gameType !== 'cd' || !sessionId || done || busy) return;
    const timer = setTimeout(() => { step(); }, 600);
    return () => clearTimeout(timer);
  }, [gameType, sessionId, done, busy]);

  const renderHeroStart = () => (
    <div className="bench-hero">
      <h1 className="bench-hero-title">{config.title}</h1>
      <p className="bench-hero-subtitle">{config.subtitle}</p>
      <div className="bench-hero-matchup">
        <span className="bench-hero-p1">{p1Name}</span>
        <span className="bench-hero-vs">VS</span>
        <span className="bench-hero-p2">{p2Name}</span>
      </div>
      <button
        className="bench-hero-btn"
        disabled={busy || startingSession}
        onClick={handleHeroStart}
      >
        {busy ? 'Setting up...' : config.heroAction}
      </button>
    </div>
  );

  const renderPD = () => (
    <div className="bench-game-body">
      {rounds.length > 0 && (
        <div className="bench-rounds-table">
          <div className="bench-rounds-header">
            <span className="bench-col-round">Round</span>
            <span className="bench-col-choice">{p1Name}</span>
            <span className="bench-col-choice">{p2Name}</span>
            <span className="bench-col-pts">Pts</span>
          </div>
          {rounds.map((r, i) => (
            <div key={i} className="bench-rounds-row bench-row-enter">
              <span className="bench-col-round">{i + 1}</span>
              <span className="bench-col-choice">
                <span className="bench-choice-badge" style={{ background: CHOICE_COLORS[r.p1] || '#333' }}>
                  {r.p1 === 'C' ? 'COOPERATE' : 'DEFECT'}
                </span>
              </span>
              <span className="bench-col-choice">
                <span className="bench-choice-badge" style={{ background: CHOICE_COLORS[r.p2] || '#333' }}>
                  {r.p2 === 'C' ? 'COOPERATE' : 'DEFECT'}
                </span>
              </span>
              <span className="bench-col-pts">{r.payoff?.[0]},{r.payoff?.[1]}</span>
            </div>
          ))}
        </div>
      )}
      {rounds.length === 0 && !done && (
        <p className="bench-waiting-msg">Waiting for first round...</p>
      )}
      {scores && (
        <div className="bench-score-bar">
          <div className="bench-score-item"><span className="bench-score-label">{p1Name}</span><span className="bench-score-val">{scores[0]}</span></div>
          <div className="bench-score-item"><span className="bench-score-label">{p2Name}</span><span className="bench-score-val">{scores[1]}</span></div>
        </div>
      )}
    </div>
  );

  const renderTQ = () => (
    <div className="bench-game-body">
      <div className="bench-game-desc">
        Questions used: {transcript.length} / 20
      </div>
      {transcript.length > 0 && (
        <div className="bench-transcript">
          {transcript.map((ex, i) => (
            <div key={i} className="bench-exchange bench-row-enter">
              <div className="bench-q"><span className="bench-q-num">Q{i + 1}</span> {ex.question}</div>
              <div className="bench-a">{ex.answer}</div>
              {ex.guess && <div className="bench-guess">Guess: <strong>{ex.guess}</strong></div>}
            </div>
          ))}
        </div>
      )}
      {transcript.length === 0 && (
        <p className="bench-waiting-msg">Generating first question...</p>
      )}
    </div>
  );

  const renderCD = () => (
    <div className="bench-game-body">
      {challenge && !submissions && (
        <div className="bench-code-block">
          <div className="bench-code-label">Buggy code</div>
          <pre className="bench-code">{challenge.broken}</pre>
          {challenge.hint && <p className="bench-code-hint">Hint: {challenge.hint}</p>}
          <p className="bench-waiting-msg">Models are writing their fixes...</p>
        </div>
      )}
      {submissions && (
        <div className="bench-submissions">
          {Object.entries(submissions).map(([key, val]) => (
            <div key={key} className="bench-submission-card bench-row-enter">
              <div className="bench-submission-header">{key === 'player1' || key === 'model1' ? p1Name : key === 'player2' || key === 'model2' ? p2Name : key}</div>
              <pre className="bench-code">{typeof val === 'object' ? (val.code || JSON.stringify(val, null, 2)) : val}</pre>
              {typeof val === 'object' && val.score != null && (
                <div className="bench-submission-score">Score: <strong>{val.score}</strong></div>
              )}
            </div>
          ))}
        </div>
      )}
      {!challenge && !submissions && (
        <p className="bench-waiting-msg">Loading challenge...</p>
      )}
    </div>
  );

  return (
    <GameLayout
      gameName={config.title}
      player1Name={p1Name}
      player2Name={p2Name}
      onBack={onBack}
      statusText={status}
    >
      {isCountdown && (
        <GameCountdown
          player1Name={p1Name}
          player2Name={p2Name}
          onComplete={async () => {
            startRunning();
            if (pendingStartAfterCountdown) {
              setPendingStartAfterCountdown(false);
              await performSessionStart();
            }
          }}
        />
      )}

      {isSetup && gameType !== 'tq' && renderHeroStart()}

      {isRunning && (
        <div className="bench-game-container">
          <p className="bench-game-desc">{config.description}</p>
          {gameType === 'pd' && renderPD()}
          {gameType === 'tq' && renderTQ()}
          {gameType === 'cd' && renderCD()}
          {done && (
            <div className="bench-game-actions">
              <button className="bench-btn bench-btn-secondary" onClick={resetGame}>
                Play again
              </button>
            </div>
          )}
        </div>
      )}

      {!isSetup && !isRunning && !isCountdown && gameType === 'tq' && (
        <div className="bench-game-container">
          <p className="bench-game-desc">{config.description}</p>
          {renderTQ()}
          {done && (
            <div className="bench-game-actions">
              <button className="bench-btn bench-btn-secondary" onClick={resetGame}>
                Play again
              </button>
            </div>
          )}
        </div>
      )}
    </GameLayout>
  );
};

export default BenchmarkGame;
