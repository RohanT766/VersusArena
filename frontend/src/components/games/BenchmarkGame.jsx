import React, { useEffect, useState } from 'react';
import GameLayout from '../common/GameLayout';
import GameCountdown from '../common/GameCountdown';
import { getDisplayName } from '../../utils/modelUtils';
import { getBackendUrl } from '../../utils/networkUtils';
import useGameFlow, { GAME_FLOW_PHASES } from '../../hooks/useGameFlow';
import './BenchmarkGame.css';

const GAME_CONFIG = {
  pd: {
    title: "Prisoner's Dilemma",
    description: 'Each round, both models choose to COOPERATE or DEFECT.',
    startLabel: 'Start Match',
    stepLabel: 'Play Round',
  },
  tq: {
    title: '20 Questions',
    description: 'One model thinks of a word; the other asks yes/no questions to guess it.',
    startLabel: 'Start Session',
    stepLabel: 'Next Question',
  },
  cd: {
    title: 'Code Debug',
    description: 'Both models try to fix the same buggy function. Scored against the correct solution.',
    startLabel: 'Start Match',
    stepLabel: 'Run Match',
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
  const [autoRunning, setAutoRunning] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [pendingStartAfterCountdown, setPendingStartAfterCountdown] = useState(false);
  const initialPhase = gameType === "tq" ? GAME_FLOW_PHASES.COUNTDOWN : GAME_FLOW_PHASES.SETUP;
  const { isSetup, isCountdown, isRunning, startRunning, startCountdown, goToSetup } = useGameFlow(initialPhase);

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
        setStatus(`Match started - ${data.rounds_total} rounds`);
      } else if (gameType === 'tq') {
        data = await api('/api/twenty-questions/start', { answerer_model: p1, questioner_model: p2, max_questions: 20 });
        setSessionId(data.session_id);
        setStatus('Match started - running up to 20 questions');
      } else {
        data = await api('/api/code-debug/start', { player1_model: p1, player2_model: p2, challenge_index: 0 });
        setSessionId(data.session_id);
        setChallenge(data.challenge || null);
        setStatus(`Challenge loaded: ${data.challenge?.title || 'Code Debug'}`);
      }
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setBusy(false);
      setStartingSession(false);
    }
  };

  const handleStart = async () => {
    if (gameType === "tq") return;
    setPendingStartAfterCountdown(true);
    startCountdown();
  };

  const step = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      let data;
      if (gameType === 'pd') {
        data = await api(`/api/prisoners/${sessionId}/step`);
        if (data.round) setRounds((prev) => [...prev, data.round]);
        if (data.scores) setScores(data.scores);
        if (data.done) { setDone(true); setStatus('Match complete.'); }
        else setStatus(`Round ${data.round_index || rounds.length + 1} complete`);
      } else if (gameType === 'tq') {
        data = await api(`/api/twenty-questions/${sessionId}/step`);
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
          setAutoRunning(false);
          if (data.outcome === 'win' || data.guessed) setStatus(`Correct guess! Secret: ${data.secret || 'hidden'}`);
          else if (data.outcome === 'loss') setStatus(`Wrong final guess. Secret: ${data.secret || 'hidden'}`);
          else setStatus(`Out of questions. Secret: ${data.secret || 'hidden'}`);
        } else {
          setStatus(`Question ${data.count || transcript.length + 1} / 20`);
        }
      } else {
        data = await api(`/api/code-debug/${sessionId}/run`);
        setSubmissions(data.submissions || data);
        setDone(true);
        setStatus('Match complete.');
      }
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (gameType !== 'tq' || isCountdown || sessionId || busy || done || startingSession) return;
    performSessionStart();
  }, [gameType, isCountdown, sessionId, busy, done, startingSession]);

  useEffect(() => {
    if (gameType !== 'tq' || !sessionId || done || busy || autoRunning) return;
    setAutoRunning(true);
    const timer = setTimeout(async () => {
      await step();
      setAutoRunning(false);
    }, 650);
    return () => clearTimeout(timer);
  }, [gameType, sessionId, done, busy, autoRunning, transcript.length]);

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
            <div key={i} className="bench-rounds-row">
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
            <div key={i} className="bench-exchange">
              <div className="bench-q"><span className="bench-q-num">Q{i + 1}</span> {ex.question}</div>
              <div className="bench-a">{ex.answer}</div>
              {ex.guess && <div className="bench-guess">Guess: <strong>{ex.guess}</strong></div>}
            </div>
          ))}
        </div>
      )}
      {transcript.length === 0 && (
        <p className="bench-game-desc">Generating first question...</p>
      )}
    </div>
  );

  const renderCD = () => (
    <div className="bench-game-body">
      {challenge && (
        <div className="bench-code-block">
          <div className="bench-code-label">Buggy code</div>
          <pre className="bench-code">{challenge.broken}</pre>
          {challenge.hint && <p className="bench-code-hint">Hint: {challenge.hint}</p>}
        </div>
      )}
      {submissions && (
        <div className="bench-submissions">
          {Object.entries(submissions).map(([key, val]) => (
            <div key={key} className="bench-submission-card">
              <div className="bench-submission-header">{key === 'player1' || key === 'model1' ? p1Name : key === 'player2' || key === 'model2' ? p2Name : key}</div>
              <pre className="bench-code">{typeof val === 'object' ? (val.code || JSON.stringify(val, null, 2)) : val}</pre>
              {typeof val === 'object' && val.score != null && (
                <div className="bench-submission-score">Score: <strong>{val.score}</strong></div>
              )}
            </div>
          ))}
        </div>
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
      <div className="bench-game-container">
        <p className="bench-game-desc">{config.description}</p>

        <div className="bench-game-actions">
          {isSetup && !sessionId && gameType !== 'tq' && (
            <button className="bench-btn bench-btn-primary" disabled={busy} onClick={handleStart}>
              {busy ? 'Starting...' : config.startLabel}
            </button>
          )}
          {isRunning && sessionId && !done && gameType !== 'tq' && (
            <button className="bench-btn bench-btn-primary" disabled={busy} onClick={step}>
              {busy ? 'Running...' : config.stepLabel}
            </button>
          )}
          {done && (
            <button className="bench-btn bench-btn-secondary" onClick={() => { setSessionId(null); setDone(false); setStatus(''); setRounds([]); setTranscript([]); setSubmissions(null); setPendingStartAfterCountdown(false); if (gameType === 'tq') startCountdown(); else goToSetup(); }}>
              Play again
            </button>
          )}
        </div>

        {gameType === 'pd' && renderPD()}
        {gameType === 'tq' && renderTQ()}
        {gameType === 'cd' && renderCD()}
      </div>
    </GameLayout>
  );
};

export default BenchmarkGame;
