"""Disk snapshot of Minesweeper sessions so /round survives process restarts and empty RAM dict."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from src.games.minesweeper import MinesweeperSession, PlayerState

logger = logging.getLogger(__name__)

_CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "minesweeper_sessions"


def _sets_from_lists(pairs: List[List[int]]) -> Set[Tuple[int, int]]:
    return {tuple(p) for p in pairs}


def session_to_payload(sess: MinesweeperSession) -> Dict[str, Any]:
    with sess._lock:
        p1 = sess.player1
        p2 = sess.player2
        mines = sorted(sess.mine_set)
        return {
            "v": 1,
            "id": sess.id,
            "model1": sess.model1,
            "model2": sess.model2,
            "rows": sess.rows,
            "cols": sess.cols,
            "board": sess.board,
            "mine_set": [list(m) for m in mines],
            "steps_p1": sess.steps_p1,
            "steps_p2": sess.steps_p2,
            "done": sess.done,
            "benchmark_run_id": sess.benchmark_run_id,
            "move_seq": sess.move_seq,
            "p1": {
                "revealed": [list(p) for p in sorted(p1.revealed)],
                "alive": p1.alive,
                "hit_mine": p1.hit_mine,
            },
            "p2": {
                "revealed": [list(p) for p in sorted(p2.revealed)],
                "alive": p2.alive,
                "hit_mine": p2.hit_mine,
            },
        }


def payload_to_session(d: Dict[str, Any]) -> MinesweeperSession:
    p1d, p2d = d["p1"], d["p2"]
    p1 = PlayerState(
        revealed=_sets_from_lists(p1d["revealed"]),
        alive=p1d["alive"],
        hit_mine=p1d["hit_mine"],
    )
    p2 = PlayerState(
        revealed=_sets_from_lists(p2d["revealed"]),
        alive=p2d["alive"],
        hit_mine=p2d["hit_mine"],
    )
    mine_set = _sets_from_lists(d["mine_set"])
    return MinesweeperSession(
        model1=d["model1"],
        model2=d["model2"],
        id=d["id"],
        rows=int(d["rows"]),
        cols=int(d["cols"]),
        board=d["board"],
        mine_set=mine_set,
        player1=p1,
        player2=p2,
        steps_p1=int(d["steps_p1"]),
        steps_p2=int(d["steps_p2"]),
        done=bool(d["done"]),
        benchmark_run_id=d.get("benchmark_run_id"),
        move_seq=int(d.get("move_seq", 0)),
    )


def persist_session(sess: MinesweeperSession) -> None:
    try:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path = _CACHE_DIR / f"{sess.id}.json"
        payload = session_to_payload(sess)
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload), encoding="utf-8")
        tmp.replace(path)
    except Exception as e:
        logger.warning("minesweeper persist failed: %s", e)


def load_session(session_id: str) -> Optional[MinesweeperSession]:
    path = _CACHE_DIR / f"{session_id}.json"
    if not path.is_file():
        return None
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
        if d.get("v") != 1 or d.get("id") != session_id:
            return None
        return payload_to_session(d)
    except Exception as e:
        logger.warning("minesweeper load failed for %s: %s", session_id, e)
        return None


def delete_session(session_id: str) -> None:
    path = _CACHE_DIR / f"{session_id}.json"
    try:
        if path.is_file():
            path.unlink()
    except Exception as e:
        logger.warning("minesweeper delete failed: %s", e)
