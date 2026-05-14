import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackendUrl } from '../utils/networkUtils';
import Leaderboard from '../components/dashboard/Leaderboard';
import ModelComparison from '../components/dashboard/ModelComparison';
import RunHistory from '../components/dashboard/RunHistory';
import './Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const base = getBackendUrl();
  const [scope, setScope] = useState('overall');
  const [lbRows, setLbRows] = useState([]);
  const [runs, setRuns] = useState([]);
  const [aggregates, setAggregates] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [lb, r, ag, m] = await Promise.all([
        fetch(`${base}/api/benchmark/leaderboard?scope=${encodeURIComponent(scope)}`).then((x) => x.json()),
        fetch(`${base}/api/benchmark/runs?limit=40`).then((x) => x.json()),
        fetch(`${base}/api/benchmark/stats/models`).then((x) => x.json()),
        fetch(`${base}/api/benchmark/metrics/summary`).then((x) => x.json()),
      ]);
      setLbRows(lb.rows || []);
      setRuns(r.runs || []);
      setAggregates(ag.aggregates || []);
      setMetrics(m);
    } catch (e) {
      setErr(String(e.message || e));
    }
  }, [base, scope]);

  useEffect(() => {
    load();
  }, [load]);

  const openRun = async (id) => {
    try {
      const res = await fetch(`${base}/api/benchmark/runs/${id}`);
      setDetail(await res.json());
    } catch (e) {
      setErr(String(e.message || e));
    }
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-top">
        <div>
          <div className="dashboard-title">Analytics</div>
          <p className="dashboard-muted">Elo ratings, run history, and aggregate stats</p>
        </div>
        <div className="dashboard-actions">
          <button type="button" className="dashboard-btn" onClick={() => navigate('/')}>
            Home
          </button>
          <button type="button" className="dashboard-btn" onClick={() => navigate('/games')}>
            Arena
          </button>
          <button type="button" className="dashboard-btn" onClick={() => window.open(`${base}/api/benchmark/export/runs.csv`, '_blank')}>
            CSV
          </button>
          <button type="button" className="dashboard-btn" onClick={() => window.open(`${base}/api/benchmark/export/runs.json`, '_blank')}>
            JSON
          </button>
          <button type="button" className="dashboard-btn" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      {err && <p style={{ color: '#ff4444', marginBottom: 16 }}>{err}</p>}

      {metrics?.moves && (
        <div className="dashboard-card" style={{ marginBottom: 20 }}>
          <h2>Move metrics</h2>
          <div className="metrics-row" style={{ marginTop: 12 }}>
            <div className="metrics-pill">
              <span>Moves logged</span>
              <strong>{metrics.moves.moves}</strong>
            </div>
            <div className="metrics-pill">
              <span>Avg latency (ms)</span>
              <strong>{metrics.moves.avg_latency_ms?.toFixed?.(1) ?? '—'}</strong>
            </div>
            <div className="metrics-pill">
              <span>Avg cost (USD)</span>
              <strong>{metrics.moves.avg_cost_usd?.toFixed?.(6) ?? '—'}</strong>
            </div>
            <div className="metrics-pill">
              <span>Move errors</span>
              <strong>{metrics.moves.errors}</strong>
            </div>
            <div className="metrics-pill">
              <span>Finished runs</span>
              <strong>{metrics.finished_runs}</strong>
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        <Leaderboard scope={scope} rows={lbRows} onScopeChange={setScope} />
        <ModelComparison aggregates={aggregates} />
        <div style={{ gridColumn: '1 / -1' }}>
          <RunHistory runs={runs} onSelectRun={openRun} />
        </div>
      </div>

      {detail && (
        <div className="drawer" role="presentation" onClick={() => setDetail(null)}>
          <div className="drawer-panel" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dashboard-card-header">
              <h2>Run details</h2>
              <button type="button" className="dashboard-btn" onClick={() => setDetail(null)}>
                Close
              </button>
            </div>
            <pre>{JSON.stringify(detail, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
