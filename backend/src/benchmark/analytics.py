"""Analytics aggregation and Elo rebuild helpers."""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

from src.benchmark.elo import INITIAL_RATING, update_elo_pair
from src.db.database import get_connection

DISPLAY_NAMES: Dict[str, str] = {
    "gpt-5.5": "GPT-5.5",
    "gpt-5.4-mini": "GPT-5.4 Mini",
    "gpt-4o": "GPT-4o",
    "o4-mini": "o4-mini",
    "claude-opus-4-7": "Claude Opus 4.7",
    "claude-sonnet-4-6": "Claude Sonnet 4.6",
    "claude-haiku-4-5": "Claude Haiku 4.5",
    "claude-sonnet-4": "Claude Sonnet 4",
    "gemini-3.1-pro-preview": "Gemini 3.1 Pro",
    "gemini-2.5-pro": "Gemini 2.5 Pro",
    "gemini-2.5-flash": "Gemini 2.5 Flash",
}


def display_name(model_id: str) -> str:
    if not model_id or not str(model_id).strip():
        return "Unknown"
    if model_id in DISPLAY_NAMES:
        return DISPLAY_NAMES[model_id]
    for key, name in DISPLAY_NAMES.items():
        if key in model_id:
            return name
    return model_id


def model_payload(model_id: str) -> Dict[str, str]:
    mid = model_id or "unknown"
    return {"model_id": mid, "display_name": display_name(mid)}


def rebuild_elo_ratings(conn) -> None:
    """Recompute elo_ratings from all finished benchmark results in chronological order."""
    conn.execute("DELETE FROM elo_ratings")
    rows = conn.execute(
        """
        SELECT r.game_type, r.player1_model, r.player2_model, res.winner_side,
               COALESCE(r.ended_at, r.started_at) AS ts
        FROM benchmark_runs r
        JOIN benchmark_results res ON res.run_id = r.id
        WHERE r.status = 'finished' AND res.winner_side IS NOT NULL
        ORDER BY ts ASC
        """
    ).fetchall()

    ratings: Dict[Tuple[str, str], float] = {}
    stats: Dict[Tuple[str, str], Dict[str, Any]] = defaultdict(
        lambda: {"rating": float(INITIAL_RATING), "games_played": 0, "wins": 0}
    )

    def get_rating(model_id: str, scope: str) -> float:
        return ratings.get((model_id, scope), float(INITIAL_RATING))

    def set_rating(model_id: str, scope: str, rating: float) -> None:
        ratings[(model_id, scope)] = rating

    for row in rows:
        m1, m2 = row["player1_model"], row["player2_model"]
        gt = row["game_type"] or "overall"
        w = int(row["winner_side"] or 0)
        out_a = 0.5
        if w == 1:
            out_a = 1.0
        elif w == 2:
            out_a = 0.0

        for scope in (gt, "overall"):
            r1 = get_rating(m1, scope)
            r2 = get_rating(m2, scope)
            nr1, nr2 = update_elo_pair(r1, r2, out_a)
            set_rating(m1, scope, nr1)
            set_rating(m2, scope, nr2)
            stats[(m1, scope)]["games_played"] += 1
            stats[(m2, scope)]["games_played"] += 1
            stats[(m1, scope)]["rating"] = nr1
            stats[(m2, scope)]["rating"] = nr2
            if w == 1:
                stats[(m1, scope)]["wins"] += 1
            elif w == 2:
                stats[(m2, scope)]["wins"] += 1

    for (model_id, scope), data in stats.items():
        gp = data["games_played"]
        wins = data["wins"]
        conn.execute(
            """
            INSERT INTO elo_ratings (model_id, game_scope, rating, games_played, wins)
            VALUES (?,?,?,?,?)
            """,
            (model_id, scope, data["rating"], gp, wins),
        )


def fetch_overview(conn) -> Dict[str, Any]:
    row = conn.execute(
        """
        SELECT
            COUNT(*) AS total_runs,
            SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END) AS finished_runs,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_runs,
            SUM(CASE WHEN status NOT IN ('finished', 'in_progress') THEN 1 ELSE 0 END) AS other_status_runs
        FROM benchmark_runs
        """
    ).fetchone()
    total = int(row["total_runs"] or 0)
    finished = int(row["finished_runs"] or 0)
    in_prog = int(row["in_progress_runs"] or 0)
    other = int(row["other_status_runs"] or 0)

    dur_rows = conn.execute(
        """
        SELECT (ended_at - started_at) AS dur
        FROM benchmark_runs
        WHERE status = 'finished' AND ended_at IS NOT NULL
        """
    ).fetchall()
    durs = sorted(float(r["dur"]) for r in dur_rows if r["dur"] is not None)
    if durs:
        mid = len(durs) // 2
        median_duration = durs[mid] if len(durs) % 2 else (durs[mid - 1] + durs[mid]) / 2
    else:
        median_duration = 0.0

    move_row = conn.execute(
        """
        SELECT COUNT(*) AS moves,
               AVG(m.latency_ms) AS avg_latency_ms,
               AVG(m.cost_usd) AS avg_cost_usd,
               AVG(m.correctness) AS avg_correctness,
               SUM(CASE WHEN m.error IS NOT NULL AND TRIM(m.error) != '' THEN 1 ELSE 0 END) AS move_errors
        FROM benchmark_moves m
        JOIN benchmark_runs r ON r.id = m.run_id
        WHERE r.status = 'finished'
        """
    ).fetchone()

    unique_models = conn.execute(
        """
        SELECT COUNT(DISTINCT model) AS n FROM (
            SELECT player1_model AS model FROM benchmark_runs
            UNION
            SELECT player2_model AS model FROM benchmark_runs
        ) WHERE model IS NOT NULL AND TRIM(model) != ''
        """
    ).fetchone()

    return {
        "total_runs": total,
        "finished_runs": finished,
        "in_progress_runs": in_prog,
        "abandoned_or_error_runs": other,
        "completion_rate": round(100.0 * finished / total, 2) if total else 0,
        "median_duration_sec": round(median_duration, 2),
        "unique_models": int(unique_models["n"] or 0),
        "quality": {
            "moves": int(move_row["moves"] or 0),
            "avg_latency_ms": round(float(move_row["avg_latency_ms"] or 0), 1),
            "avg_cost_usd": float(move_row["avg_cost_usd"] or 0),
            "avg_correctness": round(float(move_row["avg_correctness"] or 0), 3),
            "move_errors": int(move_row["move_errors"] or 0),
        },
    }


def fetch_model_performance(conn, scope: str = "overall") -> List[Dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT model_id, rating, games_played, wins,
               CASE WHEN games_played > 0 THEN round(100.0 * wins / games_played, 2) ELSE 0 END AS win_pct
        FROM elo_ratings
        WHERE game_scope = ?
        ORDER BY rating DESC
        """,
        (scope,),
    ).fetchall()

    dur_by_model: Dict[str, List[float]] = defaultdict(list)
    if scope == "overall":
        dur_rows = conn.execute(
            """
            SELECT player1_model AS model, (ended_at - started_at) AS dur
            FROM benchmark_runs WHERE status = 'finished' AND ended_at IS NOT NULL
            UNION ALL
            SELECT player2_model AS model, (ended_at - started_at) AS dur
            FROM benchmark_runs WHERE status = 'finished' AND ended_at IS NOT NULL
            """
        ).fetchall()
    else:
        dur_rows = conn.execute(
            """
            SELECT player1_model AS model, (ended_at - started_at) AS dur
            FROM benchmark_runs
            WHERE status = 'finished' AND ended_at IS NOT NULL AND game_type = ?
            UNION ALL
            SELECT player2_model AS model, (ended_at - started_at) AS dur
            FROM benchmark_runs
            WHERE status = 'finished' AND ended_at IS NOT NULL AND game_type = ?
            """,
            (scope, scope),
        ).fetchall()
    for dr in dur_rows:
        if dr["dur"] is not None:
            dur_by_model[dr["model"]].append(float(dr["dur"]))

    result = []
    for r in rows:
        mid = r["model_id"]
        dlist = dur_by_model.get(mid, [])
        avg_dur = round(sum(dlist) / len(dlist), 1) if dlist else None
        result.append(
            {
                **model_payload(mid),
                "rating": round(float(r["rating"]), 1),
                "games_played": int(r["games_played"] or 0),
                "wins": int(r["wins"] or 0),
                "win_pct": float(r["win_pct"] or 0),
                "avg_duration_sec": avg_dur,
            }
        )
    return result


def fetch_head_to_head(conn, limit: int = 20) -> List[Dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT r.player1_model AS p1, r.player2_model AS p2, res.winner_side
        FROM benchmark_runs r
        JOIN benchmark_results res ON res.run_id = r.id
        WHERE r.status = 'finished' AND res.winner_side IN (0, 1, 2)
        """
    ).fetchall()

    pair_stats: Dict[Tuple[str, str], Dict[str, int]] = defaultdict(
        lambda: {"games": 0, "p1_wins": 0, "p2_wins": 0, "draws": 0}
    )

    for row in rows:
        orig_p1, orig_p2 = row["p1"], row["p2"]
        p1, p2 = (orig_p1, orig_p2) if orig_p1 <= orig_p2 else (orig_p2, orig_p1)
        key = (p1, p2)
        pair_stats[key]["games"] += 1
        w = int(row["winner_side"] or 0)
        if w == 0:
            pair_stats[key]["draws"] += 1
        elif w == 1:
            if orig_p1 == p1:
                pair_stats[key]["p1_wins"] += 1
            else:
                pair_stats[key]["p2_wins"] += 1
        elif w == 2:
            if orig_p2 == p1:
                pair_stats[key]["p1_wins"] += 1
            else:
                pair_stats[key]["p2_wins"] += 1

    out = []
    for (p1, p2), st in pair_stats.items():
        if st["games"] < 1:
            continue
        out.append(
            {
                "model_a": model_payload(p1),
                "model_b": model_payload(p2),
                "games": st["games"],
                "model_a_wins": st["p1_wins"],
                "model_b_wins": st["p2_wins"],
                "draws": st["draws"],
                "model_a_win_pct": round(100.0 * st["p1_wins"] / st["games"], 1),
            }
        )

    out.sort(key=lambda x: (-x["games"], -x["model_a_win_pct"]))
    return out[:limit]


def fetch_quality(conn) -> Dict[str, Any]:
    by_model = _fetch_quality_by_model(conn)
    by_game_rows = conn.execute(
        """
        SELECT r.game_type AS game_type,
               COUNT(*) AS moves,
               AVG(m.latency_ms) AS avg_latency_ms,
               AVG(m.cost_usd) AS avg_cost_usd,
               AVG(m.correctness) AS avg_correctness
        FROM benchmark_moves m
        JOIN benchmark_runs r ON r.id = m.run_id
        WHERE r.status = 'finished'
        GROUP BY r.game_type
        ORDER BY moves DESC
        """
    ).fetchall()
    by_game = [
        {
            "game_type": r["game_type"],
            "moves": int(r["moves"] or 0),
            "avg_latency_ms": round(float(r["avg_latency_ms"] or 0), 1),
            "avg_cost_usd": round(float(r["avg_cost_usd"] or 0), 6),
            "avg_correctness": round(float(r["avg_correctness"] or 0), 3),
        }
        for r in by_game_rows
    ]
    return {"by_model": by_model, "by_game": by_game}


def _fetch_quality_by_model(conn) -> List[Dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT model, SUM(moves) AS moves,
               SUM(latency_sum) / NULLIF(SUM(moves), 0) AS avg_latency_ms,
               SUM(cost_sum) / NULLIF(SUM(moves), 0) AS avg_cost_usd,
               SUM(correctness_sum) / NULLIF(SUM(moves), 0) AS avg_correctness,
               SUM(errors) AS errors
        FROM (
            SELECT r.player1_model AS model, COUNT(*) AS moves,
                   SUM(m.latency_ms) AS latency_sum,
                   SUM(m.cost_usd) AS cost_sum,
                   SUM(m.correctness) AS correctness_sum,
                   SUM(CASE WHEN m.error IS NOT NULL AND TRIM(m.error) != '' THEN 1 ELSE 0 END) AS errors
            FROM benchmark_moves m
            JOIN benchmark_runs r ON r.id = m.run_id
            WHERE r.status = 'finished'
            GROUP BY r.player1_model
            UNION ALL
            SELECT r.player2_model AS model, COUNT(*) AS moves,
                   SUM(m.latency_ms) AS latency_sum,
                   SUM(m.cost_usd) AS cost_sum,
                   SUM(m.correctness) AS correctness_sum,
                   SUM(CASE WHEN m.error IS NOT NULL AND TRIM(m.error) != '' THEN 1 ELSE 0 END) AS errors
            FROM benchmark_moves m
            JOIN benchmark_runs r ON r.id = m.run_id
            WHERE r.status = 'finished'
            GROUP BY r.player2_model
        )
        GROUP BY model
        """
    ).fetchall()

    result = []
    for row in rows:
        mid = row["model"]
        moves = int(row["moves"] or 0)
        if not mid or moves == 0:
            continue
        errors = int(row["errors"] or 0)
        result.append(
            {
                **model_payload(mid),
                "moves": moves,
                "avg_latency_ms": round(float(row["avg_latency_ms"] or 0), 1),
                "avg_cost_usd": round(float(row["avg_cost_usd"] or 0), 6),
                "avg_correctness": round(float(row["avg_correctness"] or 0), 3),
                "error_rate": round(100.0 * errors / moves, 2),
            }
        )
    result.sort(key=lambda x: (-x["moves"],))
    return result


def fetch_trends(conn, days: int = 14, top_models: int = 5) -> Dict[str, Any]:
    cutoff = time.time() - days * 86400
    runs_per_day = conn.execute(
        """
        SELECT date(COALESCE(ended_at, started_at), 'unixepoch') AS day, COUNT(*) AS runs
        FROM benchmark_runs
        WHERE COALESCE(ended_at, started_at) >= ?
        GROUP BY day
        ORDER BY day ASC
        """,
        (cutoff,),
    ).fetchall()
    daily_runs = [{"day": r["day"], "runs": int(r["runs"])} for r in runs_per_day]

    rows = conn.execute(
        """
        SELECT r.id, r.game_type, r.player1_model, r.player2_model, res.winner_side,
               COALESCE(r.ended_at, r.started_at) AS ts
        FROM benchmark_runs r
        JOIN benchmark_results res ON res.run_id = r.id
        WHERE r.status = 'finished' AND res.winner_side IS NOT NULL
        ORDER BY ts ASC
        """
    ).fetchall()

    model_counts: Dict[str, int] = defaultdict(int)
    for row in rows:
        model_counts[row["player1_model"]] += 1
        model_counts[row["player2_model"]] += 1
    top = [m for m, _ in sorted(model_counts.items(), key=lambda x: -x[1])[:top_models]]

    ratings: Dict[str, float] = {m: float(INITIAL_RATING) for m in top}
    elo_series: Dict[str, List[Dict[str, Any]]] = {m: [] for m in top}

    for row in rows:
        m1, m2 = row["player1_model"], row["player2_model"]
        w = int(row["winner_side"] or 0)
        out_a = 0.5
        if w == 1:
            out_a = 1.0
        elif w == 2:
            out_a = 0.0
        ts = float(row["ts"])
        day = time.strftime("%Y-%m-%d", time.gmtime(ts))
        if m1 in ratings and m2 in ratings:
            r1, r2 = ratings[m1], ratings[m2]
            nr1, nr2 = update_elo_pair(r1, r2, out_a)
            ratings[m1], ratings[m2] = nr1, nr2
            for m in (m1, m2):
                elo_series[m].append({"day": day, "rating": round(ratings[m], 1), "ts": ts})

    return {
        "runs_per_day": daily_runs,
        "elo_trends": [{"model": model_payload(m), "points": elo_series[m]} for m in top if elo_series[m]],
    }


def delete_run_hard(conn, run_id: str) -> Dict[str, Any]:
    row = conn.execute(
        "SELECT player1_model, player2_model, game_type, status FROM benchmark_runs WHERE id = ?",
        (run_id,),
    ).fetchone()
    if not row:
        return {"deleted": False, "reason": "not_found"}

    affected_scopes = list({row["game_type"], "overall"})
    conn.execute("DELETE FROM benchmark_moves WHERE run_id = ?", (run_id,))
    conn.execute("DELETE FROM benchmark_results WHERE run_id = ?", (run_id,))
    conn.execute("DELETE FROM benchmark_runs WHERE id = ?", (run_id,))
    rebuild_elo_ratings(conn)
    recalculated_at = time.time()
    conn.commit()

    return {
        "deleted": True,
        "run_id": run_id,
        "player1_model": row["player1_model"],
        "player2_model": row["player2_model"],
        "game_type": row["game_type"],
        "affected_scopes": affected_scopes,
        "elo_rebuilt": True,
        "recalculated_at": recalculated_at,
    }
