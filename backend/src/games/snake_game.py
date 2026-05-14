"""Snake Duel: two LLM-controlled snakes compete on the same board."""

from __future__ import annotations

import random
import uuid
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from src.utils.common import LLMClient

DIRS = {
    "UP": (-1, 0),
    "DOWN": (1, 0),
    "LEFT": (0, -1),
    "RIGHT": (0, 1),
}

OPPOSITE = {"UP": "DOWN", "DOWN": "UP", "LEFT": "RIGHT", "RIGHT": "LEFT"}


def _random_food(rows: int, cols: int, occupied: set) -> Tuple[int, int]:
    while True:
        r, c = random.randint(0, rows - 1), random.randint(0, cols - 1)
        if (r, c) not in occupied:
            return (r, c)


def _board_ascii(rows: int, cols: int, s1: list, s2: list, food: Tuple[int, int]) -> str:
    grid = [["." for _ in range(cols)] for _ in range(rows)]

    for i, (r, c) in enumerate(s1):
        grid[r][c] = "H" if i == 0 else "1"
    for i, (r, c) in enumerate(s2):
        grid[r][c] = "A" if i == 0 else "2"

    fr, fc = food
    if grid[fr][fc] == ".":
        grid[fr][fc] = "F"

    top = "+" + "-" * (cols * 2 + 1) + "+"
    lines = [top]
    for r in range(rows):
        lines.append("| " + " ".join(grid[r]) + " |")
    lines.append(top)
    return "\n".join(lines)


@dataclass
class SnakeSession:
    id: str
    m1: str
    m2: str
    rows: int
    cols: int
    snake1: List[Tuple[int, int]] = field(default_factory=list)
    snake2: List[Tuple[int, int]] = field(default_factory=list)
    dir1: str = "RIGHT"
    dir2: str = "LEFT"
    food: Tuple[int, int] = (0, 0)
    score1: int = 0
    score2: int = 0
    step_count: int = 0
    max_steps: int = 200
    done: bool = False
    winner: Optional[int] = None
    death_reason: str = ""
    benchmark_run_id: Optional[str] = None

    def occupied(self) -> set:
        return set(self.snake1) | set(self.snake2)

    def build_prompt(self, player: int) -> str:
        my_snake = self.snake1 if player == 1 else self.snake2
        opp_snake = self.snake2 if player == 1 else self.snake1
        my_dir = self.dir1 if player == 1 else self.dir2
        head = my_snake[0]
        opp_head = opp_snake[0]

        ascii_board = _board_ascii(self.rows, self.cols, self.snake1, self.snake2, self.food)

        opp_label = "A" if player == 1 else "H"

        valid = []
        for d, (dr, dc) in DIRS.items():
            if d == OPPOSITE.get(my_dir):
                continue
            nr, nc = head[0] + dr, head[1] + dc
            if 0 <= nr < self.rows and 0 <= nc < self.cols:
                valid.append(d)

        lines = [
            f"You are Player {player} in Snake Duel on a {self.rows}x{self.cols} board.",
            f"Your snake is marked 'H' (head) and '{'1' if player == 1 else '2'}' (body). "
            f"Opponent is '{opp_label}' (head) and '{'2' if player == 1 else '1'}' (body). "
            f"Food is 'F'.",
            "",
            ascii_board,
            "",
            f"Your head: row={head[0]}, col={head[1]}  |  Length: {len(my_snake)}  |  Score: {self.score1 if player == 1 else self.score2}",
            f"Food at: row={self.food[0]}, col={self.food[1]}",
            f"Opponent head: row={opp_head[0]}, col={opp_head[1]}  |  Length: {len(opp_snake)}",
            f"Current direction: {my_dir}",
            f"Step {self.step_count + 1} of {self.max_steps}.",
            "",
            "Rules: eat food (F) to grow. Hitting a wall, your own body, or the opponent's body kills you.",
            f"Valid moves: {', '.join(valid)}",
            f"Reply with exactly one word: {' or '.join(valid)}",
        ]
        return "\n".join(lines)


def _parse_direction(text: str, current_dir: str) -> str:
    t = (text or "").upper().strip()
    for d in DIRS:
        if d in t and d != OPPOSITE.get(current_dir):
            return d
    return current_dir


def start_session(m1: str, m2: str, rows: int = 15, cols: int = 15) -> SnakeSession:
    mid_r = rows // 2
    s1 = [(mid_r, 2), (mid_r, 1), (mid_r, 0)]
    s2 = [(mid_r, cols - 3), (mid_r, cols - 2), (mid_r, cols - 1)]

    occupied = set(s1) | set(s2)
    food = _random_food(rows, cols, occupied)

    return SnakeSession(
        id=str(uuid.uuid4()),
        m1=m1,
        m2=m2,
        rows=rows,
        cols=cols,
        snake1=s1,
        snake2=s2,
        dir1="RIGHT",
        dir2="LEFT",
        food=food,
    )


def play_step(session: SnakeSession) -> Dict[str, Any]:
    if session.done:
        return _state_dict(session)

    llm1 = LLMClient(session.m1)
    llm2 = LLMClient(session.m2)

    u1: Dict[str, Any] = {}
    u2: Dict[str, Any] = {}

    r1 = llm1.get_response(session.build_prompt(1), max_tokens=16, temperature=0.3, usage_out=u1)
    r2 = llm2.get_response(session.build_prompt(2), max_tokens=16, temperature=0.3, usage_out=u2)

    d1 = _parse_direction(r1, session.dir1)
    d2 = _parse_direction(r2, session.dir2)
    session.dir1 = d1
    session.dir2 = d2

    dr1, dc1 = DIRS[d1]
    dr2, dc2 = DIRS[d2]
    new_head1 = (session.snake1[0][0] + dr1, session.snake1[0][1] + dc1)
    new_head2 = (session.snake2[0][0] + dr2, session.snake2[0][1] + dc2)

    p1_dead = False
    p2_dead = False
    reason = ""

    def _wall_check(h):
        return not (0 <= h[0] < session.rows and 0 <= h[1] < session.cols)

    body1 = set(session.snake1[:-1])
    body2 = set(session.snake2[:-1])
    all_body = body1 | body2

    if _wall_check(new_head1):
        p1_dead = True
        reason = "P1 hit wall"
    elif new_head1 in all_body:
        p1_dead = True
        reason = "P1 hit a body"

    if _wall_check(new_head2):
        p2_dead = True
        reason = (reason + " & " if reason else "") + "P2 hit wall"
    elif new_head2 in all_body:
        p2_dead = True
        reason = (reason + " & " if reason else "") + "P2 hit a body"

    if new_head1 == new_head2:
        p1_dead = True
        p2_dead = True
        reason = "Head-on collision"

    if not p1_dead:
        session.snake1 = [new_head1] + session.snake1
        if new_head1 == session.food:
            session.score1 += 1
        else:
            session.snake1.pop()

    if not p2_dead:
        session.snake2 = [new_head2] + session.snake2
        if new_head2 == session.food:
            session.score2 += 1
        else:
            session.snake2.pop()

    if (not p1_dead and new_head1 == session.food) or (not p2_dead and new_head2 == session.food):
        session.food = _random_food(session.rows, session.cols, session.occupied())

    session.step_count += 1

    if p1_dead and p2_dead:
        session.done = True
        session.winner = 0
        session.death_reason = reason
    elif p1_dead:
        session.done = True
        session.winner = 2
        session.death_reason = reason
    elif p2_dead:
        session.done = True
        session.winner = 1
        session.death_reason = reason
    elif session.step_count >= session.max_steps:
        session.done = True
        if session.score1 > session.score2:
            session.winner = 1
        elif session.score2 > session.score1:
            session.winner = 2
        else:
            session.winner = 0
        session.death_reason = "Time limit"

    return _state_dict(session, d1, d2, u1, u2)


def _state_dict(session, d1=None, d2=None, u1=None, u2=None):
    return {
        "session_id": session.id,
        "rows": session.rows,
        "cols": session.cols,
        "snake1": [list(s) for s in session.snake1],
        "snake2": [list(s) for s in session.snake2],
        "food": list(session.food),
        "score1": session.score1,
        "score2": session.score2,
        "dir1": d1 or session.dir1,
        "dir2": d2 or session.dir2,
        "step": session.step_count,
        "max_steps": session.max_steps,
        "done": session.done,
        "winner": session.winner,
        "death_reason": session.death_reason,
        "usage1": u1 or {},
        "usage2": u2 or {},
    }


def session_state(session: SnakeSession) -> Dict[str, Any]:
    return _state_dict(session)


def winner_side(session: SnakeSession) -> int:
    return session.winner if session.winner is not None else 0
