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
        <p className="dashboard-muted">Loading…</p>
      </div>
    );
  }

  const q = overview.quality || {};
  const moves = q.moves || 0;
  const moveErrors = q.move_errors || 0;
  const errorRate = moves > 0 ? `${((100 * moveErrors) / moves).toFixed(1)}%` : '—';
  const correctness = q.avg_correctness != null
    ? `${(Number(q.avg_correctness) * 100).toFixed(1)}%`
    : '—';
  const cost = q.avg_cost_usd != null && q.avg_cost_usd > 0
    ? `$${Number(q.avg_cost_usd).toFixed(4)}`
    : '—';

  const pills = [
    { label: 'Finished runs', value: overview.finished_runs },
    { label: 'Completion rate', value: `${overview.completion_rate}%` },
    { label: 'In progress', value: overview.in_progress_runs },
    { label: 'Median duration (s)', value: overview.median_duration_sec },
    { label: 'Avg latency (ms)', value: q.avg_latency_ms ?? '—' },
    { label: 'Avg correctness', value: correctness },
    { label: 'Move error rate', value: errorRate },
    { label: 'Avg cost / move', value: cost },
  ];

  return (
    <div className="dashboard-card dashboard-full-span">
      <h2>Overview</h2>
      <p className="dashboard-muted small">Run health and agent performance on finished games.</p>
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
