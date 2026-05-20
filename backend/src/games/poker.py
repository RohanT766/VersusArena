"""2-player Texas Hold'em — turn-based steps, standard 2-handed blinds & betting."""

from __future__ import annotations

import random
import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

from src.utils.common import LLMClient
from src.engine.agent_client import ARENA_AGENT_MAX_STEPS, AgentClient, terminal_result
from src.engine.game_tools import POKER_TOOLS
from src.games.poker_chips import (
    CHIPS_PER_PLAYER,
    TOTAL_CHIPS_IN_PLAY,
    copy_rack,
    empty_rack,
    make_starting_rack,
    merge_racks,
    rack_total,
    split_rack_between,
    chips_moved_breakdown,
    transfer_chips,
)

STARTING_CHIPS = CHIPS_PER_PLAYER
SMALL_BLIND = 10
BIG_BLIND = 20
MAX_HANDS = 10
MAX_ADVANCE_STEPS = 1200
MAX_ACTIONS_PER_HAND = 48

RANKS = "23456789TJQKA"
SUITS = "cdhs"
STREETS = ("preflop", "flop", "turn", "river")


def _make_deck() -> List[str]:
    return [f"{r}{s}" for r in RANKS for s in SUITS]


def _rank_value(rank: str) -> int:
    return RANKS.index(rank)


def _other(player: str) -> str:
    return "player2" if player == "player1" else "player1"


def _parse_action(text: str, to_call: int, chips: int, min_raise: int) -> Tuple[str, int]:
    t = (text or "").upper()
    if "FOLD" in t:
        return "fold", 0
    if "CHECK" in t and to_call == 0:
        return "check", 0
    if "CALL" in t:
        return "call", min(to_call, chips)
    m = re.search(r"RAISE\s*(\d+)", t)
    if m:
        amt = int(m.group(1))
        return "raise", min(chips, max(min_raise, amt))
    m = re.search(r"\b(\d+)\b", t)
    if m and ("RAISE" in t or "BET" in t):
        return "raise", min(chips, max(min_raise, int(m.group(1))))
    if to_call > 0:
        return "call", min(to_call, chips)
    return "check", 0


def _hand_strength(cards: List[str]) -> Tuple[int, ...]:
    if len(cards) < 5:
        cards = cards + ["2c"] * (5 - len(cards))
    ranks = sorted([_rank_value(c[0]) for c in cards], reverse=True)
    suits = [c[1] for c in cards]
    rank_counts: Dict[int, int] = {}
    for r in ranks:
        rank_counts[r] = rank_counts.get(r, 0) + 1
    counts = sorted(rank_counts.items(), key=lambda x: (-x[1], -x[0]))
    is_flush = len(set(suits)) == 1
    straight_high = -1
    uniq = sorted(set(ranks), reverse=True)
    if len(uniq) >= 5:
        for i in range(len(uniq) - 4):
            seq = uniq[i : i + 5]
            if seq[0] - seq[4] == 4:
                straight_high = seq[0]
    if 12 in uniq and 3 in uniq and 2 in uniq and 1 in uniq and 0 in uniq:
        straight_high = max(straight_high, 3)

    if is_flush and straight_high >= 0:
        return (8, straight_high)
    if counts[0][1] == 4:
        return (7, counts[0][0], counts[1][0])
    if counts[0][1] == 3 and counts[1][1] >= 2:
        return (6, counts[0][0], counts[1][0])
    if is_flush:
        return (5,) + tuple(ranks[:5])
    if straight_high >= 0:
        return (4, straight_high)
    if counts[0][1] == 3:
        kickers = [c[0] for c in counts[1:]]
        return (3, counts[0][0]) + tuple(kickers[:2])
    if counts[0][1] == 2 and counts[1][1] == 2:
        p = sorted([counts[0][0], counts[1][0]], reverse=True)
        kicker = max(r for r in ranks if r not in p)
        return (2, p[0], p[1], kicker)
    if counts[0][1] == 2:
        return (1, counts[0][0]) + tuple(ranks[:3])
    return (0,) + tuple(ranks[:5])


def _best_hand(hole: List[str], community: List[str]) -> Tuple[int, ...]:
    from itertools import combinations

    all_cards = hole + community
    if len(all_cards) < 5:
        return _hand_strength(all_cards)
    best = (-1,)
    for combo in combinations(all_cards, 5):
        s = _hand_strength(list(combo))
        if s > best:
            best = s
    return best


def _action_order(button: str, street: str) -> List[str]:
    """2-player: dealer posts SB and acts first preflop; BB acts first postflop."""
    bb = _other(button)
    if street == "preflop":
        return [button, bb]
    return [bb, button]


def _chips(session: "PokerSession", player: str) -> int:
    return session.chips_p1 if player == "player1" else session.chips_p2


def _rack(session: "PokerSession", player: str) -> Dict[str, int]:
    return session.rack_p1 if player == "player1" else session.rack_p2


def _empty_street_racks() -> Dict[str, Dict[str, int]]:
    return {"player1": empty_rack(), "player2": empty_rack()}


def _copy_street_racks(hand: "HandState") -> Dict[str, Dict[str, int]]:
    return {
        "player1": copy_rack(hand.street_chip_racks["player1"]),
        "player2": copy_rack(hand.street_chip_racks["player2"]),
    }


def _merge_street_to_pot(session: PokerSession, hand: HandState) -> None:
    """Collect current-street bets into the center pot."""
    for player in ("player1", "player2"):
        merge_racks(session.pot_rack, hand.street_chip_racks[player])
    hand.street_chip_racks = _empty_street_racks()


@dataclass
class HandState:
    deck: List[str]
    hole_p1: List[str] = field(default_factory=list)
    hole_p2: List[str] = field(default_factory=list)
    community: List[str] = field(default_factory=list)
    street: str = "preflop"
    street_bets: Dict[str, int] = field(default_factory=lambda: {"player1": 0, "player2": 0})
    street_chip_racks: Dict[str, Dict[str, int]] = field(default_factory=_empty_street_racks)
    in_hand: Dict[str, bool] = field(default_factory=lambda: {"player1": True, "player2": True})
    button: str = "player1"
    actions: List[Dict[str, Any]] = field(default_factory=list)
    acted_since_raise: Set[str] = field(default_factory=set)
    phase: str = "deal_hole"  # deal_hole | post_blinds | bet | deal_board | showdown | done
    deal_index: int = 0
    blind_step: int = 0
    board_deal_remaining: int = 0
    hand_num: int = 0
    actions_this_hand: int = 0


@dataclass
class PokerSession:
    model1: str
    model2: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    chips_p1: int = STARTING_CHIPS
    chips_p2: int = STARTING_CHIPS
    rack_p1: Dict[str, int] = field(default_factory=make_starting_rack)
    rack_p2: Dict[str, int] = field(default_factory=make_starting_rack)
    pot_rack: Dict[str, int] = field(default_factory=empty_rack)
    hand_num: int = 0
    done: bool = False
    advance_steps: int = 0
    benchmark_run_id: Optional[str] = None
    move_seq: int = 0
    log: List[Dict[str, Any]] = field(default_factory=list)
    last_hand: Optional[Dict[str, Any]] = None
    active: Optional[HandState] = None


def _sync_chip_totals(session: PokerSession) -> None:
    session.chips_p1 = rack_total(session.rack_p1)
    session.chips_p2 = rack_total(session.rack_p2)


def start_session(p1: str, p2: str) -> PokerSession:
    sess = PokerSession(model1=p1, model2=p2)
    sess.rack_p1 = make_starting_rack()
    sess.rack_p2 = make_starting_rack()
    sess.pot_rack = empty_rack()
    _sync_chip_totals(sess)
    return sess


def _next_to_act(hand: HandState, session: PokerSession) -> Optional[str]:
    active = [p for p in ("player1", "player2") if hand.in_hand[p]]
    if len(active) <= 1:
        return None
    max_bet = max(hand.street_bets[p] for p in active)
    for player in _action_order(hand.button, hand.street):
        if not hand.in_hand[player]:
            continue
        chips = _chips(session, player)
        bet = hand.street_bets[player]
        if bet < max_bet and chips > 0:
            return player
        if chips > 0 and player not in hand.acted_since_raise:
            return player
    return None


def _betting_complete(hand: HandState, session: PokerSession) -> bool:
    return _next_to_act(hand, session) is None


def _apply_pay(session: PokerSession, hand: HandState, player: str, pay: int) -> Tuple[int, Dict[str, int]]:
    if pay <= 0:
        return 0, {}
    rack = _rack(session, player)
    street_rack = hand.street_chip_racks[player]
    before = copy_rack(rack)
    moved = transfer_chips(rack, street_rack, pay)
    hand.street_bets[player] += moved
    _sync_chip_totals(session)
    return moved, chips_moved_breakdown(before, rack)


def _board_cards_for_street(street: str) -> int:
    if street == "flop":
        return 3
    if street in ("turn", "river"):
        return 1
    return 0


def _start_hand(session: PokerSession) -> HandState:
    deck = _make_deck()
    random.shuffle(deck)
    button = "player1" if session.hand_num % 2 == 0 else "player2"
    hand = HandState(deck=deck, button=button, hand_num=session.hand_num + 1)
    hand.actions_this_hand = 0
    session.active = hand
    session.pot_rack = empty_rack()
    return hand


def _snapshot_racks(session: PokerSession) -> Dict[str, Any]:
    return {
        "rack_p1": copy_rack(session.rack_p1),
        "rack_p2": copy_rack(session.rack_p2),
        "pot_rack": copy_rack(session.pot_rack),
        "chips_p1": session.chips_p1,
        "chips_p2": session.chips_p2,
    }


def _two_player_meta(hand: HandState) -> Dict[str, Any]:
    bb = _other(hand.button)
    return {
        "format": "two_player_holdem",
        "sb_player": hand.button,
        "bb_player": bb,
        "preflop_first": hand.button,
        "postflop_first": bb,
    }


def _live_state(session: PokerSession, hand: HandState, step: Dict[str, Any]) -> Dict[str, Any]:
    return {
        **_snapshot_racks(session),
        **_two_player_meta(hand),
        "hand_in_progress": True,
        "hand_num": hand.hand_num,
        "street": hand.street,
        "phase": hand.phase,
        "button": hand.button,
        "hole_p1": list(hand.hole_p1),
        "hole_p2": list(hand.hole_p2),
        "community": list(hand.community),
        "street_bets": dict(hand.street_bets),
        "street_chip_racks": _copy_street_racks(hand),
        "in_hand": dict(hand.in_hand),
        "to_act": step.get("to_act"),
        "step": step,
        "actions": list(hand.actions),
        "pot": rack_total(session.pot_rack)
        + rack_total(hand.street_chip_racks["player1"])
        + rack_total(hand.street_chip_racks["player2"]),
    }


def _action_order_note(hand: HandState, player: str) -> str:
    first = _action_order(hand.button, hand.street)[0]
    if first == player:
        return "You act first this betting round."
    return "Opponent acts first this betting round."


def _legal_actions_text(to_call: int, chips: int, in_hand: bool) -> str:
    if not in_hand:
        return "none (you folded)"
    opts = []
    if to_call > 0:
        opts.append("fold")
        opts.append(f"call {min(to_call, chips)}")
    else:
        opts.append("check")
    if chips > to_call:
        opts.append("raise (set total bet this street)")
    return ", ".join(opts)


def _hand_state_for_agent(
    session: PokerSession, hand: HandState, player: str,
) -> Dict[str, Any]:
    opp = _other(player)
    to_call = max(0, hand.street_bets[opp] - hand.street_bets[player])
    chips = _chips(session, player)
    opp_chips = _chips(session, opp)
    max_bet = max(hand.street_bets.values())
    min_raise_to = max_bet + BIG_BLIND
    hole = hand.hole_p1 if player == "player1" else hand.hole_p2
    hist = "; ".join(
        f"{a['player']} {a['action']}" + (f" {a['amount']}" if a.get("amount") else "")
        + (f" on {a.get('street', '?')}" if a.get("street") else "")
        for a in hand.actions[-12:]
    ) or "none"
    return {
        "format": "two_player_texas_holdem",
        "hand_num": hand.hand_num,
        "max_hands_in_match": MAX_HANDS,
        "hands_completed_before_this": session.hand_num,
        "hands_remaining_after_this": max(0, MAX_HANDS - session.hand_num),
        "blinds": {"small": SMALL_BLIND, "big": BIG_BLIND},
        "your_position": "dealer_small_blind" if player == hand.button else "big_blind",
        "your_hole_cards": hole,
        "opponent_hole_cards": "HIDDEN (you only see your own cards until showdown)",
        "community_cards": list(hand.community),
        "street": hand.street,
        "pot": rack_total(session.pot_rack),
        "your_stack": chips,
        "opponent_stack": opp_chips,
        "your_bet_this_street": hand.street_bets[player],
        "opponent_bet_this_street": hand.street_bets[opp],
        "to_call": to_call,
        "min_raise_to_total_this_street": min_raise_to,
        "max_total_bet_this_street": hand.street_bets[player] + chips,
        "you_in_hand": hand.in_hand[player],
        "opponent_in_hand": hand.in_hand[opp],
        "action_order": _action_order_note(hand, player),
        "legal_actions": _legal_actions_text(to_call, chips, hand.in_hand[player]),
        "action_history_this_hand": hist,
        "recent_completed_hands": session.log[-5:],
    }


def _build_poker_prompt(session: PokerSession, hand: HandState, player: str) -> str:
    st = _hand_state_for_agent(session, hand, player)
    prior = ""
    if session.log:
        prior = "Completed hands:\n" + "\n".join(
            f"  Hand {h.get('hand')}: pot {h.get('pot')}, winner {h.get('winner') or 'none'}"
            for h in session.log[-5:]
        ) + "\n\n"
    return (
        f"2-player Texas Hold'em match.\n"
        f"HAND {st['hand_num']} of {st['max_hands_in_match']} "
        f"({st['hands_remaining_after_this']} hands left including this one).\n\n"
        f"RULES: {SMALL_BLIND}/{BIG_BLIND} blinds. Dealer button posts small blind and acts first preflop; "
        f"big blind acts first on flop, turn, and river. Standard hold'em hand rankings. "
        f"You only see YOUR hole cards, not opponent's.\n\n"
        f"YOUR POSITION: {st['your_position']}\n"
        f"YOUR HOLE: {st['your_hole_cards']}\n"
        f"COMMUNITY: {st['community_cards'] or '[]'}\n"
        f"STREET: {st['street']}\n"
        f"POT: {st['pot']}\n"
        f"YOUR STACK: {st['your_stack']} | OPPONENT STACK: {st['opponent_stack']}\n"
        f"YOUR BET THIS STREET: {st['your_bet_this_street']} | "
        f"OPPONENT BET: {st['opponent_bet_this_street']} | TO CALL: {st['to_call']}\n"
        f"MIN RAISE TO (total this street): {st['min_raise_to_total_this_street']} | "
        f"MAX: {st['max_total_bet_this_street']}\n"
        f"{st['action_order']}\n"
        f"LEGAL: {st['legal_actions']}\n"
        f"ACTION HISTORY: {st['action_history_this_hand']}\n\n"
        f"{prior}"
        "Use get_hand_state then take_action once."
    )


def _execute_llm_action(session: PokerSession, hand: HandState, player: str) -> Dict[str, Any]:
    opp = _other(player)
    to_call = max(0, hand.street_bets[opp] - hand.street_bets[player])
    chips = _chips(session, player)
    max_bet = max(hand.street_bets.values())
    min_raise_to = max_bet + BIG_BLIND

    model_id = session.model1 if player == "player1" else session.model2
    prompt = _build_poker_prompt(session, hand, player)
    usage: Dict[str, Any] = {}

    def executor(name: str, args: Dict[str, Any]) -> Any:
        if name == "get_hand_state":
            return _hand_state_for_agent(session, hand, player)
        if name == "take_action":
            action = str(args.get("action", "")).lower().strip()
            if action not in ("fold", "check", "call", "raise"):
                return {"error": "take_action must be fold, check, call, or raise"}
            payload: Dict[str, Any] = {"action": action}
            if args.get("amount") is not None:
                try:
                    payload["amount"] = int(args["amount"])
                except (TypeError, ValueError):
                    return {"error": "raise amount must be an integer"}
            return terminal_result(payload)
        return {"error": f"Unknown tool {name}"}

    agent = AgentClient(model_id)
    try:
        turn = agent.run_turn(
            [{"role": "user", "content": prompt}],
            POKER_TOOLS,
            executor,
            max_steps=ARENA_AGENT_MAX_STEPS,
            max_tokens=64,
            temperature=0.4,
            usage_out=usage,
            system=(
                "2-player Texas Hold'em. You cannot see opponent hole cards. "
                "Use get_hand_state for full context, then take_action once."
            ),
        )
        usage["tool_calls"] = turn.tool_calls
        action = str(turn.action_args.get("action", "check")).lower()
        amount = int(turn.action_args.get("amount", 0)) if turn.action_args.get("amount") is not None else 0
    except Exception:
        llm = LLMClient(model_id)
        resp = llm.get_response(prompt, max_tokens=32, temperature=0.4, usage_out=usage)
        action, amount = _parse_action(resp, to_call, chips, BIG_BLIND)

    record: Dict[str, Any] = {
        "player": player,
        "street": hand.street,
        "to_act": player,
    }

    if action == "fold":
        hand.in_hand[player] = False
        record["action"] = "fold"
    elif action == "check" and to_call == 0:
        record["action"] = "check"
        hand.acted_since_raise.add(player)
    elif action in ("call",) or (action == "check" and to_call > 0):
        pay, chips_moved = _apply_pay(session, hand, player, min(to_call, chips))
        record["action"] = "call" if pay >= to_call else "all-in"
        record["amount"] = pay
        if chips_moved:
            record["chips_moved"] = chips_moved
        hand.acted_since_raise.add(player)
    elif action == "raise":
        raise_to = max(amount, min_raise_to)
        raise_to = min(raise_to, hand.street_bets[player] + chips)
        pay, chips_moved = _apply_pay(session, hand, player, raise_to - hand.street_bets[player])
        if pay <= to_call and to_call > 0:
            record["action"] = "call" if pay < chips else "all-in"
            record["amount"] = pay
            if chips_moved:
                record["chips_moved"] = chips_moved
            hand.acted_since_raise.add(player)
        else:
            record["action"] = "raise" if pay < chips else "all-in"
            record["amount"] = pay
            if chips_moved:
                record["chips_moved"] = chips_moved
            hand.acted_since_raise = {player}
    elif to_call == 0:
        record["action"] = "check"
        hand.acted_since_raise.add(player)
    else:
        pay, chips_moved = _apply_pay(session, hand, player, min(to_call, chips))
        record["action"] = "call" if pay < chips else "all-in"
        record["amount"] = pay
        if chips_moved:
            record["chips_moved"] = chips_moved
        hand.acted_since_raise.add(player)

    record.update(_snapshot_racks(session))
    hand.actions.append(record)
    session.move_seq += 1
    out = {
        "type": "action",
        "to_act": player,
        **record,
    }
    if usage.get("tool_calls"):
        out["tool_calls"] = usage["tool_calls"]
    return out


def _settle_hand(session: PokerSession, hand: HandState) -> Dict[str, Any]:
    _merge_street_to_pot(session, hand)
    winner = None
    if hand.in_hand["player1"] and not hand.in_hand["player2"]:
        winner = "player1"
    elif hand.in_hand["player2"] and not hand.in_hand["player1"]:
        winner = "player2"
    elif hand.in_hand["player1"] and hand.in_hand["player2"]:
        s1 = _best_hand(hand.hole_p1, hand.community)
        s2 = _best_hand(hand.hole_p2, hand.community)
        if s1 > s2:
            winner = "player1"
        elif s2 > s1:
            winner = "player2"

    final_pot = rack_total(session.pot_rack)
    final_pot_rack = copy_rack(session.pot_rack)
    if winner == "player1":
        merge_racks(session.rack_p1, session.pot_rack)
    elif winner == "player2":
        merge_racks(session.rack_p2, session.pot_rack)
    else:
        split_rack_between(session.rack_p1, session.rack_p2, session.pot_rack)
    session.pot_rack = empty_rack()
    _sync_chip_totals(session)

    summary = {
        "hand": hand.hand_num,
        "hole_p1": hand.hole_p1,
        "hole_p2": hand.hole_p2,
        "community": hand.community,
        "pot": final_pot,
        "pot_rack": final_pot_rack,
        "winner": winner,
        "actions": hand.actions,
        "button": hand.button,
        "strength_p1": list(_best_hand(hand.hole_p1, hand.community)),
        "strength_p2": list(_best_hand(hand.hole_p2, hand.community)),
    }
    session.last_hand = summary
    session.log.append(summary)
    session.hand_num += 1
    hand.phase = "done"
    session.active = None

    if session.hand_num >= MAX_HANDS or session.chips_p1 <= 0 or session.chips_p2 <= 0:
        session.done = True

    return summary


def _force_session_end(session: PokerSession, reason: str) -> Dict[str, Any]:
    """End tournament when step/action caps are hit (prevents infinite loops)."""
    session.done = True
    session.active = None
    return {
        "done": True,
        "winner_side": winner_side(session),
        "step": {"type": "tournament_end", "reason": reason},
        "forced_end": True,
    }


def advance_step(session: PokerSession) -> Dict[str, Any]:
    """Advance one visible step (deal, blind, action, board card, showdown)."""
    session.advance_steps += 1
    if session.advance_steps > MAX_ADVANCE_STEPS:
        return _force_session_end(session, "max_advance_steps")

    if session.done:
        return {"done": True, "winner_side": winner_side(session), "step": {"type": "tournament_end"}}

    if session.chips_p1 <= 0 or session.chips_p2 <= 0:
        session.done = True
        return {"done": True, "winner_side": winner_side(session), "step": {"type": "tournament_end"}}

    if session.hand_num >= MAX_HANDS and session.active is None:
        session.done = True
        return {"done": True, "winner_side": winner_side(session), "step": {"type": "tournament_end"}}

    hand = session.active
    if hand is None:
        if session.hand_num >= MAX_HANDS:
            session.done = True
            return {"done": True, "winner_side": winner_side(session), "step": {"type": "tournament_end"}}
        hand = _start_hand(session)
        hand.phase = "deal_hole"
        hand.deal_index = 0

    # --- Deal hole cards (alternating from button) ---
    if hand.phase == "deal_hole":
        order = [hand.button, _other(hand.button)]
        player = order[hand.deal_index % 2]
        card = hand.deck.pop()
        if player == "player1":
            hand.hole_p1.append(card)
        else:
            hand.hole_p2.append(card)
        hand.deal_index += 1
        step = {
            "type": "deal_hole",
            "player": player,
            "card": card,
            "card_index": len(hand.hole_p1 if player == "player1" else hand.hole_p2) - 1,
            "to_act": None,
        }
        if hand.deal_index >= 4:
            hand.phase = "post_blinds"
            hand.blind_step = 0
        return _live_state(session, hand, step)

    # --- Post blinds (SB then BB) ---
    if hand.phase == "post_blinds":
        if hand.blind_step == 0:
            sb = hand.button
            moved, chips_moved = _apply_pay(session, hand, sb, SMALL_BLIND)
            hand.blind_step = 1
            return _live_state(
                session,
                hand,
                {
                    "type": "post_blind",
                    "player": sb,
                    "blind": "SB",
                    "amount": moved,
                    "chips_moved": chips_moved,
                    "to_act": None,
                },
            )
        bb = _other(hand.button)
        moved, chips_moved = _apply_pay(session, hand, bb, BIG_BLIND)
        hand.acted_since_raise = set()
        hand.phase = "bet"
        return _live_state(
            session,
            hand,
            {
                "type": "post_blind",
                "player": bb,
                "blind": "BB",
                "amount": moved,
                "chips_moved": chips_moved,
                "to_act": _next_to_act(hand, session),
            },
        )

    # --- Betting ---
    if hand.phase == "bet":
        if not hand.in_hand["player1"] or not hand.in_hand["player2"]:
            hand.phase = "showdown"
            return advance_step(session)

        if hand.actions_this_hand >= MAX_ACTIONS_PER_HAND:
            hand.phase = "showdown"
            return advance_step(session)

        actor = _next_to_act(hand, session)
        if actor is not None:
            hand.actions_this_hand += 1
            step = _execute_llm_action(session, hand, actor)
            step["to_act"] = _next_to_act(hand, session)
            return _live_state(session, hand, step)

        # Betting round closed — advance street or showdown
        idx = STREETS.index(hand.street)
        if idx >= len(STREETS) - 1:
            hand.phase = "showdown"
            return advance_step(session)

        _merge_street_to_pot(session, hand)
        next_street = STREETS[idx + 1]
        hand.street = next_street
        hand.street_bets = {"player1": 0, "player2": 0}
        hand.acted_since_raise = set()
        hand.board_deal_remaining = _board_cards_for_street(next_street)
        if hand.board_deal_remaining > 0:
            hand.deck.pop()  # burn
            hand.phase = "deal_board"
            return advance_step(session)
        hand.phase = "bet"
        return advance_step(session)

    # --- Deal board cards one at a time ---
    if hand.phase == "deal_board":
        if hand.board_deal_remaining <= 0:
            hand.phase = "bet"
            return advance_step(session)
        card = hand.deck.pop()
        hand.community.append(card)
        hand.board_deal_remaining -= 1
        step = {
            "type": "deal_board",
            "street": hand.street,
            "card": card,
            "board": list(hand.community),
            "to_act": None if hand.board_deal_remaining > 0 else _next_to_act(hand, session),
        }
        if hand.board_deal_remaining == 0:
            hand.phase = "bet"
        return _live_state(session, hand, step)

    # --- Showdown ---
    if hand.phase == "showdown":
        summary = _settle_hand(session, hand)
        step = {
            "type": "showdown",
            "winner": summary["winner"],
            "hole_p1": summary["hole_p1"],
            "hole_p2": summary["hole_p2"],
            "community": summary["community"],
            "pot": summary["pot"],
            "to_act": None,
        }
        out = session_state(session)
        out["hand_in_progress"] = False
        out["step"] = step
        out["last_hand"] = summary
        out["hand_complete"] = True
        if session.done:
            out["done"] = True
            out["winner_side"] = winner_side(session)
        return out

    return session_state(session)


def play_hand(session: PokerSession) -> Dict[str, Any]:
    """Run one full hand via steps (benchmark / legacy)."""
    steps_at_start = session.advance_steps
    while session.advance_steps - steps_at_start < MAX_ADVANCE_STEPS:
        result = advance_step(session)
        if result.get("done"):
            break
        if result.get("hand_complete"):
            break
    if session.advance_steps - steps_at_start >= MAX_ADVANCE_STEPS and session.active:
        session.active = None
        session.done = True
    return {
        "hand": session.last_hand,
        "chips_p1": session.chips_p1,
        "chips_p2": session.chips_p2,
        "hands_played": session.hand_num,
        "done": session.done,
        "winner_side": winner_side(session),
        "advance_steps": session.advance_steps,
    }


def run_tournament(session: PokerSession) -> Dict[str, Any]:
    """Play full tournament until done or hard step cap."""
    while (
        not session.done
        and session.hand_num < MAX_HANDS
        and session.chips_p1 > 0
        and session.chips_p2 > 0
        and session.advance_steps < MAX_ADVANCE_STEPS
    ):
        result = advance_step(session)
        if result.get("done"):
            break
        if result.get("hand_complete") and session.hand_num >= MAX_HANDS:
            break
    if session.chips_p1 <= 0 or session.chips_p2 <= 0 or session.hand_num >= MAX_HANDS:
        session.done = True
    if not session.done and session.advance_steps >= MAX_ADVANCE_STEPS:
        session.done = True
    return {
        "chips_p1": session.chips_p1,
        "chips_p2": session.chips_p2,
        "hands_played": session.hand_num,
        "done": session.done,
        "winner_side": winner_side(session),
        "advance_steps": session.advance_steps,
    }


def winner_side(session: PokerSession) -> int:
    if session.chips_p1 > session.chips_p2:
        return 1
    if session.chips_p2 > session.chips_p1:
        return 2
    return 0


def session_state(session: PokerSession) -> Dict[str, Any]:
    st: Dict[str, Any] = {
        "session_id": session.id,
        "format": "two_player_holdem",
        "chips_p1": session.chips_p1,
        "chips_p2": session.chips_p2,
        "rack_p1": copy_rack(session.rack_p1),
        "rack_p2": copy_rack(session.rack_p2),
        "pot_rack": copy_rack(session.pot_rack),
        "total_chips_in_play": TOTAL_CHIPS_IN_PLAY,
        "hands_played": session.hand_num,
        "max_hands": MAX_HANDS,
        "last_hand": session.last_hand,
        "log": session.log[-5:],
        "done": session.done,
        "winner_side": winner_side(session) if session.done else None,
        "hand_in_progress": session.active is not None,
        "small_blind": SMALL_BLIND,
        "big_blind": BIG_BLIND,
    }
    if session.active:
        hand = session.active
        st.update(_two_player_meta(hand))
        st["live"] = {
            "hand_num": hand.hand_num,
            "street": hand.street,
            "phase": hand.phase,
            "button": hand.button,
            "hole_p1": list(hand.hole_p1),
            "hole_p2": list(hand.hole_p2),
            "community": list(hand.community),
            "street_bets": dict(hand.street_bets),
            "street_chip_racks": _copy_street_racks(hand),
            "in_hand": dict(hand.in_hand),
            "to_act": _next_to_act(hand, session),
            "actions": list(hand.actions),
            "pot": rack_total(session.pot_rack)
            + rack_total(hand.street_chip_racks["player1"])
            + rack_total(hand.street_chip_racks["player2"]),
        }
    return st
