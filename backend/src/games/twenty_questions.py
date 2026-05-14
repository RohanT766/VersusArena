"""20 Questions style benchmark: Answerer holds a secret category word; Questioner asks yes/no."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from src.utils.common import LLMClient

SECRETS = [
    "ELEPHANT",
    "SATURN",
    "VIOLIN",
    "oxygen",
    "Tokyo",
    "photosynthesis",
    "ALGEBRA",
]


@dataclass
class TwentyQuestionsSession:
    id: str
    answerer_model: str
    questioner_model: str
    secret: str
    max_questions: int = 20
    transcript: List[Dict[str, str]] = field(default_factory=list)
    guess_used: bool = False
    benchmark_run_id: Optional[str] = None


def start_session(answerer_model: str, questioner_model: str, secret: Optional[str] = None) -> TwentyQuestionsSession:
    sec = (secret or SECRETS[0]).strip()
    return TwentyQuestionsSession(
        id=str(uuid.uuid4()),
        answerer_model=answerer_model,
        questioner_model=questioner_model,
        secret=sec,
    )


def _answer_prompt(secret: str, question: str) -> str:
    return f"""You are the answerer in 20 questions. The secret is: "{secret}".
Rules: reply with exactly YES, NO, or MAYBE (if truly unclear). One word only.
Question: {question}"""


def _question_prompt(transcript: List[Dict[str, str]], remaining: int) -> str:
    lines = ["You are the questioner. Guess the secret in as few yes/no questions as possible."]
    for t in transcript[-12:]:
        lines.append(f"Q: {t['q']}\nA: {t['a']}")
    lines.append(f"Questions used: {len(transcript)} / {remaining + len(transcript)} budget.")
    lines.append('Ask ONE concise yes/no question, or if ready to guess start with "FINAL GUESS: <word>".')
    return "\n".join(lines)


def play_turn(session: TwentyQuestionsSession) -> Dict[str, Any]:
    if len(session.transcript) >= session.max_questions and not session.guess_used:
        return {"done": True, "outcome": "budget", "secret": session.secret}

    q_llm = LLMClient(session.questioner_model)
    a_llm = LLMClient(session.answerer_model)
    uq: Dict[str, Any] = {}
    ua: Dict[str, Any] = {}

    q_text = q_llm.get_response(
        _question_prompt(session.transcript, session.max_questions - len(session.transcript)),
        max_tokens=80,
        temperature=0.5,
        usage_out=uq,
    ) or "Is it alive?"

    if re.search(r"FINAL\s*GUESS\s*:", q_text.upper()):
        guess = q_text.split(":", 1)[-1].strip().upper().split()[0] if ":" in q_text else ""
        session.guess_used = True
        ok = guess == session.secret.upper().split()[0]
        session.transcript.append({"q": q_text, "a": "RESOLVED", "guess": guess})
        return {
            "done": True,
            "outcome": "win" if ok else "loss",
            "guess": guess,
            "secret": session.secret,
            "questions_used": len(session.transcript),
            "usage_q": uq,
        }

    a_text = a_llm.get_response(
        _answer_prompt(session.secret, q_text),
        max_tokens=8,
        temperature=0.0,
        usage_out=ua,
    ) or "MAYBE"
    ans = "YES"
    au = (a_text or "").upper().strip()
    if au.startswith("N"):
        ans = "NO"
    elif "MAYBE" in au:
        ans = "MAYBE"

    session.transcript.append({"q": q_text, "a": ans})
    return {
        "done": False,
        "exchange": {"q": q_text, "a": ans},
        "count": len(session.transcript),
        "usage_q": uq,
        "usage_a": ua,
        "usage": {"questioner": uq, "answerer": ua},
    }
