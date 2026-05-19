"""REST endpoints for leaderboard, exports, analytics, batch runs."""

from __future__ import annotations

import asyncio
import csv
import io
import time
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.db.database import get_connection
from src.benchmark.recorder import get_recorder
from src.benchmark.analytics import (
    delete_run_hard,
    display_name,
    fetch_head_to_head,
    fetch_model_performance,
    fetch_overview,
    fetch_quality,
    fetch_trends,
    rebuild_elo_ratings,
)

router = APIRouter(prefix="/api/benchmark", tags=["benchmark"])


def _enrich_leaderboard_rows(rows) -> list:
    out = []
    for r in rows:
        d = dict(r)
        mid = d.get("model_id") or ""
        d["display_name"] = display_name(mid)
        out.append(d)
    return out


@router.get("/leaderboard")
async def leaderboard(
    scope: str = Query("overall", description="overall or game_type"),
):
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT model_id, game_scope, rating, games_played, wins,
                   CASE WHEN games_played > 0 THEN round(100.0 * wins / games_played, 2) ELSE 0 END AS win_pct
            FROM elo_ratings
            WHERE game_scope = ?
            ORDER BY rating DESC
            LIMIT 100
            """,
            (scope,),
        ).fetchall()
        return {"scope": scope, "rows": _enrich_leaderboard_rows(rows)}
    finally:
        conn.close()


@router.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: str):
    rec = get_recorder()
    cancelled = rec.cancel_run(run_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail="Run not found or already finished")
    return {"cancelled": True, "run_id": run_id}


@router.delete("/runs/{run_id}")
async def delete_run(run_id: str):
    conn = get_connection()
    try:
        result = delete_run_hard(conn, run_id)
        if not result.get("deleted"):
            raise HTTPException(status_code=404, detail="Run not found")
        return result
    finally:
        conn.close()


@router.get("/analytics/overview")
async def analytics_overview():
    conn = get_connection()
    try:
        return fetch_overview(conn)
    finally:
        conn.close()


@router.get("/analytics/model-performance")
async def analytics_model_performance(scope: str = Query("overall")):
    conn = get_connection()
    try:
        return {"scope": scope, "models": fetch_model_performance(conn, scope)}
    finally:
        conn.close()


@router.get("/analytics/head-to-head")
async def analytics_head_to_head(limit: int = Query(20, le=100)):
    conn = get_connection()
    try:
        return {"pairs": fetch_head_to_head(conn, limit)}
    finally:
        conn.close()


@router.get("/analytics/quality")
async def analytics_quality():
    conn = get_connection()
    try:
        return fetch_quality(conn)
    finally:
        conn.close()


@router.get("/analytics/trends")
async def analytics_trends(days: int = Query(14, ge=1, le=90)):
    conn = get_connection()
    try:
        return fetch_trends(conn, days)
    finally:
        conn.close()


@router.post("/analytics/rebuild-elo")
async def analytics_rebuild_elo():
    conn = get_connection()
    try:
        rebuild_elo_ratings(conn)
        conn.commit()
        return {"elo_rebuilt": True, "recalculated_at": time.time()}
    finally:
        conn.close()


@router.get("/runs")
async def list_runs(
    game_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    conn = get_connection()
    try:
        if game_type:
            rows = conn.execute(
                """SELECT id, game_type, player1_model, player2_model,
                          started_at, ended_at, status, config_json
                   FROM benchmark_runs WHERE game_type = ? ORDER BY started_at DESC LIMIT ? OFFSET ?""",
                (game_type, limit, offset),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT id, game_type, player1_model, player2_model,
                          started_at, ended_at, status, config_json
                   FROM benchmark_runs ORDER BY started_at DESC LIMIT ? OFFSET ?""",
                (limit, offset),
            ).fetchall()
        return {"runs": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.get("/runs/{run_id}")
async def run_detail(run_id: str):
    conn = get_connection()
    try:
        run = conn.execute("SELECT * FROM benchmark_runs WHERE id = ?", (run_id,)).fetchone()
        if not run:
            raise HTTPException(404)
        mv = conn.execute(
            """SELECT seq, agent_key, latency_ms, input_tokens, output_tokens,
                   cost_usd, correctness, error, response_preview, extra_json
               FROM benchmark_moves WHERE run_id = ? ORDER BY seq ASC""",
            (run_id,),
        ).fetchall()
        res = conn.execute("SELECT * FROM benchmark_results WHERE run_id = ?", (run_id,)).fetchone()
        return {"run": dict(run), "moves": [dict(m) for m in mv], "result": dict(res) if res else None}
    finally:
        conn.close()


@router.get("/export/runs.csv")
async def export_runs_csv():
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT r.id, r.game_type, r.player1_model, r.player2_model,
                      r.started_at, r.ended_at, r.status,
                      res.winner_side, res.score_p1, res.score_p2
               FROM benchmark_runs r
               LEFT JOIN benchmark_results res ON res.run_id = r.id
               ORDER BY r.started_at DESC LIMIT 5000"""
        ).fetchall()
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(
            [
                "id",
                "game_type",
                "p1_model",
                "p2_model",
                "started_at",
                "ended_at",
                "status",
                "winner_side",
                "score_p1",
                "score_p2",
            ]
        )
        for row in rows:
            w.writerow(
                [
                    row["id"],
                    row["game_type"],
                    row["player1_model"],
                    row["player2_model"],
                    row["started_at"],
                    row["ended_at"],
                    row["status"],
                    row["winner_side"],
                    row["score_p1"],
                    row["score_p2"],
                ]
            )
        buf.seek(0)
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="versus_runs.csv"'},
        )
    finally:
        conn.close()


@router.get("/export/runs.json")
async def export_runs_json(limit: int = Query(2000, le=10000)):
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT r.id, r.game_type, r.player1_model, r.player2_model,
                      r.started_at, r.ended_at, r.status, r.config_json,
                      res.winner_side, res.score_p1, res.score_p2, res.metrics_json
               FROM benchmark_runs r
               LEFT JOIN benchmark_results res ON res.run_id = r.id
               ORDER BY r.started_at DESC LIMIT ?""",
            (limit,),
        ).fetchall()
        return {"runs": [dict(x) for x in rows]}
    finally:
        conn.close()


@router.get("/metrics/summary")
async def metrics_summary():
    conn = get_connection()
    try:
        row = conn.execute(
            """
            SELECT COUNT(*) AS moves,
                   AVG(latency_ms) AS avg_latency_ms,
                   AVG(cost_usd) AS avg_cost_usd,
                   SUM(CASE WHEN error IS NOT NULL AND TRIM(error) != '' THEN 1 ELSE 0 END) AS errors
            FROM benchmark_moves
            """
        ).fetchone()
        r2 = conn.execute(
            """
            SELECT COUNT(*) AS runs_finished
            FROM benchmark_runs WHERE status = 'finished'
            """
        ).fetchone()
        return {
            "moves": dict(row) if row else {},
            "finished_runs": int(r2["runs_finished"]) if r2 else 0,
        }
    finally:
        conn.close()


@router.get("/stats/models")
async def model_stats():
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT game_type,
                   player1_model AS model, COUNT(*) AS games,
                   SUM(CASE WHEN res.winner_side = 1 THEN 1 ELSE 0 END) AS wins
            FROM benchmark_runs r JOIN benchmark_results res ON res.run_id = r.id
            WHERE r.status = 'finished'
            GROUP BY game_type, player1_model
            UNION ALL
            SELECT game_type,
                   player2_model AS model, COUNT(*) AS games,
                   SUM(CASE WHEN res.winner_side = 2 THEN 1 ELSE 0 END) AS wins
            FROM benchmark_runs r JOIN benchmark_results res ON res.run_id = r.id
            WHERE r.status = 'finished'
            GROUP BY game_type, player2_model
            """
        ).fetchall()
        return {"aggregates": [dict(r) for r in rows]}
    finally:
        conn.close()


class BatchRequest(BaseModel):
    game_type: str
    player1_model: str = "gpt-5.5"
    player2_model: str = "claude-sonnet-4-6"
    rounds: int = 3
    options: Optional[Dict[str, Any]] = None


_batch_store: Dict[str, Dict[str, Any]] = {}


async def _run_prisoners_batch(job_id: str, req: BatchRequest):
    from src.games.prisoners_dilemma import play_round, start_session, winner_side

    rec = get_recorder()
    results = []
    for i in range(req.rounds):
        _batch_store[job_id]["current_round"] = i + 1
        sess = start_session(req.player1_model, req.player2_model, rounds=10)
        rid = rec.start_run(
            "prisoners_dilemma",
            req.player1_model,
            req.player2_model,
            {"batch_job": job_id, "round_index": i},
        )
        sess.benchmark_run_id = rid
        seq = 0
        while True:
            out = play_round(sess)
            rnd = out.get("round")
            if isinstance(rnd, dict):
                for ag, u in (("player1", rnd.get("usage1")), ("player2", rnd.get("usage2"))):
                    u = u or {}
                    rec.add_move(
                        rid,
                        ag,
                        seq,
                        latency_ms=u.get("latency_ms"),
                        input_tokens=u.get("input_tokens"),
                        output_tokens=u.get("output_tokens"),
                        cost_usd=u.get("cost_usd"),
                        correctness=1.0,
                    )
                    seq += 1
            if out.get("done"):
                w = winner_side(sess)
                rec.finish_run(
                    rid,
                    "prisoners_dilemma",
                    w,
                    float(sess.scores[0]),
                    float(sess.scores[1]),
                    {"rounds": len(sess.history)},
                )
                results.append({"winner": w, "scores": sess.scores})
                break
        await asyncio.sleep(0.05)
    _batch_store[job_id]["status"] = "done"
    _batch_store[job_id]["results"] = results


def _wordle_single_run_record(p1: str, p2: str, word_len: int, hard_mode: bool) -> Dict[str, Any]:
    from src.games.wordle.wordle_simple import WordleGame, pick_secret_word, get_llm_guess

    rec = get_recorder()
    secret = pick_secret_word(word_len)
    game = WordleGame(secret, p1, p2, hard_mode=hard_mode)
    rid = rec.start_run(
        "wordle",
        p1,
        p2,
        {"word_length": word_len, "hard_mode": hard_mode, "batch": True},
    )
    seq = 0
    for _ in range(64):
        if game.game_over:
            break
        for side in ("player1", "player2"):
            if game.game_over:
                break
            md = game.models[side]
            if len(md["guesses"]) >= 6:
                continue
            usage: Dict[str, Any] = {}
            guess, _reason = get_llm_guess(
                game.model_ids[side],
                list(md["guesses"]),
                list(md["feedback"]),
                word_len=game.word_len,
                hard_mode=game.hard_mode,
                usage_out=usage,
            )
            game.make_guess(side, guess, "")
            seq += 1
            rec.add_move(
                rid,
                side,
                seq,
                latency_ms=usage.get("latency_ms"),
                input_tokens=usage.get("input_tokens"),
                output_tokens=usage.get("output_tokens"),
                cost_usd=usage.get("cost_usd"),
                correctness=1.0 if guess.upper() == game.secret_word else 0.0,
                response_preview=guess,
                error=usage.get("error"),
            )
    win = game.winner
    if win is None or win == "TIE":
        w = 0
    else:
        w = {"player1": 1, "player2": 2}.get(str(win), 0)
    rec.finish_run(
        rid,
        "wordle",
        w,
        float(len(game.models["player1"]["guesses"])),
        float(len(game.models["player2"]["guesses"])),
        {"secret_length": word_len, "hard_mode": hard_mode},
    )
    return {"winner": w}


async def _run_wordle_batch(job_id: str, req: BatchRequest):
    opts = req.options or {}
    word_len = int(opts.get("word_length", 5))
    hard_mode = bool(opts.get("hard_mode", False))
    results: list = []
    for i in range(req.rounds):
        _batch_store[job_id]["current_round"] = i + 1
        r = await asyncio.to_thread(
            _wordle_single_run_record,
            req.player1_model,
            req.player2_model,
            word_len,
            hard_mode,
        )
        results.append(r)
        await asyncio.sleep(0.02)
    _batch_store[job_id]["status"] = "done"
    _batch_store[job_id]["results"] = results


@router.post("/batch/start")
async def batch_start(body: BatchRequest, background: BackgroundTasks):
    if body.game_type not in ("prisoners_dilemma", "wordle"):
        raise HTTPException(
            status_code=400,
            detail="Supported batch games: prisoners_dilemma, wordle",
        )
    jid = str(uuid.uuid4())
    _batch_store[jid] = {
        "id": jid,
        "game_type": body.game_type,
        "status": "running",
        "started_at": time.time(),
        "rounds_total": body.rounds,
        "current_round": 0,
        "results": [],
    }
    if body.game_type == "prisoners_dilemma":
        background.add_task(_run_prisoners_batch, jid, body)
    else:
        background.add_task(_run_wordle_batch, jid, body)
    return {"job_id": jid}


@router.get("/batch/status/{job_id}")
async def batch_status(job_id: str):
    if job_id not in _batch_store:
        raise HTTPException(status_code=404, detail="Unknown job")
    return _batch_store[job_id]
