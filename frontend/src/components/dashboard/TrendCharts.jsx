import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

const COLORS = ['#ffcc00', '#538d4e', '#b59f3b', '#6366f1', '#a78bfa'];

const tooltipStyle = {
  background: '#000',
  border: '2px solid #333',
  fontFamily: "'VT323', monospace",
  color: '#fff',
};

const TrendCharts = ({ trends, loading, error }) => {
  const runsChart = useMemo(() => (trends?.runs_per_day || []).map((d) => ({
    day: d.day,
    runs: d.runs,
  })), [trends]);

  const eloChart = useMemo(() => {
    const byDay = {};
    (trends?.elo_trends || []).forEach((series) => {
      const name = series.model?.display_name || series.model?.model_id;
      (series.points || []).forEach((pt) => {
        if (!byDay[pt.day]) byDay[pt.day] = { day: pt.day };
        byDay[pt.day][name] = pt.rating;
      });
    });
    return Object.values(byDay).sort((a, b) => String(a.day).localeCompare(String(b.day)));
  }, [trends]);

  const eloKeys = useMemo(() => {
    const keys = new Set();
    eloChart.forEach((row) => {
      Object.keys(row).forEach((k) => { if (k !== 'day') keys.add(k); });
    });
    return [...keys];
  }, [eloChart]);

  if (error) {
    return (
      <div className="dashboard-card dashboard-full-span">
        <h2>Trends</h2>
        <p className="dashboard-error">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="dashboard-card dashboard-full-span">
        <h2>Trends</h2>
        <p className="dashboard-muted">Loading trends…</p>
      </div>
    );
  }

  return (
    <div className="dashboard-card dashboard-full-span">
      <h2>Trends</h2>
      <div className="dashboard-trends-row">
        <div>
          <h3 className="dashboard-subhead">Runs per day</h3>
          <div className="dashboard-chart-wrap dashboard-chart-sm">
            {runsChart.length ? (
              <ResponsiveContainer>
                <BarChart data={runsChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                  <XAxis dataKey="day" stroke="#444" tick={{ fill: '#666', fontFamily: "'VT323', monospace", fontSize: 12 }} />
                  <YAxis stroke="#444" tick={{ fill: '#666', fontFamily: "'VT323', monospace", fontSize: 12 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="runs" fill="#ffcc00" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="dashboard-muted">No recent runs.</p>
            )}
          </div>
        </div>
        <div>
          <h3 className="dashboard-subhead">Elo over time (top models)</h3>
          <div className="dashboard-chart-wrap dashboard-chart-sm">
            {eloChart.length ? (
              <ResponsiveContainer>
                <LineChart data={eloChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                  <XAxis dataKey="day" stroke="#444" tick={{ fill: '#666', fontFamily: "'VT323', monospace", fontSize: 12 }} />
                  <YAxis domain={['auto', 'auto']} stroke="#444" tick={{ fill: '#666', fontFamily: "'VT323', monospace", fontSize: 12 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontFamily: "'VT323', monospace", color: '#888' }} />
                  {eloKeys.map((k, i) => (
                    <Line key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="dashboard-muted">Play finished games to see Elo trends.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrendCharts;
