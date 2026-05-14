import React from 'react';

const QualityMetrics = ({ quality, loading, error }) => {
  if (error) {
    return (
      <div className="dashboard-card">
        <h2>Quality metrics</h2>
        <p className="dashboard-error">{error}</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="dashboard-card">
        <h2>Quality metrics</h2>
        <p className="dashboard-muted">Loading…</p>
      </div>
    );
  }

  const byModel = quality?.by_model || [];
  const byGame = quality?.by_game || [];

  return (
    <div className="dashboard-card dashboard-full-span">
      <h2>Quality metrics</h2>
      <div className="dashboard-quality-grid">
        <div>
          <h3 className="dashboard-subhead">By model</h3>
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Moves</th>
                  <th>Latency</th>
                  <th>Cost</th>
                  <th>Correctness</th>
                  <th>Error %</th>
                </tr>
              </thead>
              <tbody>
                {byModel.map((r) => (
                  <tr key={r.model_id}>
                    <td>{r.display_name}</td>
                    <td>{r.moves}</td>
                    <td>{r.avg_latency_ms}ms</td>
                    <td>{r.avg_cost_usd}</td>
                    <td>{r.avg_correctness}</td>
                    <td>{r.error_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!byModel.length && <p className="dashboard-muted">No model quality data.</p>}
          </div>
        </div>
        <div>
          <h3 className="dashboard-subhead">By game</h3>
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Moves</th>
                  <th>Latency</th>
                  <th>Cost</th>
                  <th>Correctness</th>
                </tr>
              </thead>
              <tbody>
                {byGame.map((r) => (
                  <tr key={r.game_type}>
                    <td>{r.game_type}</td>
                    <td>{r.moves}</td>
                    <td>{r.avg_latency_ms}ms</td>
                    <td>{r.avg_cost_usd}</td>
                    <td>{r.avg_correctness}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!byGame.length && <p className="dashboard-muted">No game quality data.</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QualityMetrics;
