import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

const COLORS = ['#ffcc00', '#538d4e', '#b59f3b', '#6366f1', '#a78bfa', '#888'];

const ModelComparison = ({ models, loading, error }) => {
  const chartData = useMemo(() => (
    (models || [])
      .map((m) => ({
        model: (m.display_name || m.model_id || 'Unknown').length > 16
          ? `${(m.display_name || m.model_id).slice(0, 14)}…`
          : (m.display_name || m.model_id),
        fullModel: m.display_name || m.model_id,
        winrate: m.win_pct ?? 0,
        rating: m.rating ?? 0,
        games: m.games_played ?? 0,
      }))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 12)
  ), [models]);

  if (error) {
    return (
      <div className="dashboard-card">
        <h2>Model performance</h2>
        <p className="dashboard-error">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="dashboard-card">
        <h2>Model performance</h2>
        <p className="dashboard-muted">Loading…</p>
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="dashboard-card">
        <h2>Model performance</h2>
        <p className="dashboard-muted">Play finished games to populate data.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-card">
      <h2>Model performance</h2>
      <p className="dashboard-muted small">Win rate by Elo scope (finished runs only).</p>
      <div className="dashboard-table-wrap dashboard-mb">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Elo</th>
              <th>Games</th>
              <th>Win %</th>
              <th>Avg dur (s)</th>
            </tr>
          </thead>
          <tbody>
            {(models || []).map((m) => (
              <tr key={m.model_id}>
                <td>{m.display_name || m.model_id}</td>
                <td>{Number(m.rating).toFixed(0)}</td>
                <td>{m.games_played}</td>
                <td>{m.win_pct}%</td>
                <td>{m.avg_duration_sec ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dashboard-chart-wrap">
        <ResponsiveContainer>
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
            <XAxis type="number" domain={[0, 100]} stroke="#444" tick={{ fill: '#666', fontFamily: "'VT323', monospace", fontSize: 14 }} />
            <YAxis type="category" dataKey="model" width={120} stroke="#444" tick={{ fill: '#999', fontFamily: "'VT323', monospace", fontSize: 14 }} />
            <Tooltip
              formatter={(v) => [`${v}%`, 'Win rate']}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.fullModel || ''}
              contentStyle={{ background: '#000', border: '2px solid #333', fontFamily: "'VT323', monospace", color: '#fff' }}
              labelStyle={{ color: '#ffcc00' }}
            />
            <Bar dataKey="winrate" radius={[0, 0, 0, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ModelComparison;
