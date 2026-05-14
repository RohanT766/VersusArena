"""Code repair mini-benchmark: patch a buggy snippet; graded vs canonical."""

from __future__ import annotations

import re
import textwrap
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from src.utils.common import LLMClient

CHALLENGES: List[Dict[str, Any]] = [
    {
        "id": "arith_sum",
        "title": "Fix addition",
        "broken": '''def sum_pair(a, b):\n    return a - b''',
        "canonical_contains": "return a + b",
        "hint": "The function should return the sum of a and b.",
    },
    {
        "id": "list_max",
        "title": "Fix maximum",
        "broken": '''def my_max(xs):\n    m = xs[0]\n    for x in xs:\n        if x < m:\n            m = x\n    return m''',
        "canonical_contains": "if x > m",
        "hint": "Track the largest element, not the smallest.",
    },
    {
        "id": "str_dup",
        "title": "Fix string doubling",
        "broken": '''def duplicate(s):\n    return s''',
        "canonical_contains": "return s + s",
        "hint": "Return the string concatenated with itself.",
    },
]


@dataclass
class CodeDebugSession:
    model1: str
    model2: str
    challenge: Dict[str, Any]
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    submissions: Dict[str, str] = field(default_factory=dict)
    benchmark_run_id: Optional[str] = None

    @staticmethod
    def score(code: str, challenge: Dict[str, Any]) -> float:
        if not code:
            return 0.0
        norm = re.sub(r"\s+", "", code.strip())
        needle = re.sub(r"\s+", "", challenge["canonical_contains"])
        return 1.0 if needle in norm else 0.0


def new_code_debug_session(m1: str, m2: str, challenge_index: int = 0) -> CodeDebugSession:
    ch = CHALLENGES[challenge_index % len(CHALLENGES)]
    return CodeDebugSession(model1=m1, model2=m2, challenge=dict(ch))


def build_prompt(ch: Dict[str, Any]) -> str:
    return textwrap.dedent(
        f"""\
        Fix the Python bug. Return ONLY the full corrected function source code, no markdown fences.

        {ch['hint']}

        Broken code:
        {ch['broken']}
        """
    )


def run_player(session: CodeDebugSession, player: str) -> Dict[str, Any]:
    model_id = session.model1 if player == "player1" else session.model2
    llm = LLMClient(model_id)
    usage: Dict[str, Any] = {}
    resp = llm.get_response(build_prompt(session.challenge), max_tokens=400, temperature=0.15, usage_out=usage)
    code = resp or ""
    session.submissions[player] = code
    sc = CodeDebugSession.score(code, session.challenge)
    return {"player": player, "score": sc, "code_preview": code[:800], "usage": usage}
