"""Auction Blitz — live ascending auctions (bid / pass back-and-forth per item)."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from src.engine.agent_client import ARENA_AGENT_MAX_STEPS, AgentClient, terminal_result
from src.engine.game_tools import AUCTION_TOOLS

ROUNDS = 8
STARTING_BUDGET = 1000
MAX_ACTIONS_PER_ITEM = 24


def _other(player: str) -> str:
    return "player2" if player == "player1" else "player1"


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
class AuctionItem:
    item_name: str
    value: int
    hint: str


@dataclass
class LiveAuction:
    """One item being bid on in real time."""
    item: AuctionItem
    round_num: int  # 1-based display round
    opener: str
    to_act: str
    high_bid: int = 0
    high_bidder: Optional[str] = None
    log: List[Dict[str, Any]] = field(default_factory=list)
    action_count: int = 0
    opening_passes: int = 0


@dataclass
class AuctionSession:
    model1: str
    model2: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    budget_p1: int = STARTING_BUDGET
    budget_p2: int = STARTING_BUDGET
    value_p1: int = 0
    value_p2: int = 0
    items: List[AuctionItem] = field(default_factory=list)
    current_round: int = 0
    done: bool = False
    benchmark_run_id: Optional[str] = None
    move_seq: int = 0
    history: List[Dict[str, Any]] = field(default_factory=list)
    live: Optional[LiveAuction] = None


def _generate_items(n: int = ROUNDS) -> List[AuctionItem]:
    import random

    names = random.sample(ITEM_NAMES, min(n, len(ITEM_NAMES)))
    items = []
    for i in range(n):
        value = random.randint(15, 150)
        items.append(AuctionItem(
            item_name=names[i % len(names)],
            value=value,
            hint=_value_hint(value),
        ))
    return items


def start_session(p1: str, p2: str) -> AuctionSession:
    return AuctionSession(model1=p1, model2=p2, items=_generate_items())


def _budget(session: AuctionSession, player: str) -> int:
    return session.budget_p1 if player == "player1" else session.budget_p2


def _value_won(session: AuctionSession, player: str) -> int:
    return session.value_p1 if player == "player1" else session.value_p2


def _min_bid(live: LiveAuction) -> int:
    return live.high_bid + 1 if live.high_bid > 0 else 1


def _build_prompt(session: AuctionSession, live: LiveAuction, player: str) -> str:
    opp = _other(player)
    budget = _budget(session, player)
    opp_budget = _budget(session, opp)
    my_pts = _value_won(session, player)
    opp_pts = _value_won(session, opp)
    rounds_done = session.current_round
    rounds_left = len(session.items) - session.current_round
    item = live.item

    log_lines = []
    for e in live.log:
        who = "You" if e["player"] == player else "Opponent"
        if e["action"] == "pass":
            log_lines.append(f"  {who}: PASS")
        else:
            log_lines.append(f"  {who}: bid {e['amount']}")

    hist_lines = []
    for h in session.history[-5:]:
        w = h.get("winner")
        wlabel = "you" if w == player else ("opponent" if w else "nobody")
        my_b = h["bid_p1"] if player == "player1" else h["bid_p2"]
        ob = h["bid_p2"] if player == "player1" else h["bid_p1"]
        hist_lines.append(
            f"  Round {h['round']}: {h['item']} (value {h['value']}) — "
            f"final bids {my_b}/{ob}, winner: {wlabel}"
        )

    high_line = (
        f"Current high bid: {live.high_bid} by "
        f"{'you' if live.high_bidder == player else 'opponent' if live.high_bidder else 'none'}"
    )
    min_b = _min_bid(live)
    if min_b > budget:
        legal = "You cannot afford to raise — you must PASS."
    else:
        legal = f"To raise, bid at least {min_b} (max {budget}). Or PASS."

    return (
        f"Auction Blitz — LIVE ascending auction.\n"
        f"ITEM ROUND {live.round_num} of {len(session.items)} "
        f"({rounds_left} item(s) left including this one, {rounds_done} completed).\n\n"
        f"YOUR STATUS: budget {budget}, points won {my_pts}.\n"
        f"OPPONENT STATUS: budget {opp_budget}, points won {opp_pts}.\n\n"
        f"ITEM: {item.item_name}\n"
        f"VALUE HINT: {item.hint}\n\n"
        f"{high_line}\n"
        f"{legal}\n\n"
        f"BIDS THIS ITEM:\n"
        f"{chr(10).join(log_lines) if log_lines else '  (none yet)'}\n\n"
        f"PRIOR ITEMS:\n"
        f"{chr(10).join(hist_lines) if hist_lines else '  (none)'}\n\n"
        "RULES: Live ascending auction — you may BID/raise many times (not just one "
        "exchange). Each bid must beat the current high. After any bid, the other player "
        "may bid higher or PASS. When you PASS while the opponent already has the high "
        "bid, they win this item immediately. If nobody has bid yet, a pass lets the "
        "other player act; if both pass with no bids, the item is unsold. Winner pays "
        "their winning bid; true value is added to their points won. Match winner = "
        "most points won after all items (not leftover budget)."
    )


def _auction_state_payload(session: AuctionSession, live: LiveAuction, player: str) -> Dict[str, Any]:
    opp = _other(player)
    return {
        "round": live.round_num,
        "total_rounds": len(session.items),
        "rounds_completed": session.current_round,
        "rounds_remaining": len(session.items) - session.current_round,
        "item": live.item.item_name,
        "hint": live.item.hint,
        "your_budget": _budget(session, player),
        "opponent_budget": _budget(session, opp),
        "your_value_won": _value_won(session, player),
        "opponent_value_won": _value_won(session, opp),
        "high_bid": live.high_bid,
        "high_bidder": live.high_bidder,
        "min_raise": _min_bid(live),
        "to_act": live.to_act,
        "you_are": player,
        "bid_log": list(live.log),
        "recent_item_history": session.history[-5:],
    }


def _get_agent_action(
    session: AuctionSession, live: LiveAuction, player: str,
) -> Tuple[str, int, Dict[str, Any]]:
    budget = _budget(session, player)
    min_b = _min_bid(live)
    prompt = _build_prompt(session, live, player)
    model_id = session.model1 if player == "player1" else session.model2

    def executor(name: str, args: Dict[str, Any]) -> Any:
        if name == "get_auction_state":
            return _auction_state_payload(session, live, player)
        if name == "auction_action":
            action = str(args.get("action", "")).lower().strip()
            if action not in ("bid", "pass"):
                return {"error": "action must be 'bid' or 'pass'"}
            payload: Dict[str, Any] = {"action": action}
            if action == "bid":
                if args.get("amount") is None:
                    return {"error": "bid requires amount"}
                try:
                    payload["amount"] = int(args["amount"])
                except (TypeError, ValueError):
                    return {"error": "amount must be an integer"}
            return terminal_result(payload)
        if name == "place_bid":
            # legacy tool name
            try:
                amt = int(args.get("amount", 0))
            except (TypeError, ValueError):
                return {"error": "amount must be an integer"}
            return terminal_result({"action": "bid", "amount": amt})
        return {"error": f"Unknown tool {name}"}

    usage: Dict[str, Any] = {}
    agent = AgentClient(model_id)
    try:
        turn = agent.run_turn(
            [{"role": "user", "content": prompt}],
            AUCTION_TOOLS,
            executor,
            max_steps=ARENA_AGENT_MAX_STEPS,
            max_tokens=128,
            temperature=0.35,
            usage_out=usage,
            system=(
                "Live ascending auction: bid/raise as many times as needed. Use "
                "get_auction_state, then auction_action once — bid (amount > high) or "
                "pass (ends item only if opponent has the high bid)."
            ),
        )
        action = str(turn.action_args.get("action", "pass")).lower()
        amount = int(turn.action_args.get("amount", 0)) if turn.action_args.get("amount") is not None else 0
        usage["tool_calls"] = turn.tool_calls
    except Exception as exc:
        usage["error"] = str(exc)
        action, amount = "pass", 0

    if action == "bid":
        amount = max(0, min(amount, budget))
        if amount < min_b:
            action, amount = "pass", 0
            usage["corrected"] = "bid_too_low_auto_pass"
    return action, amount, usage


def _start_live(session: AuctionSession) -> LiveAuction:
    item = session.items[session.current_round]
    opener = "player1" if session.current_round % 2 == 0 else "player2"
    live = LiveAuction(
        item=item,
        round_num=session.current_round + 1,
        opener=opener,
        to_act=opener,
    )
    session.live = live
    return live


def _settle_item(session: AuctionSession, live: LiveAuction) -> Dict[str, Any]:
    winner = live.high_bidder
    final_bid = live.high_bid if winner else 0
    if winner == "player1" and final_bid > 0:
        session.budget_p1 -= final_bid
        session.value_p1 += live.item.value
    elif winner == "player2" and final_bid > 0:
        session.budget_p2 -= final_bid
        session.value_p2 += live.item.value

    rec = {
        "round": live.round_num,
        "item": live.item.item_name,
        "value": live.item.value,
        "hint": live.item.hint,
        "bid_p1": final_bid if winner == "player1" else _final_bid_for_player(live, "player1"),
        "bid_p2": final_bid if winner == "player2" else _final_bid_for_player(live, "player2"),
        "winner": winner,
        "budget_p1": session.budget_p1,
        "budget_p2": session.budget_p2,
        "value_p1": session.value_p1,
        "value_p2": session.value_p2,
        "bid_log": list(live.log),
    }
    session.history.append(rec)
    session.current_round += 1
    session.live = None
    if session.current_round >= len(session.items):
        session.done = True
    return rec


def _final_bid_for_player(live: LiveAuction, player: str) -> int:
    best = 0
    for e in live.log:
        if e["player"] == player and e["action"] == "bid":
            best = max(best, e["amount"])
    return best


def _apply_action(
    session: AuctionSession, live: LiveAuction, player: str, action: str, amount: int,
) -> Tuple[str, Optional[Dict[str, Any]]]:
    """Returns (status, settle_record). status: continue | settled"""
    if action == "bid":
        budget = _budget(session, player)
        min_b = _min_bid(live)
        if amount < min_b or amount > budget:
            action = "pass"
        else:
            live.log.append({"player": player, "action": "bid", "amount": amount})
            live.high_bid = amount
            live.high_bidder = player
            live.opening_passes = 0
            live.to_act = _other(player)
            live.action_count += 1
            return "continue", None

    # pass
    live.log.append({"player": player, "action": "pass"})
    live.action_count += 1

    if live.high_bidder and player != live.high_bidder:
        return "settled", _settle_item(session, live)

    if live.high_bidder is None:
        live.opening_passes += 1
        if live.opening_passes >= 2:
            return "settled", _settle_item(session, live)
        live.to_act = _other(player)
        return "continue", None

    # high bidder passed (shouldn't happen often) — treat as settle in their favor
    return "settled", _settle_item(session, live)


def advance_step(session: AuctionSession) -> Dict[str, Any]:
    """One agent bid or pass; may settle the current item."""
    if session.done:
        return {
            "done": True,
            "winner_side": winner_side(session),
            "step": {"type": "game_over"},
        }

    if session.current_round >= len(session.items):
        session.done = True
        return {"done": True, "winner_side": winner_side(session), "step": {"type": "game_over"}}

    live = session.live
    if live is None:
        live = _start_live(session)
        step = {
            "type": "item_start",
            "round": live.round_num,
            "item": live.item.item_name,
            "hint": live.item.hint,
            "to_act": live.to_act,
            "opener": live.opener,
        }
        return _live_view(session, step)

    if live.action_count >= MAX_ACTIONS_PER_ITEM:
        settle = _settle_item(session, live)
        return _live_view(session, {
            "type": "item_settled",
            "reason": "max_actions",
            **settle,
        })

    player = live.to_act
    action, amount, usage = _get_agent_action(session, live, player)
    status, settle_rec = _apply_action(session, live, player, action, amount)

    step: Dict[str, Any] = {
        "type": "bid" if action == "bid" else "pass",
        "player": player,
        "action": action,
        "amount": amount if action == "bid" else None,
        "to_act": live.to_act if status == "continue" else None,
        "high_bid": live.high_bid,
        "high_bidder": live.high_bidder,
        "bid_log": list(live.log),
        "usage": usage,
    }
    if usage.get("tool_calls"):
        step["tool_calls"] = usage["tool_calls"]

    if status == "settled" and settle_rec:
        step = {"type": "item_settled", **settle_rec, "last_action": step}

    out = _live_view(session, step)
    if settle_rec:
        out["round_result"] = settle_rec
    return out


def _live_view(session: AuctionSession, step: Dict[str, Any]) -> Dict[str, Any]:
    live = session.live
    payload: Dict[str, Any] = {
        **session_state(session),
        "step": step,
    }
    if live:
        payload["live"] = {
            "round": live.round_num,
            "item": live.item.item_name,
            "hint": live.item.hint,
            "to_act": live.to_act,
            "high_bid": live.high_bid,
            "high_bidder": live.high_bidder,
            "min_bid": _min_bid(live),
            "bid_log": list(live.log),
            "opener": live.opener,
        }
    return payload


def play_round(session: AuctionSession) -> Dict[str, Any]:
    """Run one full item auction (many steps). Used by tests / legacy."""
    if session.done or session.current_round >= len(session.items):
        session.done = True
        return {"done": True, "winner_side": winner_side(session)}

    if session.live is None:
        _start_live(session)

    last: Dict[str, Any] = {}
    for _ in range(MAX_ACTIONS_PER_ITEM + 2):
        result = advance_step(session)
        last = result
        if result.get("done"):
            break
        if result.get("step", {}).get("type") == "item_settled":
            break
        if session.live is None:
            break
    return last


def winner_side(session: AuctionSession) -> int:
    if session.value_p1 > session.value_p2:
        return 1
    if session.value_p2 > session.value_p1:
        return 2
    return 0


def session_state(session: AuctionSession) -> Dict[str, Any]:
    cur = None
    if not session.done and session.current_round < len(session.items):
        if session.live:
            r = session.live
            cur = {
                "item_name": r.item.item_name,
                "hint": r.item.hint,
                "round": r.round_num,
            }
        else:
            item = session.items[session.current_round]
            cur = {
                "item_name": item.item_name,
                "hint": item.hint,
                "round": session.current_round + 1,
            }
    return {
        "session_id": session.id,
        "budget_p1": session.budget_p1,
        "budget_p2": session.budget_p2,
        "value_p1": session.value_p1,
        "value_p2": session.value_p2,
        "current_round": session.current_round,
        "total_rounds": len(session.items),
        "rounds_completed": session.current_round,
        "rounds_remaining": max(0, len(session.items) - session.current_round),
        "current_item": cur,
        "history": session.history,
        "done": session.done,
        "winner_side": winner_side(session) if session.done else None,
        "starting_budget": STARTING_BUDGET,
    }
