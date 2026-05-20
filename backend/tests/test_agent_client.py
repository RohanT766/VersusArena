"""AgentClient invariants and tool-loop behavior (no live API)."""

import os

import pytest

os.environ["ARENA_STUB_AGENT"] = "1"

from src.engine.agent_client import (
    ARENA_AGENT_MAX_STEPS,
    AgentClient,
    _primary_terminal_tool,
    _stub_run_turn,
    _tool_choice_for_step,
    terminal_result,
)
from src.engine.game_tools import (
    AUCTION_TOOLS,
    BATTLESHIP_PLACEMENT_TOOLS,
    BATTLESHIP_SHOT_TOOLS,
    CONNECTIONS_TOOLS,
    MINESWEEPER_TOOLS,
    POKER_TOOLS,
    wordle_submit_tools,
)


@pytest.mark.parametrize(
    "tools,expected",
    [
        (wordle_submit_tools(5), "submit_guess"),
        (BATTLESHIP_SHOT_TOOLS, "fire_shot"),
        (BATTLESHIP_PLACEMENT_TOOLS, "place_ships"),
        (CONNECTIONS_TOOLS, "submit_group"),
        (MINESWEEPER_TOOLS, "reveal_cell"),
        (AUCTION_TOOLS, "place_bid"),
        (POKER_TOOLS, "take_action"),
    ],
)
def test_each_arena_game_has_one_terminal_tool(tools, expected):
    assert _primary_terminal_tool(tools) == expected


def test_anthropic_late_step_forces_terminal_tool():
    choice = _tool_choice_for_step(
        "ANTHROPIC",
        step=ARENA_AGENT_MAX_STEPS - 1,
        max_steps=ARENA_AGENT_MAX_STEPS,
        terminal_tool="submit_guess",
        has_tools=True,
    )
    assert choice == {"type": "tool", "name": "submit_guess"}


def test_openai_late_step_forces_terminal_tool():
    choice = _tool_choice_for_step(
        "OPENAI",
        step=6,
        max_steps=8,
        terminal_tool="fire_shot",
        has_tools=True,
    )
    assert choice == {"type": "function", "function": {"name": "fire_shot"}}


def test_stub_completes_wordle_turn():
    def executor(name: str, args):
        if name == "submit_guess":
            return terminal_result({"word": args.get("word", "CRANE")})
        return {}

    result = _stub_run_turn(wordle_submit_tools(5), executor, {})
    assert result.action_name == "submit_guess"
    assert result.action_args["word"]


def test_stub_completes_connections_turn():
    def executor(name: str, args):
        if name == "get_remaining_words":
            return {"words": ["A", "B", "C", "D", "E", "F", "G", "H"]}
        if name == "submit_group":
            return terminal_result({"words": args["words"]})
        return {}

    result = _stub_run_turn(CONNECTIONS_TOOLS, executor, {})
    assert result.action_name == "submit_group"
    assert len(result.action_args["words"]) == 4


def test_invalid_terminal_returns_error_not_terminal():
    """Executor errors must not end the turn; stub uses valid args separately."""
    calls = []

    def executor(name: str, args):
        calls.append(name)
        if name == "submit_guess":
            if not args.get("word"):
                return {"error": "missing word"}
            return terminal_result({"word": "CRANE"})
        return {}

    result = _stub_run_turn(wordle_submit_tools(5), executor, {})
    assert result.action_name == "submit_guess"
