import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

const COLORS = ['#ffcc00', '#538d4e', '#b59f3b', '#6366f1', '#a78bfa', '#888'];

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
        <p className="dashboard-muted">Play finished games to populate data.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-card">
      <h2>Win rate by model</h2>
      <p className="dashboard-muted small">Across all finished runs (combined P1/P2).</p>
      <div style={{ width: '100%', height: 320, marginTop: 12 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
            <XAxis type="number" domain={[0, 100]} stroke="#444" tick={{ fill: '#666', fontFamily: "'VT323', monospace", fontSize: 14 }} />
            <YAxis type="category" dataKey="model" width={120} stroke="#444" tick={{ fill: '#999', fontFamily: "'VT323', monospace", fontSize: 14 }} />
            <Tooltip
              formatter={(v) => [`${v}%`, 'Win rate']}
              labelFormatter={(_, p) => p?.[0]?.payload?.fullModel}
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
