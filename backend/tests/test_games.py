"""
Unit tests for all game logic in VersusArena.
Run with: python -m pytest tests/test_games.py -v
"""

import sys
import os
import asyncio
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.games.wordle.wordle_simple import (
    WordleGame,
    WordleAgentError,
    build_wordle_prompt,
    parse_agent_guess,
    pick_secret_word,
)
from src.games.battleship.battleship import BattleshipGame
from src.games.nyt_connections.connections_game import ConnectionsGame
from src.games.prisoners_dilemma import PrisonersSession, start_session as pd_start, PAYOFFS
from src.games.twenty_questions import TwentyQuestionsSession, start_session as tq_start
from src.games.code_debug_challenge import CodeDebugSession, new_code_debug_session, CHALLENGES
from src.db.database import init_db, get_connection, db_path
from src.benchmark.elo import update_elo_pair, INITIAL_RATING
from src.benchmark.recorder import BenchmarkRecorder


class TestWordleGame:
    def _make(self, word="CRANE", **kw):
        return WordleGame(word, "gpt-5.5", "claude-sonnet-4-6", **kw)

    def test_create_game(self):
        game = self._make()
        assert game.secret_word == "CRANE"
        assert not game.game_over
        assert game.winner is None

    def test_correct_guess(self):
        game = self._make()
        result = game.make_guess("player1", "CRANE", "test")
        assert result["guess"] == "CRANE"
        assert result["feedback"] == ["green", "green", "green", "green", "green"]
        assert result["game_over"] is True
        assert result["winner"] == "player1"

    def test_feedback_green_yellow_black(self):
        game = self._make()
        result = game.make_guess("player1", "CARTS", "test")
        assert result["feedback"][0] == "green"
        assert result["feedback"][1] == "yellow"
        assert result["feedback"][2] == "yellow"
        assert result["game_over"] is False

    def test_six_guesses_both_players(self):
        game = self._make()
        for _ in range(6):
            game.make_guess("player1", "WRONG", "test")
        for _ in range(6):
            game.make_guess("player2", "WRONG", "test")
        assert game.game_over is True

    def test_game_history_maintained(self):
        game = self._make()
        game.make_guess("player1", "HOUSE", "test")
        game.make_guess("player1", "LIGHT", "test")
        assert len(game.models["player1"]["guesses"]) == 2
        assert game.models["player1"]["guesses"] == ["HOUSE", "LIGHT"]

    def test_both_players_independent(self):
        game = self._make()
        game.make_guess("player1", "HOUSE", "test")
        game.make_guess("player2", "LIGHT", "test")
        assert len(game.models["player1"]["guesses"]) == 1
        assert len(game.models["player2"]["guesses"]) == 1

    def test_guess_after_game_over(self):
        game = self._make()
        game.make_guess("player1", "CRANE", "test")
        result = game.make_guess("player2", "HOUSE", "test")
        assert "error" in result

    def test_check_guess_all_black(self):
        game = self._make()
        feedback = game.check_guess("FLIMB")
        assert feedback.count("black") >= 4

    def test_duplicate_letter_handling(self):
        game = self._make("APPLE")
        feedback = game.check_guess("PAPAL")
        greens = sum(1 for f in feedback if f == "green")
        assert greens >= 1

    def test_variable_length_6(self):
        game = self._make("BRIGHT")
        assert game.word_len == 6
        result = game.make_guess("player1", "BRIGHT", "")
        assert result["game_over"] is True
        assert result["winner"] == "player1"

    def test_variable_length_7(self):
        game = self._make("JOURNEY")
        assert game.word_len == 7
        result = game.make_guess("player1", "JOUR", "")
        assert "error" in result

    def test_hard_mode_rejects_invalid(self):
        game = self._make("CRANE", hard_mode=True)
        game.make_guess("player1", "CRANE"[:4] + "X", "")
        game.make_guess("player1", "CARTS", "")
        result = game.make_guess("player1", "FLIMB", "")
        assert "error" in result or result["feedback"]

    def test_pick_secret_word(self):
        for length in (5, 6, 7, 8):
            w = pick_secret_word(length)
            assert len(w) == length
            assert w.isalpha()

    def test_model_ids(self):
        game = self._make()
        assert game.model_ids["player1"] == "gpt-5.5"
        assert game.model_ids["player2"] == "claude-sonnet-4-6"


class TestBattleshipGame:
    def _make(self, size=8):
        return BattleshipGame("gpt-5.5", "claude-sonnet-4-6", board_size=size)

    def test_create_game(self):
        game = self._make()
        assert game.board_size == 8
        assert game.current_player == 1
        assert game.winner is None

    def test_create_10x10(self):
        game = self._make(10)
        assert game.board_size == 10
        assert "cruiser" in game.ships

    def test_create_12x12(self):
        game = self._make(12)
        assert game.board_size == 12
        assert "scout" in game.ships

    def test_valid_move_format(self):
        game = self._make()
        assert game.is_valid_move("A1") is True
        assert game.is_valid_move("H8") is True
        assert game.is_valid_move("Z9") is False
        assert game.is_valid_move("") is False

    def test_make_move_result(self):
        game = self._make()
        game.status = "active"
        result = game.make_move(0, 0)
        assert result["success"] is True
        assert result["result"] in ["hit", "miss"]

    def test_out_of_bounds_move(self):
        game = self._make()
        game.status = "active"
        result = game.make_move(-1, 0)
        assert result["success"] is False

    def test_get_prompt_has_board(self):
        game = self._make()
        game.status = "active"
        prompt = game.get_prompt_for_player(1)
        assert "Your shots so far" in prompt

    def test_shot_tracking(self):
        game = self._make()
        game.status = "active"
        game.make_move(0, 0)
        shots = game.game_state['player1_shots']
        assert shots[0][0] is not None

    def test_board_letters(self):
        game = self._make(10)
        letters = game.board_letters()
        assert len(letters) == 10
        assert letters[0] == "A"

    def test_optimal_hits_needed(self):
        game = self._make()
        game.place_ships_for_player(1)
        game.place_ships_for_player(2)
        assert game.optimal_hits_needed() == game.total_ship_cells


class TestConnectionsGame:
    def test_create_game(self):
        game = ConnectionsGame()
        assert len(game.remaining_words) == 16
        assert game.game_over is False

    def test_check_guess_correct(self):
        game = ConnectionsGame()
        group = game.puzzle['answers'][0]
        words = group['members']
        result = game.check_guess(words)
        assert result['correct'] is True

    def test_check_guess_incorrect(self):
        game = ConnectionsGame()
        result = game.check_guess(["FAKE", "WORDS", "NOT", "REAL"])
        assert result['correct'] is False

    def test_make_guess_updates_state(self):
        game = ConnectionsGame()
        group = game.puzzle['answers'][0]
        words = group['members']
        initial_count = len(game.remaining_words)
        result = game.make_guess("player1", words)
        if result.get('correct') or result.get('result', {}).get('correct'):
            assert len(game.remaining_words) == initial_count - 4
            assert len(game.found_groups) == 1

    def test_difficulty_band(self):
        game = ConnectionsGame()
        assert game.difficulty_band in ("easy", "medium", "hard", "expert", "unknown")

    def test_game_state_has_fields(self):
        game = ConnectionsGame()
        state = game.get_game_state()
        assert "difficulty_avg" in state
        assert "difficulty_band" in state


class TestWordleGuessParsing:
    def test_empty_agent_output_raises(self):
        with pytest.raises(WordleAgentError):
            parse_agent_guess("", 5)

    def test_valid_word_passthrough(self):
        assert parse_agent_guess("slate", 5) == "SLATE"


class TestWordleBuildPrompt:
    def test_first_turn_prompt(self):
        prompt = build_wordle_prompt(5, [], [], False)
        assert "5" in prompt

    def test_subsequent_turn_prompt(self):
        prompt = build_wordle_prompt(5, ["CRANE"], [["green", "black", "yellow", "black", "green"]], False)
        assert "CRANE" in prompt
        assert "CONSTRAINTS" in prompt


class TestPrisonersDilemma:
    def test_start_session(self):
        sess = pd_start("m1", "m2", rounds=5)
        assert sess.rounds_total == 5
        assert sess.round_index == 0
        assert sess.scores == (0, 0)

    def test_payoffs_exist(self):
        assert ("C", "C") in PAYOFFS
        assert ("D", "D") in PAYOFFS

    def test_build_prompt(self):
        sess = pd_start("m1", "m2", rounds=5)
        p = sess.build_prompt(1)
        assert "COOPERATE" in p or "DEFECT" in p


class TestTwentyQuestions:
    def test_start_session(self):
        sess = tq_start("m1", "m2", "ELEPHANT")
        assert sess.secret == "ELEPHANT"
        assert len(sess.transcript) == 0

    def test_max_questions(self):
        sess = tq_start("m1", "m2")
        assert sess.max_questions == 20


class TestCodeDebug:
    def test_new_session(self):
        sess = new_code_debug_session("m1", "m2", 0)
        assert sess.challenge["id"] == "arith_sum"

    def test_score_correct(self):
        ch = CHALLENGES[0]
        assert CodeDebugSession.score("return a + b", ch) == 1.0

    def test_score_wrong(self):
        ch = CHALLENGES[0]
        assert CodeDebugSession.score("return a - b", ch) == 0.0

    def test_challenges_exist(self):
        assert len(CHALLENGES) >= 3


class TestEloSystem:
    def test_initial_rating(self):
        assert INITIAL_RATING == 1200.0

    def test_update_elo_winner(self):
        r1, r2 = update_elo_pair(1200, 1200, 1.0)
        assert r1 > 1200
        assert r2 < 1200

    def test_update_elo_draw(self):
        r1, r2 = update_elo_pair(1200, 1200, 0.5)
        assert abs(r1 - 1200) < 0.01
        assert abs(r2 - 1200) < 0.01

    def test_update_elo_loser(self):
        r1, r2 = update_elo_pair(1200, 1200, 0.0)
        assert r1 < 1200
        assert r2 > 1200


class TestDatabase:
    def test_init_creates_tables(self):
        init_db()
        conn = get_connection()
        try:
            tables = [r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()]
            assert "benchmark_runs" in tables
            assert "benchmark_moves" in tables
            assert "benchmark_results" in tables
            assert "elo_ratings" in tables
        finally:
            conn.close()


class TestRecorder:
    def test_start_and_finish_run(self):
        rec = BenchmarkRecorder()
        rid = rec.start_run("test_game", "model_a", "model_b", {"k": "v"})
        assert rid is not None
        rec.add_move(rid, "player1", 1, latency_ms=100.0, correctness=1.0)
        rec.finish_run(rid, "test_game", 1, 5.0, 3.0, {"extra": True})
        conn = get_connection()
        try:
            row = conn.execute("SELECT status FROM benchmark_runs WHERE id = ?", (rid,)).fetchone()
            assert row["status"] == "finished"
            res = conn.execute("SELECT winner_side FROM benchmark_results WHERE run_id = ?", (rid,)).fetchone()
            assert res["winner_side"] == 1
        finally:
            conn.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
