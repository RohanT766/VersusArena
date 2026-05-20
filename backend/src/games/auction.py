"""Auction Blitz — bid on items with hidden values; deterministic scoring."""

from __future__ import annotations

import random
import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from src.engine.agent_client import ARENA_AGENT_MAX_STEPS, AgentClient, terminal_result
from src.engine.game_tools import AUCTION_TOOLS

ROUNDS = 8
STARTING_BUDGET = 1000

ITEM_NAMES = [
    "Ancient Relic", "Mystery Crate", "Tech Bundle", "Rare Manuscript",
    "Collector's Coin", "Vintage Watch", "Art Sketch", "Prototype Gadget",
    "Signed Poster", "Jeweled Box", "Antique Map", "Sports Memorabilia",
]

HINTS = [
    ("low", "Worth relatively little (under 40)"),
    ("medium-low", "Worth 40–70"),
    ("medium", "Worth 70–100"),
    ("medium-high", "Worth 100–130"),
    ("high", "Worth over 130"),
]


def _value_hint(value: int) -> str:
    if value < 40:
        return HINTS[0][1]
    if value < 70:
        return HINTS[1][1]
    if value < 100:
        return HINTS[2][1]
    if value < 130:
        return HINTS[3][1]
    return HINTS[4][1]


@dataclass
class AuctionRound:
    item_name: str
    value: int
    hint: str
    bid_p1: Optional[int] = None
    bid_p2: Optional[int] = None
    winner: Optional[str] = None


@dataclass
class AuctionSession:
    model1: str
    model2: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    budget_p1: int = STARTING_BUDGET
    budget_p2: int = STARTING_BUDGET
    value_p1: int = 0
    value_p2: int = 0
    rounds: List[AuctionRound] = field(default_factory=list)
    current_round: int = 0
    done: bool = False
    benchmark_run_id: Optional[str] = None
    move_seq: int = 0
    history: List[Dict[str, Any]] = field(default_factory=list)


def _parse_bid(text: str, max_bid: int) -> int:
    m = re.search(r"\b(\d+)\b", text or "")
    if m:
        return max(0, min(int(m.group(1)), max_bid))
    return 0


def _generate_rounds(n: int = ROUNDS) -> List[AuctionRound]:
    names = random.sample(ITEM_NAMES, min(n, len(ITEM_NAMES)))
    rounds = []
    for i in range(n):
        value = random.randint(15, 150)
        rounds.append(AuctionRound(
            item_name=names[i % len(names)],
            value=value,
            hint=_value_hint(value),
        ))
    return rounds


def start_session(p1: str, p2: str) -> AuctionSession:
    return AuctionSession(model1=p1, model2=p2, rounds=_generate_rounds())


def _get_bid(session: AuctionSession, player: str, rnd: AuctionRound) -> tuple[int, Dict[str, Any]]:
    budget = session.budget_p1 if player == "player1" else session.budget_p2
    value_won = session.value_p1 if player == "player1" else session.value_p2
    opp_value = session.value_p2 if player == "player1" else session.value_p1
    model_id = session.model1 if player == "player1" else session.model2
    opp_budget = session.budget_p2 if player == "player1" else session.budget_p1
    rounds_left = len(session.rounds) - session.current_round

    hist_lines = []
    for h in session.history[-4:]:
        w = h.get("winner") or "tie"
        my_bid = h["bid_p1"] if player == "player1" else h["bid_p2"]
        opp_bid = h["bid_p2"] if player == "player1" else h["bid_p1"]
        hist_lines.append(
            f"R{h['round']}: {h['item']} (value {h['value']}) — bids {my_bid}/{opp_bid}, winner: {w}"
        )
    hist = "\n".join(hist_lines) if hist_lines else "No prior rounds."

    user_msg = (
        f"Auction Blitz — round {session.current_round + 1}/{len(session.rounds)} ({rounds_left} including this).\n"
        "RULES: Bid 0 to budget. Highest bid wins item; bid deducted. Ties = no winner. Maximize value won.\n"
        f"Item: {rnd.item_name}\nValue hint: {rnd.hint}"
    )

    def executor(name: str, args: Dict[str, Any]) -> Any:
        if name == "get_auction_state":
            return {
                "round": session.current_round + 1,
                "total_rounds": len(session.rounds),
                "item": rnd.item_name,
                "hint": rnd.hint,
                "your_budget": budget,
                "opponent_budget": opp_budget,
                "your_value_won": value_won,
                "opponent_value_won": opp_value,
                "recent_history": hist,
            }
        if name == "place_bid":
            if args.get("amount") is None:
                return {"error": "place_bid requires integer amount"}
            try:
                raw = int(args.get("amount"))
            except (TypeError, ValueError):
                return {"error": "place_bid amount must be an integer"}
            amount = max(0, min(raw, budget))
            return terminal_result({"amount": amount})
        return {"error": f"Unknown tool {name}"}

    usage: Dict[str, Any] = {}
    agent = AgentClient(model_id)
    try:
        turn = agent.run_turn(
            [{"role": "user", "content": user_msg}],
            AUCTION_TOOLS,
            executor,
            max_steps=ARENA_AGENT_MAX_STEPS,
            max_tokens=128,
            temperature=0.3,
            usage_out=usage,
            system="Use tools to review auction state, then place_bid once.",
        )
        bid = int(turn.action_args.get("amount", 0))
        usage["tool_calls"] = turn.tool_calls
    except Exception:
        bid = _parse_bid("", budget)
        usage.setdefault("error", "agent_turn_failed")
    return bid, usage


def play_round(session: AuctionSession) -> Dict[str, Any]:
    if session.done or session.current_round >= len(session.rounds):
        session.done = True
        return {"done": True, "winner_side": winner_side(session)}

    rnd = session.rounds[session.current_round]
    b1, u1 = _get_bid(session, "player1", rnd)
    b2, u2 = _get_bid(session, "player2", rnd)
    rnd.bid_p1 = b1
    rnd.bid_p2 = b2

    winner = None
    if b1 > b2 and b1 > 0:
        winner = "player1"
        session.budget_p1 -= b1
        session.value_p1 += rnd.value
    elif b2 > b1 and b2 > 0:
        winner = "player2"
        session.budget_p2 -= b2
        session.value_p2 += rnd.value

    rnd.winner = winner
    session.move_seq += 2
    rec = {
        "round": session.current_round + 1,
        "item": rnd.item_name,
        "value": rnd.value,
        "hint": rnd.hint,
        "bid_p1": b1,
        "bid_p2": b2,
        "winner": winner,
        "budget_p1": session.budget_p1,
        "budget_p2": session.budget_p2,
        "value_p1": session.value_p1,
        "value_p2": session.value_p2,
        "tool_calls_p1": u1.get("tool_calls"),
        "tool_calls_p2": u2.get("tool_calls"),
    }
    session.history.append(rec)
    session.current_round += 1

    if session.current_round >= len(session.rounds):
        session.done = True

    return {
        "round_result": rec,
        "done": session.done,
        "winner_side": winner_side(session) if session.done else None,
        "usage_p1": u1,
        "usage_p2": u2,
    }


def winner_side(session: AuctionSession) -> int:
    if session.value_p1 > session.value_p2:
        return 1
    if session.value_p2 > session.value_p1:
        return 2
    return 0


def session_state(session: AuctionSession) -> Dict[str, Any]:
    cur = None
    if not session.done and session.current_round < len(session.rounds):
        r = session.rounds[session.current_round]
        cur = {"item_name": r.item_name, "hint": r.hint, "round": session.current_round + 1}
    return {
        "session_id": session.id,
        "budget_p1": session.budget_p1,
        "budget_p2": session.budget_p2,
        "value_p1": session.value_p1,
        "value_p2": session.value_p2,
        "current_round": session.current_round,
        "total_rounds": len(session.rounds),
        "current_item": cur,
        "history": session.history,
        "done": session.done,
        "winner_side": winner_side(session) if session.done else None,
    }
