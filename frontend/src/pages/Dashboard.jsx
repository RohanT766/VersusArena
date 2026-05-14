import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackendUrl } from '../utils/networkUtils';
import Leaderboard from '../components/dashboard/Leaderboard';
import ModelComparison from '../components/dashboard/ModelComparison';
import RunHistory from '../components/dashboard/RunHistory';
import OverviewKpis from '../components/dashboard/OverviewKpis';
import HeadToHead from '../components/dashboard/HeadToHead';
import QualityMetrics from '../components/dashboard/QualityMetrics';
import TrendCharts from '../components/dashboard/TrendCharts';
import './Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const base = getBackendUrl();
  const [scope, setScope] = useState('overall');
  const [lbRows, setLbRows] = useState([]);
  const [runs, setRuns] = useState([]);
  const [overview, setOverview] = useState(null);
  const [models, setModels] = useState([]);
  const [headToHead, setHeadToHead] = useState([]);
  const [quality, setQuality] = useState(null);
  const [trends, setTrends] = useState(null);
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sectionErrors, setSectionErrors] = useState({});

  const fetchJson = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  };

  const load = useCallback(async () => {
    setLoading(true);
    const errors = {};
    const safe = async (key, fn) => {
      try {
        return await fn();
      } catch (e) {
        errors[key] = String(e.message || e);
        return null;
      }
    };

    const [lb, r, ov, perf, h2h, qual, tr] = await Promise.all([
      safe('leaderboard', () => fetchJson(`${base}/api/benchmark/leaderboard?scope=${encodeURIComponent(scope)}`)),
      safe('runs', () => fetchJson(`${base}/api/benchmark/runs?limit=50`)),
      safe('overview', () => fetchJson(`${base}/api/benchmark/analytics/overview`)),
      safe('performance', () => fetchJson(`${base}/api/benchmark/analytics/model-performance?scope=${encodeURIComponent(scope)}`)),
      safe('headToHead', () => fetchJson(`${base}/api/benchmark/analytics/head-to-head?limit=25`)),
      safe('quality', () => fetchJson(`${base}/api/benchmark/analytics/quality`)),
      safe('trends', () => fetchJson(`${base}/api/benchmark/analytics/trends?days=14`)),
    ]);

    setLbRows(lb?.rows || []);
    setRuns(r?.runs || []);
    setOverview(ov);
    setModels(perf?.models || []);
    setHeadToHead(h2h?.pairs || []);
    setQuality(qual);
    setTrends(tr);
    setSectionErrors(errors);
    setLoading(false);
  }, [base, scope]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    document.body.classList.add('dashboard-scroll-body');
    return () => document.body.classList.remove('dashboard-scroll-body');
  }, []);

  const openRun = async (id) => {
    try {
      const res = await fetch(`${base}/api/benchmark/runs/${id}`);
      setDetail(await res.json());
    } catch (e) {
      setToast({ type: 'error', message: String(e.message || e) });
    }
  };

  const deleteRun = async (id) => {
    setDeletingId(id);
    try {
      const res = await fetch(`${base}/api/benchmark/runs/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      const data = await res.json();
      setToast({ type: 'success', message: `Run deleted. Elo rebuilt at ${new Date((data.recalculated_at || 0) * 1000).toLocaleTimeString()}.` });
      await load();
      if (detail?.run?.id === id) setDetail(null);
    } catch (e) {
      setToast({ type: 'error', message: String(e.message || e) });
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="dashboard-page">
      <div className="dashboard-top">
        <div>
          <div className="dashboard-title">Analytics</div>
          <p className="dashboard-muted">Benchmark overview, Elo, matchups, quality, and run history</p>
        </div>
        <div className="dashboard-actions">
          <button type="button" className="dashboard-btn" onClick={() => navigate('/')}>Home</button>
          <button type="button" className="dashboard-btn" onClick={() => navigate('/games')}>Arena</button>
          <button type="button" className="dashboard-btn" onClick={() => window.open(`${base}/api/benchmark/export/runs.csv`, '_blank')}>CSV</button>
          <button type="button" className="dashboard-btn" onClick={() => window.open(`${base}/api/benchmark/export/runs.json`, '_blank')}>JSON</button>
          <button type="button" className="dashboard-btn" onClick={load}>Refresh</button>
        </div>
      </div>

      {toast && (
        <div className={`dashboard-toast dashboard-toast-${toast.type}`} role="status">
          {toast.message}
        </div>
      )}

      <OverviewKpis overview={overview} loading={loading} error={sectionErrors.overview} />

      <div className="dashboard-grid">
        <Leaderboard
          scope={scope}
          rows={lbRows}
          onScopeChange={setScope}
          loading={loading}
          error={sectionErrors.leaderboard}
        />
        <ModelComparison
          models={models}
          loading={loading}
          error={sectionErrors.performance}
        />
        <HeadToHead pairs={headToHead} />
        <QualityMetrics quality={quality} loading={loading} error={sectionErrors.quality} />
        <TrendCharts trends={trends} loading={loading} error={sectionErrors.trends} />
        <div className="dashboard-full-span">
          <RunHistory
            runs={runs}
            onSelectRun={openRun}
            onDeleteRun={deleteRun}
            deletingId={deletingId}
          />
        </div>
      </div>

      {detail && (
        <div className="drawer" role="presentation" onClick={() => setDetail(null)}>
          <div className="drawer-panel" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dashboard-card-header">
              <h2>Run details</h2>
              <button type="button" className="dashboard-btn" onClick={() => setDetail(null)}>Close</button>
            </div>
            <pre>{JSON.stringify(detail, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
