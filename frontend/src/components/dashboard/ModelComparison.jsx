import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

const COLORS = ['#a78bfa', '#34d399', '#fbbf24', '#60a5fa', '#f472b6', '#94a3b8'];

const ModelComparison = ({ aggregates }) => {
  const chartData = useMemo(() => {
    const byModel = {};
    (aggregates || []).forEach((row) => {
      const m = row.model;
      if (!byModel[m]) byModel[m] = { model: m, games: 0, wins: 0 };
      byModel[m].games += row.games || 0;
      byModel[m].wins += row.wins || 0;
    });
    return Object.values(byModel)
      .map((x) => ({
        model: x.model.length > 18 ? `${x.model.slice(0, 16)}…` : x.model,
        fullModel: x.model,
        winrate: x.games ? Math.round((100 * x.wins) / x.games) : 0,
        games: x.games,
      }))
      .sort((a, b) => b.winrate - a.winrate)
      .slice(0, 10);
  }, [aggregates]);

  if (!chartData.length) {
    return (
      <div className="dashboard-card">
        <h2>Win rate by model</h2>
        <p className="dashboard-muted">Play finished benchmark games to populate aggregates.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-card">
      <h2>Win rate by model</h2>
      <p className="dashboard-muted small">From finished runs across game types (combined P1/P2 slots).</p>
      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis type="number" domain={[0, 100]} stroke="#9ca3af" />
            <YAxis type="category" dataKey="model" width={120} stroke="#9ca3af" tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v, _n, props) => [`${v}%`, 'Win rate']}
              labelFormatter={(_, p) => p?.payload?.fullModel}
              contentStyle={{ background: '#111', border: '1px solid #333' }}
            />
            <Bar dataKey="winrate" radius={[0, 4, 4, 0]}>
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
