import React, { useState } from 'react';

const RunHistory = ({ runs, onSelectRun }) => {
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  const filtered = (runs || []).filter(
    (r) =>
      !q ||
      (r.game_type || '').toLowerCase().includes(q) ||
      (r.player1_model || '').toLowerCase().includes(q) ||
      (r.player2_model || '').toLowerCase().includes(q) ||
      (r.id || '').toLowerCase().includes(q)
  );

  return (
    <div className="dashboard-card">
      <div className="dashboard-card-header">
        <h2>Run history</h2>
        <input
          className="dashboard-input"
          placeholder="Filter by game, model, id…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="dashboard-table-wrap">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Game</th>
              <th>P1</th>
              <th>P2</th>
              <th>Status</th>
              <th>Started</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>{r.game_type}</td>
                <td className="mono small">{r.player1_model}</td>
                <td className="mono small">{r.player2_model}</td>
                <td>{r.status}</td>
                <td className="small">{new Date((r.started_at || 0) * 1000).toLocaleString()}</td>
                <td>
                  <button type="button" className="dashboard-linkbtn" onClick={() => onSelectRun(r.id)}>
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="dashboard-muted">No runs match.</p>}
      </div>
    </div>
  );
};

export default RunHistory;
