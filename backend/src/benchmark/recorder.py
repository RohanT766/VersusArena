"""Record benchmark runs, moves, results, and Elo updates."""

import hashlib
import json
import time
import uuid
from typing import Any, Dict, Optional, Tuple

from src.db.database import get_connection, init_db, _lock
from src.benchmark.elo import INITIAL_RATING, update_elo_pair


def _hash_prompt(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()[:24]


def _get_elo(conn, model_id: str, scope: str) -> Tuple[float, int, int]:
    r = conn.execute(
        "SELECT rating, games_played, wins FROM elo_ratings WHERE model_id = ? AND game_scope = ?",
        (model_id, scope),
    ).fetchone()
    if r:
        return float(r["rating"]), int(r["games_played"]), int(r["wins"])
    return float(INITIAL_RATING), 0, 0


def _save_elo(
    conn, model_id: str, scope: str, rating: float, gp: int, wins: int
) -> None:
    conn.execute(
        """
        INSERT INTO elo_ratings (model_id, game_scope, rating, games_played, wins)
        VALUES (?,?,?,?,?)
        ON CONFLICT(model_id, game_scope) DO UPDATE SET
            rating = excluded.rating,
            games_played = excluded.games_played,
            wins = excluded.wins
        """,
        (model_id, scope, rating, gp, wins),
    )


class BenchmarkRecorder:
    def __init__(self) -> None:
        init_db()

    def start_run(
        self,
        game_type: str,
        player1_model: str,
        player2_model: str,
        config: Optional[Dict[str, Any]] = None,
    ) -> str:
        rid = str(uuid.uuid4())
        now = time.time()
        cfg = json.dumps(config or {})
        with _lock:
            conn = get_connection()
            try:
                conn.execute(
                    """
                    INSERT INTO benchmark_runs (id, game_type, player1_model, player2_model, started_at, status, config_json)
                    VALUES (?,?,?,?,?,?,?)
                    """,
                    (rid, game_type, player1_model, player2_model, now, "in_progress", cfg),
                )
                conn.commit()
            finally:
                conn.close()
        return rid

    def add_move(
        self,
        run_id: str,
        agent_key: str,
        seq: int,
        *,
        latency_ms: Optional[float] = None,
        input_tokens: Optional[int] = None,
        output_tokens: Optional[int] = None,
        cost_usd: Optional[float] = None,
        correctness: Optional[float] = None,
        prompt: Optional[str] = None,
        response_preview: Optional[str] = None,
        error: Optional[str] = None,
        extra: Optional[Dict] = None,
    ) -> None:
        prv = response_preview[:2000] if response_preview else None
        ex = json.dumps(extra) if extra is not None else None
        with _lock:
            conn = get_connection()
            try:
                conn.execute(
                    """
                    INSERT INTO benchmark_moves
                    (run_id, agent_key, seq, latency_ms, input_tokens, output_tokens, cost_usd, correctness,
                     prompt_hash, response_preview, error, extra_json)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                    """,
                    (
                        run_id,
                        agent_key,
                        seq,
                        latency_ms,
                        input_tokens,
                        output_tokens,
                        cost_usd,
                        correctness,
                        _hash_prompt(prompt),
                        prv,
                        error,
                        ex,
                    ),
                )
                conn.commit()
            finally:
                conn.close()

    def finish_run(
        self,
        run_id: str,
        game_type: str,
        winner_side: Optional[int],
        score_p1: float = 0,
        score_p2: float = 0,
        metrics: Optional[Dict] = None,
    ) -> None:
        now = time.time()
        mj = json.dumps(metrics or {})
        with _lock:
            conn = get_connection()
            try:
                row = conn.execute(
                    "SELECT player1_model, player2_model FROM benchmark_runs WHERE id = ?",
                    (run_id,),
                ).fetchone()
                if not row:
                    return
                m1, m2 = row["player1_model"], row["player2_model"]

                conn.execute(
                    "UPDATE benchmark_runs SET ended_at = ?, status = ? WHERE id = ?",
                    (now, "finished", run_id),
                )
                conn.execute(
                    """
                    INSERT OR REPLACE INTO benchmark_results (run_id, winner_side, score_p1, score_p2, metrics_json)
                    VALUES (?,?,?,?,?)
                    """,
                    (run_id, winner_side, score_p1, score_p2, mj),
                )

                if winner_side is not None:
                    self._apply_elo(conn, game_type, m1, m2, winner_side)

                conn.commit()
            finally:
                conn.close()

    def _apply_elo(
        self, conn, game_scope: str, m1: str, m2: str, winner_side: int
    ) -> None:
        if winner_side not in (0, 1, 2):
            return
        out_a = 0.5
        if winner_side == 1:
            out_a = 1.0
        elif winner_side == 2:
            out_a = 0.0

        for scope in (game_scope, "overall"):
            r1, gp1, w1 = _get_elo(conn, m1, scope)
            r2, gp2, w2 = _get_elo(conn, m2, scope)
            new1, new2 = update_elo_pair(r1, r2, out_a)
            gp1 += 1
            gp2 += 1
            if winner_side == 1:
                w1 += 1
            elif winner_side == 2:
                w2 += 1
            _save_elo(conn, m1, scope, new1, gp1, w1)
            _save_elo(conn, m2, scope, new2, gp2, w2)


_recorder_singleton: Optional[BenchmarkRecorder] = None


def get_recorder() -> BenchmarkRecorder:
    global _recorder_singleton
    if _recorder_singleton is None:
        _recorder_singleton = BenchmarkRecorder()
    return _recorder_singleton
