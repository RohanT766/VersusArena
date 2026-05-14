import React from 'react';

const HeadToHead = ({ pairs }) => {
  if (!pairs?.length) {
    return (
      <div className="dashboard-card">
        <h2>Head-to-head</h2>
        <p className="dashboard-muted">No matchup data yet.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-card dashboard-full-span">
      <h2>Head-to-head</h2>
      <p className="dashboard-muted small">Model-vs-model outcomes from finished runs.</p>
      <div className="dashboard-table-wrap">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Matchup</th>
              <th>Games</th>
              <th>A wins</th>
              <th>B wins</th>
              <th>Draws</th>
              <th>A win %</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => (
              <tr key={`${p.model_a.model_id}-${p.model_b.model_id}`}>
                <td>
                  {p.model_a.display_name} <span className="dashboard-vs">vs</span> {p.model_b.display_name}
                </td>
                <td>{p.games}</td>
                <td>{p.model_a_wins}</td>
                <td>{p.model_b_wins}</td>
                <td>{p.draws}</td>
                <td>{p.model_a_win_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HeadToHead;
