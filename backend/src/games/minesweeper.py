"""Minesweeper Race — two models reveal the same board; deterministic scoring."""

from __future__ import annotations

import random
import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

from src.engine.agent_client import AgentClient, terminal_result
from src.engine.game_tools import MINESWEEPER_TOOLS

ROWS = 8
COLS = 8
MINES = 10
MAX_STEPS_PER_PLAYER = 20


def _neighbors(r: int, c: int, rows: int, cols: int) -> List[Tuple[int, int]]:
    out = []
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            if dr == 0 and dc == 0:
                continue
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols:
                out.append((nr, nc))
    return out


def generate_board(rows: int = ROWS, cols: int = COLS, mines: int = MINES) -> Tuple[List[List[int]], Set[Tuple[int, int]]]:
    mine_set: Set[Tuple[int, int]] = set()
    while len(mine_set) < mines:
        mine_set.add((random.randint(0, rows - 1), random.randint(0, cols - 1)))
    board = [[0 for _ in range(cols)] for _ in range(rows)]
    for r, c in mine_set:
        board[r][c] = -1
    for r in range(rows):
        for c in range(cols):
            if board[r][c] == -1:
                continue
            board[r][c] = sum(1 for nr, nc in _neighbors(r, c, rows, cols) if (nr, nc) in mine_set)
    return board, mine_set


def _flood_reveal(
    board: List[List[int]],
    revealed: Set[Tuple[int, int]],
    r: int,
    c: int,
    rows: int,
    cols: int,
) -> None:
    stack = [(r, c)]
    while stack:
        cr, cc = stack.pop()
        if (cr, cc) in revealed:
            continue
        revealed.add((cr, cc))
        if board[cr][cc] == 0:
            for nr, nc in _neighbors(cr, cc, rows, cols):
                if (nr, nc) not in revealed and board[nr][nc] != -1:
                    stack.append((nr, nc))


@dataclass
class PlayerState:
    revealed: Set[Tuple[int, int]] = field(default_factory=set)
    alive: bool = True
    hit_mine: bool = False

    @property
    def score(self) -> int:
        return len(self.revealed)


@dataclass
class MinesweeperSession:
    model1: str
    model2: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    rows: int = ROWS
    cols: int = COLS
    board: List[List[int]] = field(default_factory=list)
    mine_set: Set[Tuple[int, int]] = field(default_factory=set)
    player1: PlayerState = field(default_factory=PlayerState)
    player2: PlayerState = field(default_factory=PlayerState)
    steps_p1: int = 0
    steps_p2: int = 0
    done: bool = False
    benchmark_run_id: Optional[str] = None
    move_seq: int = 0

    @property
    def safe_cells(self) -> int:
        return self.rows * self.cols - len(self.mine_set)


def board_ascii(board: List[List[int]], revealed: Set[Tuple[int, int]], rows: int, cols: int) -> str:
    lines = []
    col_hdr = "   " + " ".join(chr(ord("A") + c) for c in range(cols))
    lines.append(col_hdr)
    for r in range(rows):
        row = [f"{r:2}"]
        for c in range(cols):
            if (r, c) not in revealed:
                row.append(".")
            elif board[r][c] == -1:
                row.append("*")
            else:
                row.append(str(board[r][c]))
        lines.append(" ".join(row))
    return "\n".join(lines)


def _parse_cell(text: str, rows: int, cols: int) -> Optional[Tuple[int, int]]:
    m = re.search(r"\b(\d+)\s*[, ]\s*(\d+)\b", text)
    if m:
        r, c = int(m.group(1)), int(m.group(2))
        if 0 <= r < rows and 0 <= c < cols:
            return r, c
    m = re.search(r"\b([A-H])\s*(\d+)\b", text.upper())
    if m:
        c = ord(m.group(1)) - ord("A")
        r = int(m.group(2)) - 1
        if 0 <= r < rows and 0 <= c < cols:
            return r, c
    return None


def _pick_fallback(revealed: Set[Tuple[int, int]], rows: int, cols: int) -> Tuple[int, int]:
    for r in range(rows):
        for c in range(cols):
            if (r, c) not in revealed:
                return r, c
    return 0, 0


def play_step(session: MinesweeperSession, player: str) -> Dict[str, Any]:
    if session.done:
        return {"done": True, "player": player}

    ps = session.player1 if player == "player1" else session.player2
    other = session.player2 if player == "player1" else session.player1
    steps_attr = "steps_p1" if player == "player1" else "steps_p2"
    max_steps = MAX_STEPS_PER_PLAYER

    if not ps.alive or getattr(session, steps_attr) >= max_steps:
        _check_done(session)
        return _step_result(session, player, skipped=True)

    model_id = session.model1 if player == "player1" else session.model2
    steps_left = max_steps - getattr(session, steps_attr)
    move_num = getattr(session, steps_attr) + 1
    opp_score = other.score
    opp_moves = session.steps_p2 if player == "player1" else session.steps_p1
    system = (
        "You are playing Minesweeper Race. Use tools to inspect the board, then call reveal_cell once per turn."
    )
    user_msg = (
        f"Minesweeper race on {session.rows}x{session.cols} (rows 0-{session.rows - 1}, cols 0-{session.cols - 1}).\n"
        "RULES: Reveal one hidden cell per turn. Hit a mine = eliminated. Win by most safe reveals.\n"
        f"Your move {move_num}/{max_steps} ({steps_left} left) | Opponent moves: {opp_moves}/{max_steps}\n"
        f"Your score: {ps.score}/{session.safe_cells} | Opponent: {opp_score} | "
        f"You: {'alive' if ps.alive else 'out'} | Opponent: {'alive' if other.alive else 'out'}"
    )

    def executor(name: str, args: Dict[str, Any]) -> Any:
        if name == "get_board_view":
            return {
                "board": board_ascii(session.board, ps.revealed, session.rows, session.cols),
                "score": ps.score,
                "revealed_count": len(ps.revealed),
            }
        if name == "reveal_cell":
            return terminal_result({"row": int(args["row"]), "col": int(args["col"])})
        return {"error": f"Unknown tool {name}"}

    usage: Dict[str, Any] = {}
    agent = AgentClient(model_id)
    try:
        turn = agent.run_turn(
            [{"role": "user", "content": user_msg}],
            MINESWEEPER_TOOLS,
            executor,
            max_steps=5,
            max_tokens=256,
            temperature=0.2,
            usage_out=usage,
            system=system,
        )
        cell = (turn.action_args.get("row"), turn.action_args.get("col"))
        tool_trace = turn.tool_calls
    except Exception:
        cell = _pick_fallback(ps.revealed, session.rows, session.cols)
        tool_trace = []
        usage.setdefault("error", "agent_turn_failed")

    if cell[0] is None or cell[1] is None or cell in ps.revealed:
        cell = _pick_fallback(ps.revealed, session.rows, session.cols)

    r, c = cell
    hit_mine = (r, c) in session.mine_set
    newly: List[Tuple[int, int]] = []

    if hit_mine:
        ps.hit_mine = True
        ps.alive = False
        ps.revealed.add((r, c))
        newly = [(r, c)]
    else:
        before_set = set(ps.revealed)
        _flood_reveal(session.board, ps.revealed, r, c, session.rows, session.cols)
        newly = [p for p in ps.revealed if p not in before_set]
        if not newly:
            ps.revealed.add((r, c))
            newly = [(r, c)]

    setattr(session, steps_attr, getattr(session, steps_attr) + 1)
    session.move_seq += 1

    _check_done(session)
    return {
        "player": player,
        "row": r,
        "col": c,
        "hit_mine": hit_mine,
        "newly_revealed": [{"row": nr, "col": nc, "value": session.board[nr][nc]} for nr, nc in newly],
        "score": ps.score,
        "alive": ps.alive,
        "opponent_score": other.score,
        "done": session.done,
        "winner_side": winner_side(session) if session.done else None,
        "usage": usage,
        "tool_calls": tool_trace,
        "move_seq": session.move_seq,
    }


def _check_done(session: MinesweeperSession) -> None:
    p1_done = not session.player1.alive or session.steps_p1 >= MAX_STEPS_PER_PLAYER or session.player1.score >= session.safe_cells
    p2_done = not session.player2.alive or session.steps_p2 >= MAX_STEPS_PER_PLAYER or session.player2.score >= session.safe_cells
    if p1_done and p2_done:
        session.done = True


def winner_side(session: MinesweeperSession) -> int:
    s1, s2 = session.player1.score, session.player2.score
    if s1 > s2:
        return 1
    if s2 > s1:
        return 2
    return 0


def _step_result(session: MinesweeperSession, player: str, skipped: bool = False) -> Dict[str, Any]:
    ps = session.player1 if player == "player1" else session.player2
    return {
        "player": player,
        "skipped": skipped,
        "score": ps.score,
        "alive": ps.alive,
        "done": session.done,
        "winner_side": winner_side(session) if session.done else None,
    }


def start_session(p1: str, p2: str) -> MinesweeperSession:
    board, mines = generate_board()
    return MinesweeperSession(model1=p1, model2=p2, board=board, mine_set=mines)


def player_view(session: MinesweeperSession, player: str) -> Dict[str, Any]:
    ps = session.player1 if player == "player1" else session.player2
    grid = []
    for r in range(session.rows):
        row = []
        for c in range(session.cols):
            if (r, c) not in ps.revealed:
                row.append(None)
            elif session.board[r][c] == -1:
                row.append(-1)
            else:
                row.append(session.board[r][c])
        grid.append(row)
    return {
        "grid": grid,
        "score": ps.score,
        "alive": ps.alive,
        "hit_mine": ps.hit_mine,
        "steps": session.steps_p1 if player == "player1" else session.steps_p2,
    }


def session_state(session: MinesweeperSession) -> Dict[str, Any]:
    return {
        "session_id": session.id,
        "rows": session.rows,
        "cols": session.cols,
        "mine_count": len(session.mine_set),
        "safe_cells": session.safe_cells,
        "player1": player_view(session, "player1"),
        "player2": player_view(session, "player2"),
        "done": session.done,
        "winner_side": winner_side(session) if session.done else None,
    }
