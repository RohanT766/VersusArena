#!/usr/bin/env python3
"""Run all arena games to completion with cheap models (or stub if no API keys)."""

from __future__ import annotations

import os
import sys

# backend root on path
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from dotenv import load_dotenv

load_dotenv(os.path.join(ROOT, ".env"))

from src.games import auction, minesweeper, poker
from src.games.battleship.battleship import BattleshipGame, play_until_winner
from src.games.nyt_connections.connections_game import ConnectionsGame
from src.games.wordle.wordle_simple import WordleSimpleGame, get_llm_guess, pick_secret_word

MODEL_A = os.getenv("ARENA_SMOKE_MODEL1", "gpt-4o")
MODEL_B = os.getenv("ARENA_SMOKE_MODEL2", "claude-haiku-4-5")


def _has_any_api_key() -> bool:
    return bool(
        os.getenv("OPENAI_API_KEY")
        or os.getenv("ANTHROPIC_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
    )


def smoke_wordle() -> dict:
    game = WordleSimpleGame(pick_secret_word(5), MODEL_A, MODEL_B, hard_mode=False)
    for _ in range(24):
        if game.game_over:
            break
        for side in ("player1", "player2"):
            if game.game_over or len(game.models[side]["guesses"]) >= 6:
                continue
            guess, _ = get_llm_guess(
                game.model_ids[side],
                game.models[side]["guesses"],
                game.models[side]["feedback"],
                word_len=game.word_len,
                hard_mode=False,
            )
            game.make_guess(side, guess)
    return {"game": "wordle", "game_over": game.game_over, "winner": game.winner}


def smoke_connections() -> dict:
    game = ConnectionsGame()
    moves = 0
    while not game.game_over and moves < 50:
        moves += 1
        guess = game.get_ai_guess(MODEL_A)
        if not guess:
            break
        game.make_guess(MODEL_A, guess)
    return {
        "game": "connections",
        "game_over": game.game_over,
        "winner": game.winner,
        "found_groups": len(game.found_groups),
        "moves": moves,
    }


def smoke_minesweeper() -> dict:
    sess = minesweeper.start_session(MODEL_A, MODEL_B)
    steps = 0
    while not sess.done and steps < 80:
        steps += 1
        for player in ("player1", "player2"):
            if sess.done:
                break
            minesweeper.play_step(sess, player)
    return {
        "game": "minesweeper",
        "done": sess.done,
        "winner_side": minesweeper.winner_side(sess),
        "steps": steps,
    }


def smoke_auction() -> dict:
    sess = auction.start_session(MODEL_A, MODEL_B)
    rounds = 0
    while not sess.done:
        auction.play_round(sess)
        rounds += 1
    return {
        "game": "auction",
        "done": sess.done,
        "winner_side": auction.winner_side(sess),
        "rounds": rounds,
    }


def smoke_poker() -> dict:
    sess = poker.start_session(MODEL_A, MODEL_B)
    result = poker.run_tournament(sess)
    return {
        "game": "poker",
        **result,
    }


def smoke_battleship() -> dict:
    game = BattleshipGame(MODEL_A, MODEL_B, board_size=8)
    out = play_until_winner(game, llm_placement=False)
    return {"game": "battleship", **out}


def main() -> int:
    if os.getenv("ARENA_STUB_AGENT") == "1":
        print("Stub agent mode (ARENA_STUB_AGENT=1)")
    elif not _has_any_api_key():
        print("No API keys found — using ARENA_STUB_AGENT=1")
        os.environ["ARENA_STUB_AGENT"] = "1"
    else:
        print(f"Live smoke with models: {MODEL_A} vs {MODEL_B}")

    runners = [
        smoke_wordle,
        smoke_connections,
        smoke_minesweeper,
        smoke_auction,
        smoke_poker,
        smoke_battleship,
    ]
    def _validate(result: dict) -> None:
        game = result.get("game")
        if game == "wordle":
            if not result.get("game_over"):
                raise AssertionError("wordle did not finish")
        elif game == "connections":
            if not result.get("game_over"):
                raise AssertionError("connections did not finish")
        elif game == "minesweeper":
            if not result.get("done"):
                raise AssertionError("minesweeper did not finish")
            if result.get("winner_side") not in (0, 1, 2):
                raise AssertionError("minesweeper missing winner_side")
        elif game == "auction":
            if not result.get("done"):
                raise AssertionError("auction did not finish")
        elif game == "poker":
            if not result.get("done"):
                raise AssertionError("poker tournament did not finish")
            if result.get("winner_side") not in (0, 1, 2):
                raise AssertionError("poker missing winner_side")
        elif game == "battleship":
            if result.get("winner") not in (1, 2) and result.get("status") != "finished":
                raise AssertionError("battleship did not produce a winner")

    failed = []
    for fn in runners:
        name = fn.__name__
        try:
            result = fn()
            _validate(result)
            print(f"OK  {name}: {result}")
        except Exception as e:
            print(f"FAIL {name}: {e}")
            failed.append(name)

    if failed:
        print(f"\n{len(failed)} game(s) failed: {failed}")
        return 1
    print("\nAll arena games completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
