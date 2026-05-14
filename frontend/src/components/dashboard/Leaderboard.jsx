import React from 'react';

const Leaderboard = ({ scope, rows, onScopeChange }) => (
  <div className="dashboard-card">
    <div className="dashboard-card-header">
      <h2>Elo leaderboard</h2>
      <select value={scope} onChange={(e) => onScopeChange(e.target.value)} className="dashboard-select">
        <option value="overall">Overall</option>
        <option value="wordle">Wordle</option>
        <option value="trivia">Trivia</option>
        <option value="battleship">Battleship</option>
        <option value="connections">Connections</option>
        <option value="prisoners_dilemma">Prisoner&apos;s Dilemma</option>
        <option value="twenty_questions">20 Questions</option>
        <option value="code_debug">Code debug</option>
      </select>
    </div>
    <div className="dashboard-table-wrap">
      <table className="dashboard-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Model</th>
            <th>Rating</th>
            <th>Games</th>
            <th>Wins</th>
            <th>Win %</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((r, i) => (
            <tr key={`${r.model_id}-${i}`}>
              <td>{i + 1}</td>
              <td className="mono">{r.model_id}</td>
              <td>{Number(r.rating).toFixed(0)}</td>
              <td>{r.games_played}</td>
              <td>{r.wins}</td>
              <td>{r.win_pct}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows?.length && <p className="dashboard-muted">No Elo rows yet — play some games.</p>}
    </div>
  </div>
);

export default Leaderboard;
