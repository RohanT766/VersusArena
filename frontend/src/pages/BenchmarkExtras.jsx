import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackendUrl } from '../utils/networkUtils';

const tabs = [
  { id: 'pd', label: "Prisoner's Dilemma" },
  { id: 'tq', label: '20 Questions' },
  { id: 'cd', label: 'Code debug' },
];

export default function BenchmarkExtras() {
  const navigate = useNavigate();
  const base = getBackendUrl();
  const [tab, setTab] = useState('pd');
  const [log, setLog] = useState('');
  const [busy, setBusy] = useState(false);

  const p1 = JSON.parse(sessionStorage.getItem('player1Model') || '{}').id || 'gpt-5.5';
  const p2 = JSON.parse(sessionStorage.getItem('player2Model') || '{}').id || 'claude-sonnet-4-6';

  const [pdId, setPdId] = useState('');
  const [tqId, setTqId] = useState('');
  const [cdId, setCdId] = useState('');

  useEffect(() => {
    setLog('');
  }, [tab]);

  const append = (obj) => {
    setLog((prev) => `${prev}\n${JSON.stringify(obj, null, 2)}`);
  };

  const startPd = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${base}/api/prisoners/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player1_model: p1, player2_model: p2, rounds: 8 }),
      });
      const data = await r.json();
      setPdId(data.session_id);
      append(data);
    } catch (e) {
      append({ error: String(e.message || e) });
    } finally {
      setBusy(false);
    }
  };

  const stepPd = async () => {
    if (!pdId) return;
    setBusy(true);
    try {
      const r = await fetch(`${base}/api/prisoners/${pdId}/step`, { method: 'POST' });
      const data = await r.json();
      append(data);
    } catch (e) {
      append({ error: String(e.message || e) });
    } finally {
      setBusy(false);
    }
  };

  const startTq = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${base}/api/twenty-questions/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answerer_model: p1, questioner_model: p2, max_questions: 20 }),
      });
      const data = await r.json();
      setTqId(data.session_id);
      append(data);
    } catch (e) {
      append({ error: String(e.message || e) });
    } finally {
      setBusy(false);
    }
  };

  const stepTq = async () => {
    if (!tqId) return;
    setBusy(true);
    try {
      const r = await fetch(`${base}/api/twenty-questions/${tqId}/step`, { method: 'POST' });
      const data = await r.json();
      append(data);
    } catch (e) {
      append({ error: String(e.message || e) });
    } finally {
      setBusy(false);
    }
  };

  const startCd = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${base}/api/code-debug/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player1_model: p1, player2_model: p2, challenge_index: 0 }),
      });
      const data = await r.json();
      setCdId(data.session_id);
      append(data);
    } catch (e) {
      append({ error: String(e.message || e) });
    } finally {
      setBusy(false);
    }
  };

  const runCd = async () => {
    if (!cdId) return;
    setBusy(true);
    try {
      const r = await fetch(`${base}/api/code-debug/${cdId}/run`, { method: 'POST' });
      const data = await r.json();
      append(data);
    } catch (e) {
      append({ error: String(e.message || e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#eee', padding: 24, fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Extra benchmarks</h1>
        <button type="button" onClick={() => navigate('/games')} style={{ padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>
          Back to arena
        </button>
      </div>
      <p style={{ color: '#9ca3af', maxWidth: 720 }}>
        Uses models from model selection ({p1} vs {p2}). Each action calls the Versus API and logs JSON (LLM calls may take time).
      </p>

      <div style={{ display: 'flex', gap: 8, margin: '20px 0', flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: tab === t.id ? '2px solid #a78bfa' : '1px solid #333',
              background: tab === t.id ? '#1f1635' : '#111',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pd' && (
        <div>
          <button type="button" disabled={busy} onClick={startPd} style={{ marginRight: 8, padding: '8px 14px' }}>
            Start session
          </button>
          <button type="button" disabled={busy || !pdId} onClick={stepPd} style={{ padding: '8px 14px' }}>
            Play one round
          </button>
          <p style={{ color: '#888', fontSize: 14 }}>Session: {pdId || '—'}</p>
        </div>
      )}

      {tab === 'tq' && (
        <div>
          <button type="button" disabled={busy} onClick={startTq} style={{ marginRight: 8, padding: '8px 14px' }}>
            Start session
          </button>
          <button type="button" disabled={busy || !tqId} onClick={stepTq} style={{ padding: '8px 14px' }}>
            Play one exchange
          </button>
          <p style={{ color: '#888', fontSize: 14 }}>Session: {tqId || '—'}</p>
        </div>
      )}

      {tab === 'cd' && (
        <div>
          <button type="button" disabled={busy} onClick={startCd} style={{ marginRight: 8, padding: '8px 14px' }}>
            Start challenge
          </button>
          <button type="button" disabled={busy || !cdId} onClick={runCd} style={{ padding: '8px 14px' }}>
            Run both models
          </button>
          <p style={{ color: '#888', fontSize: 14 }}>Session: {cdId || '—'}</p>
        </div>
      )}

      <h3 style={{ marginTop: 24 }}>Log</h3>
      <pre
        style={{
          background: '#020617',
          padding: 16,
          borderRadius: 8,
          overflow: 'auto',
          maxHeight: '50vh',
          fontSize: 12,
          border: '1px solid #1e293b',
        }}
      >
        {log || '…'}
      </pre>
    </div>
  );
}
