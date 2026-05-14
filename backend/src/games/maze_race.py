"""Maze Race: two LLMs navigate the same randomly-generated maze."""

from __future__ import annotations

import random
import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

from src.utils.common import LLMClient

DIRECTIONS = {
    "NORTH": (-1, 0),
    "SOUTH": (1, 0),
    "EAST": (0, 1),
    "WEST": (0, -1),
}


def generate_maze(rows: int, cols: int) -> List[List[Dict[str, bool]]]:
    """DFS recursive-backtracker maze generation.
    Returns a grid where each cell stores which walls are open."""
    cells = [[{"N": False, "S": False, "E": False, "W": False} for _ in range(cols)] for _ in range(rows)]
    visited = [[False] * cols for _ in range(rows)]
    stack: List[Tuple[int, int]] = []

    r, c = 0, 0
    visited[r][c] = True
    stack.append((r, c))

    while stack:
        r, c = stack[-1]
        neighbors = []
        for dr, dc, wall, opposite in [(-1, 0, "N", "S"), (1, 0, "S", "N"), (0, 1, "E", "W"), (0, -1, "W", "E")]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and not visited[nr][nc]:
                neighbors.append((nr, nc, wall, opposite))
        if neighbors:
            nr, nc, wall, opposite = random.choice(neighbors)
            cells[r][c][wall] = True
            cells[nr][nc][opposite] = True
            visited[nr][nc] = True
            stack.append((nr, nc))
        else:
            stack.pop()

    return cells


def maze_to_ascii(cells: List[List[Dict[str, bool]]], rows: int, cols: int,
                  p1: Tuple[int, int], p2: Tuple[int, int],
                  goal: Tuple[int, int]) -> str:
    """Render maze as ASCII art for LLM consumption."""
    lines = []
    top = "+"
    for c in range(cols):
        top += "---+"
    lines.append(top)

    for r in range(rows):
        row_str = ""
        for c in range(cols):
            row_str += " " if cells[r][c]["W"] and c > 0 else "|" if c == 0 or not cells[r][c]["W"] else " "
            if (r, c) == p1 and (r, c) == p2:
                row_str += " X "
            elif (r, c) == p1:
                row_str += " 1 "
            elif (r, c) == p2:
                row_str += " 2 "
            elif (r, c) == goal:
                row_str += " G "
            else:
                row_str += "   "
        row_str += "|"
        lines.append(row_str)

        bottom = "+"
        for c in range(cols):
            bottom += "   +" if cells[r][c]["S"] else "---+"
        lines.append(bottom)

    return "\n".join(lines)


def available_moves(cells: List[List[Dict[str, bool]]], pos: Tuple[int, int],
                    rows: int, cols: int) -> List[str]:
    r, c = pos
    moves = []
    if r > 0 and cells[r][c]["N"]:
        moves.append("NORTH")
    if r < rows - 1 and cells[r][c]["S"]:
        moves.append("SOUTH")
    if c < cols - 1 and cells[r][c]["E"]:
        moves.append("EAST")
    if c > 0 and cells[r][c]["W"]:
        moves.append("WEST")
    return moves


def _parse_direction(text: str, valid: List[str]) -> Optional[str]:
    t = (text or "").upper().strip()
    for d in valid:
        if d in t:
            return d
    return None


@dataclass
class MazeSession:
    id: str
    m1: str
    m2: str
    rows: int
    cols: int
    cells: List[List[Dict[str, bool]]]
    p1_pos: Tuple[int, int]
    p2_pos: Tuple[int, int]
    goal: Tuple[int, int]
    p1_trail: List[Tuple[int, int]] = field(default_factory=list)
    p2_trail: List[Tuple[int, int]] = field(default_factory=list)
    step_count: int = 0
    max_steps: int = 150
    done: bool = False
    winner: Optional[int] = None
    benchmark_run_id: Optional[str] = None

    def build_prompt(self, player: int) -> str:
        pos = self.p1_pos if player == 1 else self.p2_pos
        trail = self.p1_trail if player == 1 else self.p2_trail
        other_pos = self.p2_pos if player == 1 else self.p1_pos
        moves = available_moves(self.cells, pos, self.rows, self.cols)

        ascii_maze = maze_to_ascii(self.cells, self.rows, self.cols, self.p1_pos, self.p2_pos, self.goal)

        visited_str = ", ".join(f"({r},{c})" for r, c in trail[-20:])

        lines = [
            f"You are Player {player} in a maze race. First to reach the goal (G) wins.",
            f"Maze ({self.rows}x{self.cols}):",
            ascii_maze,
            "",
            f"Your position: row={pos[0]}, col={pos[1]} (marked as '{player}')",
            f"Opponent position: row={other_pos[0]}, col={other_pos[1]}",
            f"Goal: row={self.goal[0]}, col={self.goal[1]} (marked as 'G')",
            f"Step {self.step_count + 1} of {self.max_steps}.",
            f"Available moves: {', '.join(moves)}",
            f"Recently visited: {visited_str}" if visited_str else "",
            "",
            f"Reply with exactly one word: {' or '.join(moves)}",
        ]
        return "\n".join(lines)


def start_session(m1: str, m2: str, rows: int = 10, cols: int = 10) -> MazeSession:
    cells = generate_maze(rows, cols)
    start = (0, 0)
    goal = (rows - 1, cols - 1)
    sess = MazeSession(
        id=str(uuid.uuid4()),
        m1=m1,
        m2=m2,
        rows=rows,
        cols=cols,
        cells=cells,
        p1_pos=start,
        p2_pos=start,
        goal=goal,
        p1_trail=[start],
        p2_trail=[start],
    )
    return sess


def play_step(session: MazeSession) -> Dict[str, Any]:
    if session.done:
        return {"done": True, "winner": session.winner, "step": session.step_count}

    llm1 = LLMClient(session.m1)
    llm2 = LLMClient(session.m2)

    p1_moves = available_moves(session.cells, session.p1_pos, session.rows, session.cols)
    p2_moves = available_moves(session.cells, session.p2_pos, session.rows, session.cols)

    u1: Dict[str, Any] = {}
    u2: Dict[str, Any] = {}

    r1 = llm1.get_response(session.build_prompt(1), max_tokens=16, temperature=0.3, usage_out=u1)
    r2 = llm2.get_response(session.build_prompt(2), max_tokens=16, temperature=0.3, usage_out=u2)

    d1 = _parse_direction(r1 or "", p1_moves)
    d2 = _parse_direction(r2 or "", p2_moves)

    p1_moved = False
    p2_moved = False

    if d1 and d1 in DIRECTIONS:
        dr, dc = DIRECTIONS[d1]
        new_r, new_c = session.p1_pos[0] + dr, session.p1_pos[1] + dc
        session.p1_pos = (new_r, new_c)
        session.p1_trail.append(session.p1_pos)
        p1_moved = True

    if d2 and d2 in DIRECTIONS:
        dr, dc = DIRECTIONS[d2]
        new_r, new_c = session.p2_pos[0] + dr, session.p2_pos[1] + dc
        session.p2_pos = (new_r, new_c)
        session.p2_trail.append(session.p2_pos)
        p2_moved = True

    session.step_count += 1

    p1_at_goal = session.p1_pos == session.goal
    p2_at_goal = session.p2_pos == session.goal

    if p1_at_goal and p2_at_goal:
        session.done = True
        session.winner = 0  # tie
    elif p1_at_goal:
        session.done = True
        session.winner = 1
    elif p2_at_goal:
        session.done = True
        session.winner = 2
    elif session.step_count >= session.max_steps:
        session.done = True
        p1_dist = abs(session.p1_pos[0] - session.goal[0]) + abs(session.p1_pos[1] - session.goal[1])
        p2_dist = abs(session.p2_pos[0] - session.goal[0]) + abs(session.p2_pos[1] - session.goal[1])
        if p1_dist < p2_dist:
            session.winner = 1
        elif p2_dist < p1_dist:
            session.winner = 2
        else:
            session.winner = 0

    return {
        "done": session.done,
        "winner": session.winner,
        "step": session.step_count,
        "max_steps": session.max_steps,
        "p1_pos": list(session.p1_pos),
        "p2_pos": list(session.p2_pos),
        "p1_dir": d1,
        "p2_dir": d2,
        "p1_moved": p1_moved,
        "p2_moved": p2_moved,
        "p1_trail": [list(t) for t in session.p1_trail],
        "p2_trail": [list(t) for t in session.p2_trail],
        "usage1": u1,
        "usage2": u2,
    }


def session_state(session: MazeSession) -> Dict[str, Any]:
    return {
        "session_id": session.id,
        "rows": session.rows,
        "cols": session.cols,
        "cells": session.cells,
        "p1_pos": list(session.p1_pos),
        "p2_pos": list(session.p2_pos),
        "goal": list(session.goal),
        "p1_trail": [list(t) for t in session.p1_trail],
        "p2_trail": [list(t) for t in session.p2_trail],
        "step": session.step_count,
        "max_steps": session.max_steps,
        "done": session.done,
        "winner": session.winner,
    }


def winner_side(session: MazeSession) -> int:
    return session.winner if session.winner is not None else 0
