"""Benchmark database: SQLite schema and connection helpers."""

import os
import sqlite3
import threading
from pathlib import Path

_backend_root = Path(__file__).resolve().parents[2]

_lock = threading.Lock()


def db_path() -> str:
    path = os.environ.get(
        "BENCHMARK_DB_PATH",
        str(_backend_root / "data" / "benchmark.sqlite"),
    )
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    return str(p)


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _lock:
        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.executescript(
                """
                CREATE TABLE IF NOT EXISTS benchmark_runs (
                    id TEXT PRIMARY KEY,
                    game_type TEXT NOT NULL,
                    player1_model TEXT NOT NULL,
                    player2_model TEXT NOT NULL,
                    started_at REAL NOT NULL,
                    ended_at REAL,
                    status TEXT NOT NULL,
                    config_json TEXT
                );

                CREATE TABLE IF NOT EXISTS benchmark_moves (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    agent_key TEXT NOT NULL,
                    seq INTEGER NOT NULL,
                    latency_ms REAL,
                    input_tokens INTEGER,
                    output_tokens INTEGER,
                    cost_usd REAL,
                    correctness REAL,
                    prompt_hash TEXT,
                    response_preview TEXT,
                    error TEXT,
                    extra_json TEXT,
                    FOREIGN KEY (run_id) REFERENCES benchmark_runs(id)
                );

                CREATE TABLE IF NOT EXISTS benchmark_results (
                    run_id TEXT PRIMARY KEY,
                    winner_side INTEGER,
                    score_p1 REAL,
                    score_p2 REAL,
                    metrics_json TEXT,
                    FOREIGN KEY (run_id) REFERENCES benchmark_runs(id)
                );

                CREATE TABLE IF NOT EXISTS elo_ratings (
                    model_id TEXT NOT NULL,
                    game_scope TEXT NOT NULL,
                    rating REAL NOT NULL DEFAULT 1200,
                    games_played INTEGER NOT NULL DEFAULT 0,
                    wins INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (model_id, game_scope)
                );

                CREATE INDEX IF NOT EXISTS idx_moves_run ON benchmark_moves(run_id);
                CREATE INDEX IF NOT EXISTS idx_runs_game_type ON benchmark_runs(game_type);
                """
            )
            conn.commit()
        finally:
            conn.close()