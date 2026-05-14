"""Iterated Prisoner's Dilemma benchmark (two LLMs, fixed rounds)."""

from __future__ import annotations

import json
import random
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from src.utils.common import LLMClient

# Payoffs: (P1, P2) for (P1 move, P2 move) with C=cooperate, D=defect
PAYOFFS = {
    ("C", "C"): (3, 3),
    ("C", "D"): (0, 5),
    ("D", "C"): (5, 0),
    ("D", "D"): (1, 1),
}


def _parse_move(text: str) -> str:
    t = (text or "").upper().strip()
    if "COOPERATE" in t or t.startswith("C"):
        return "C"
    if "DEFECT" in t or t.startswith("D"):
        return "D"
    return "D"


@dataclass
class PrisonersSession:
    id: str
    m1: str
    m2: str
    rounds_total: int
    history: List[Dict[str, Any]] = field(default_factory=list)
    scores: Tuple[int, int] = (0, 0)
    round_index: int = 0
    benchmark_run_id: Optional[str] = None

    def build_prompt(self, player: int) -> str:
        other = 2 if player == 1 else 1
        lines = [
            "Iterated Prisoner's Dilemma. Each round choose COOPERATE or DEFECT.",
            "Payoffs per round for you / opponent: both C -> 3/3, you C they D -> 0/5, you D they C -> 5/0, both D -> 1/1.",
            f"You are Player {player}. Opponent is a language model (Player {other}).",
            f"Round {self.round_index + 1} of {self.rounds_total}.",
            "History (you / opponent / your pts / their pts):",
        ]
        for h in self.history[-6:]:
            lines.append(
                f"  R{h['round']}: P1={h['m1']} P2={h['m2']} scores {h['s1']}-{h['s2']}"
            )
        lines.append('Reply with exactly one word: COOPERATE or DEFECT.')
        return "\n".join(lines)


def start_session(m1: str, m2: str, rounds: int = 10) -> PrisonersSession:
    return PrisonersSession(id=str(uuid.uuid4()), m1=m1, m2=m2, rounds_total=rounds)


def play_round(session: PrisonersSession) -> Dict[str, Any]:
    if session.round_index >= session.rounds_total:
        return {"done": True, "scores": session.scores}

    llm1 = LLMClient(session.m1)
    llm2 = LLMClient(session.m2)
    u1: Dict[str, Any] = {}
    u2: Dict[str, Any] = {}
    r1 = llm1.get_response(session.build_prompt(1), max_tokens=16, temperature=0.3, usage_out=u1)
    r2 = llm2.get_response(session.build_prompt(2), max_tokens=16, temperature=0.3, usage_out=u2)
    m1 = _parse_move(r1 or "")
    m2 = _parse_move(r2 or "")
    s1, s2 = PAYOFFS[(m1, m2)]
    session.scores = (session.scores[0] + s1, session.scores[1] + s2)
    session.history.append(
        {
            "round": session.round_index + 1,
            "m1": m1,
            "m2": m2,
            "s1": s1,
            "s2": s2,
            "raw1": (r1 or "")[:200],
            "raw2": (r2 or "")[:200],
            "usage1": u1,
            "usage2": u2,
        }
    )
    session.round_index += 1
    done = session.round_index >= session.rounds_total
    return {
        "done": done,
        "round": session.history[-1],
        "scores": session.scores,
        "session_id": session.id,
    }


def winner_side(session: PrisonersSession) -> int:
    if session.scores[0] > session.scores[1]:
        return 1
    if session.scores[1] > session.scores[0]:
        return 2
    return 0
