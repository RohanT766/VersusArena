"""Per-game tool schemas for agent benchmarking (OpenAI-compatible function format)."""

from __future__ import annotations

from typing import Any, Dict, List


def _tool(
    name: str,
    description: str,
    properties: Dict[str, Any],
    required: List[str] | None = None,
    *,
    terminal: bool = False,
) -> Dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": required or [],
        },
        "terminal": terminal,
    }


# --- Battleship ---

BATTLESHIP_SHOT_TOOLS: List[Dict[str, Any]] = [
    _tool(
        "get_board_state",
        "Get your shot grid: hits, misses, and unknown cells.",
        {},
    ),
    _tool(
        "fire_shot",
        "Fire at one cell on the opponent's board.",
        {
            "row": {"type": "integer", "description": "0-based row index"},
            "col": {"type": "integer", "description": "0-based column index"},
        },
        ["row", "col"],
        terminal=True,
    ),
]

BATTLESHIP_PLACEMENT_TOOLS: List[Dict[str, Any]] = [
    _tool(
        "place_ships",
        "Place all ships on your board. Each ship once, no overlap.",
        {
            "ships": {
                "type": "array",
                "description": "Ship placements",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string", "description": "Ship id e.g. carrier, battleship"},
                        "row": {"type": "integer"},
                        "col": {"type": "integer"},
                        "orientation": {
                            "type": "string",
                            "enum": ["horizontal", "vertical"],
                        },
                    },
                    "required": ["id", "row", "col", "orientation"],
                },
            },
        },
        ["ships"],
        terminal=True,
    ),
]


# --- Wordle ---


def wordle_tools(word_len: int) -> List[Dict[str, Any]]:
    """Tool schemas for Wordle; word_len sets submit_guess constraints."""
    return [
        _tool(
            "get_feedback_history",
            "Get your previous guesses and green/yellow/black feedback.",
            {},
        ),
        _tool(
            "submit_guess",
            f"Submit your Wordle guess. Required: exactly {word_len} uppercase letters in the word field.",
            {
                "word": {
                    "type": "string",
                    "description": f"Exactly {word_len} uppercase A-Z letters (e.g. {({5: 'SLATE', 6: 'BRIGHT', 7: 'ADAPTER', 8: 'ELEPHANT'}.get(word_len, 'CRANE'))})",
                    "minLength": word_len,
                    "maxLength": word_len,
                },
            },
            ["word"],
            terminal=True,
        ),
    ]


WORDLE_TOOLS: List[Dict[str, Any]] = wordle_tools(5)


def wordle_submit_tools(word_len: int) -> List[Dict[str, Any]]:
    """Wordle action tool only; history is already in the text prompt."""
    return [t for t in wordle_tools(word_len) if t["name"] == "submit_guess"]


# --- Connections ---

CONNECTIONS_TOOLS: List[Dict[str, Any]] = [
    _tool(
        "get_remaining_words",
        "List words still available to group.",
        {},
    ),
    _tool(
        "get_found_groups",
        "List groups already solved in this puzzle.",
        {},
    ),
    _tool(
        "submit_group",
        "Submit exactly four words that share a hidden category.",
        {
            "words": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Four words from the remaining list",
                "minItems": 4,
                "maxItems": 4,
            },
        },
        ["words"],
        terminal=True,
    ),
]


# --- Minesweeper ---

MINESWEEPER_TOOLS: List[Dict[str, Any]] = [
    _tool(
        "get_board_view",
        "Get your revealed minefield view (hidden cells shown as unknown).",
        {},
    ),
    _tool(
        "reveal_cell",
        "Reveal one hidden cell.",
        {
            "row": {"type": "integer", "description": "0-based row"},
            "col": {"type": "integer", "description": "0-based column"},
        },
        ["row", "col"],
        terminal=True,
    ),
]


# --- Auction ---

AUCTION_TOOLS: List[Dict[str, Any]] = [
    _tool(
        "get_auction_state",
        "Get current round item hint, budgets, value won, and recent round history.",
        {},
    ),
    _tool(
        "place_bid",
        "Place your sealed bid for the current item (0 to your remaining budget).",
        {
            "amount": {"type": "integer", "description": "Bid amount"},
        },
        ["amount"],
        terminal=True,
    ),
]


# --- Poker ---

POKER_TOOLS: List[Dict[str, Any]] = [
    _tool(
        "get_hand_state",
        "Get hole cards, community cards, pot, stacks, to_call, and legal actions.",
        {},
    ),
    _tool(
        "take_action",
        "Take a betting action.",
        {
            "action": {
                "type": "string",
                "enum": ["fold", "check", "call", "raise"],
            },
            "amount": {
                "type": "integer",
                "description": "For raise: total bet amount this street (optional if call/check/fold)",
            },
        },
        ["action"],
        terminal=True,
    ),
]
