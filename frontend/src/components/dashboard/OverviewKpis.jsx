import React from 'react';

const OverviewKpis = ({ overview, loading, error }) => {
  if (error) {
    return (
      <div className="dashboard-card dashboard-full-span">
        <h2>Overview</h2>
        <p className="dashboard-error">{error}</p>
      </div>
    );
  }
  if (loading || !overview) {
    return (
      <div className="dashboard-card dashboard-full-span">
        <h2>Overview</h2>
        <p className="dashboard-muted">Loading overview…</p>
      </div>
    );
  }

  const q = overview.quality || {};
  const pills = [
    { label: 'Total runs', value: overview.total_runs },
    { label: 'Finished', value: overview.finished_runs },
    { label: 'In progress', value: overview.in_progress_runs },
    { label: 'Errors / abandoned', value: overview.abandoned_or_error_runs },
    { label: 'Completion rate', value: `${overview.completion_rate}%` },
    { label: 'Median duration (s)', value: overview.median_duration_sec },
    { label: 'Unique models', value: overview.unique_models },
    { label: 'Avg latency (ms)', value: q.avg_latency_ms ?? '—' },
    { label: 'Avg correctness', value: q.avg_correctness ?? '—' },
    { label: 'Move errors', value: q.move_errors ?? 0 },
  ];

  return (
    <div className="dashboard-card dashboard-full-span">
      <h2>Overview</h2>
      <p className="dashboard-muted small">Finished runs drive Elo and win stats. In-progress and error runs are tracked separately.</p>
      <div className="metrics-row dashboard-metrics-row">
        {pills.map((p) => (
          <div key={p.label} className="metrics-pill">
            <span>{p.label}</span>
            <strong>{p.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OverviewKpis;
