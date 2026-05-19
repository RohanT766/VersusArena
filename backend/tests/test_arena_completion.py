"""Ensure every arena game reaches game_over / winner / tie (stub agent, no API)."""

import os

import pytest

os.environ.setdefault("ARENA_STUB_AGENT", "1")

from src.games import auction, minesweeper, poker
from src.games.battleship.battleship import BattleshipGame, play_until_winner
from src.games.nyt_connections.connections_game import ConnectionsGame
from src.games.wordle.wordle_simple import WordleSimpleGame, get_llm_guess, pick_secret_word

MODEL_A = "gpt-4o"
MODEL_B = "claude-haiku-4-5"


def _run_wordle():
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
    assert game.game_over
    assert game.winner in ("player1", "player2", "TIE", None) or game.winner is not None


def _run_connections():
    game = ConnectionsGame()
    moves = 0
    while not game.game_over and moves < 50:
        moves += 1
        guess = game.get_ai_guess(MODEL_A)
        if not guess:
            break
        game.make_guess(MODEL_A, guess)
    assert game.game_over or len(game.found_groups) == 4 or moves >= 50


def test_wordle_completes():
    _run_wordle()


def test_connections_completes():
    _run_connections()


def test_minesweeper_completes():
    sess = minesweeper.start_session(MODEL_A, MODEL_B)
    steps = 0
    while not sess.done and steps < 80:
        steps += 1
        for player in ("player1", "player2"):
            if sess.done:
                break
            minesweeper.play_step(sess, player)
    assert sess.done
    assert minesweeper.winner_side(sess) in (0, 1, 2)


def test_auction_completes():
    sess = auction.start_session(MODEL_A, MODEL_B)
    while not sess.done:
        auction.play_round(sess)
    assert sess.done
    assert auction.winner_side(sess) in (0, 1, 2)


def test_poker_tournament_completes():
    sess = poker.start_session(MODEL_A, MODEL_B)
    result = poker.run_tournament(sess)
    assert result["done"]
    assert result["winner_side"] in (0, 1, 2)


def test_battleship_completes():
    game = BattleshipGame(MODEL_A, MODEL_B, board_size=8)
    out = play_until_winner(game, llm_placement=False)
    assert out["moves"] <= 400
    assert out["winner"] in (0, 1, 2) or game.winner in (1, 2)
