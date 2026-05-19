"""Tests for benchmark analytics, delete, and Elo rebuild."""

import os
import tempfile

import pytest

from src.db.database import get_connection, init_db
from src.benchmark.recorder import BenchmarkRecorder
from src.benchmark.analytics import (
    delete_run_hard,
    fetch_head_to_head,
    fetch_model_performance,
    fetch_overview,
    rebuild_elo_ratings,
)
from src.benchmark.elo import INITIAL_RATING


@pytest.fixture
def temp_db(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".sqlite")
    os.close(fd)
    monkeypatch.setenv("BENCHMARK_DB_PATH", path)
    init_db()
    yield path
    try:
        os.unlink(path)
    except OSError:
        pass


def _finish_run(rec, game, p1, p2, winner):
    rid = rec.start_run(game, p1, p2, {})
    rec.add_move(rid, "player1", 1, latency_ms=50.0, correctness=1.0)
    rec.finish_run(rid, game, winner, 1.0, 0.0, {})
    return rid


class TestDeleteAndEloRebuild:
    def test_delete_run_removes_data_and_rebuilds_elo(self, temp_db):
        rec = BenchmarkRecorder()
        r1 = _finish_run(rec, "wordle", "gpt-5.5", "claude-sonnet-4-6", 1)
        r2 = _finish_run(rec, "wordle", "gpt-5.5", "claude-sonnet-4-6", 2)

        conn = get_connection()
        try:
            before = conn.execute("SELECT COUNT(*) AS n FROM benchmark_runs").fetchone()["n"]
            assert before == 2

            result = delete_run_hard(conn, r1)
            assert result["deleted"] is True
            assert result["elo_rebuilt"] is True

            remaining = conn.execute("SELECT COUNT(*) AS n FROM benchmark_runs").fetchone()["n"]
            assert remaining == 1
            moves = conn.execute(
                "SELECT COUNT(*) AS n FROM benchmark_moves WHERE run_id = ?", (r1,)
            ).fetchone()["n"]
            assert moves == 0

            elo = conn.execute(
                "SELECT rating, games_played FROM elo_ratings WHERE model_id = ? AND game_scope = 'overall'",
                ("gpt-5.5",),
            ).fetchone()
            assert elo is not None
            assert int(elo["games_played"]) == 1
        finally:
            conn.close()

    def test_delete_missing_run(self, temp_db):
        conn = get_connection()
        try:
            result = delete_run_hard(conn, "nonexistent-id")
            assert result["deleted"] is False
        finally:
            conn.close()

    def test_rebuild_elo_from_scratch(self, temp_db):
        rec = BenchmarkRecorder()
        _finish_run(rec, "wordle", "gpt-5.5", "claude-sonnet-4-6", 1)
        _finish_run(rec, "battleship", "gpt-5.5", "gemini-2.5-flash", 2)

        conn = get_connection()
        try:
            conn.execute("DELETE FROM elo_ratings")
            rebuild_elo_ratings(conn)
            conn.commit()
            rows = conn.execute(
                "SELECT model_id, game_scope, games_played FROM elo_ratings ORDER BY model_id, game_scope"
            ).fetchall()
            assert len(rows) >= 2
            overall = [r for r in rows if r["game_scope"] == "overall"]
            assert any(int(r["games_played"]) > 0 for r in overall)
        finally:
            conn.close()


class TestCancelRun:
    def test_cancel_in_progress_run(self, temp_db):
        rec = BenchmarkRecorder()
        rid = rec.start_run("wordle", "gpt-5.5", "claude-sonnet-4-6", {})
        assert rec.cancel_run(rid) is True
        conn = get_connection()
        try:
            row = conn.execute("SELECT status FROM benchmark_runs WHERE id = ?", (rid,)).fetchone()
            assert row["status"] == "cancelled"
        finally:
            conn.close()

    def test_cancel_finished_run_returns_false(self, temp_db):
        rec = BenchmarkRecorder()
        rid = _finish_run(rec, "wordle", "gpt-5.5", "claude-sonnet-4-6", 1)
        assert rec.cancel_run(rid) is False

    def test_cancel_nonexistent_run_returns_false(self, temp_db):
        rec = BenchmarkRecorder()
        assert rec.cancel_run("does-not-exist") is False

    def test_cancelled_run_excluded_from_analytics(self, temp_db):
        rec = BenchmarkRecorder()
        rid1 = _finish_run(rec, "wordle", "gpt-5.5", "claude-sonnet-4-6", 1)
        rid2 = rec.start_run("wordle", "gpt-5.5", "claude-sonnet-4-6", {})
        rec.cancel_run(rid2)

        conn = get_connection()
        try:
            ov = fetch_overview(conn)
            assert ov["finished_runs"] == 1
            assert ov["cancelled_runs"] == 1
            models = fetch_model_performance(conn, "overall")
            for m in models:
                assert m["games_played"] == 1
        finally:
            conn.close()


class TestAnalyticsEndpoints:
    def test_overview_counts(self, temp_db):
        rec = BenchmarkRecorder()
        rid = rec.start_run("wordle", "gpt-5.5", "claude-sonnet-4-6", {})
        rec.finish_run(rid, "wordle", 1, 1.0, 0.0, {})
        rec.start_run("wordle", "a", "b", {})  # in progress

        conn = get_connection()
        try:
            ov = fetch_overview(conn)
            assert ov["total_runs"] >= 2
            assert ov["finished_runs"] >= 1
            assert ov["in_progress_runs"] >= 1
            assert "completion_rate" in ov
            assert "quality" in ov
        finally:
            conn.close()

    def test_model_performance_has_display_names(self, temp_db):
        rec = BenchmarkRecorder()
        _finish_run(rec, "wordle", "gpt-5.5", "claude-sonnet-4-6", 1)

        conn = get_connection()
        try:
            models = fetch_model_performance(conn, "overall")
            assert models
            assert models[0]["model_id"]
            assert models[0]["display_name"]
            assert models[0]["display_name"] != "undefined"
        finally:
            conn.close()

    def test_head_to_head_pair(self, temp_db):
        rec = BenchmarkRecorder()
        _finish_run(rec, "wordle", "gpt-5.5", "claude-sonnet-4-6", 1)
        _finish_run(rec, "wordle", "gpt-5.5", "claude-sonnet-4-6", 2)

        conn = get_connection()
        try:
            pairs = fetch_head_to_head(conn)
            assert pairs
            p = pairs[0]
            assert p["model_a"]["display_name"]
            assert p["model_b"]["display_name"]
            assert p["games"] == 2
        finally:
            conn.close()
