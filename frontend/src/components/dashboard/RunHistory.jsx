import React, { useState } from 'react';

const RunHistory = ({ runs, onSelectRun, onDeleteRun, deletingId }) => {
  const [filter, setFilter] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const q = filter.trim().toLowerCase();
  const filtered = (runs || []).filter(
    (r) =>
      !q ||
      (r.game_type || '').toLowerCase().includes(q) ||
      (r.player1_model || '').toLowerCase().includes(q) ||
      (r.player2_model || '').toLowerCase().includes(q) ||
      (r.id || '').toLowerCase().includes(q)
  );

  const handleDelete = async (id) => {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setConfirmId(null);
    await onDeleteRun(id);
  };

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
      {confirmId && (
        <div className="dashboard-delete-banner" role="alert">
          <strong>Irreversible:</strong> deleting a run removes all moves and results, then rebuilds Elo from remaining finished games.
          <button type="button" className="dashboard-linkbtn" onClick={() => setConfirmId(null)}>Cancel</button>
        </div>
      )}
      <div className="dashboard-table-wrap">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Game</th>
              <th>P1</th>
              <th>P2</th>
              <th>Status</th>
              <th>Started</th>
              <th>Actions</th>
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
                <td className="dashboard-actions-cell">
                  <button type="button" className="dashboard-linkbtn" onClick={() => onSelectRun(r.id)}>
                    Details
                  </button>
                  <button
                    type="button"
                    className={`dashboard-linkbtn dashboard-delete-btn ${confirmId === r.id ? 'confirm' : ''}`}
                    disabled={deletingId === r.id}
                    onClick={() => handleDelete(r.id)}
                  >
                    {deletingId === r.id ? 'Deleting…' : confirmId === r.id ? 'Confirm delete' : 'Delete'}
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
