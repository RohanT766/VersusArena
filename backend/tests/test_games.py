"""
Unit tests for all game logic in VersusArena.
Run with: python -m pytest tests/test_games.py -v
"""

import sys
import os
import asyncio
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.games.wordle.wordle_simple import WordleGame
from src.games.battleship.battleship import BattleshipGame
from src.games.nyt_connections.connections_game import ConnectionsGame
from src.games.trivia.trivia_game import TriviaGame
from src.games.trivia.questions import get_random_questions, ALL_TRIVIA_QUESTIONS


class TestWordleGame:
    def test_create_game(self):
        game = WordleGame("CRANE")
        assert game.secret_word == "CRANE"
        assert not game.game_over
        assert game.winner is None

    def test_correct_guess(self):
        game = WordleGame("CRANE")
        result = game.make_guess("openai", "CRANE", "test")
        assert result["guess"] == "CRANE"
        assert result["feedback"] == ["green", "green", "green", "green", "green"]
        assert result["game_over"] is True
        assert result["winner"] == "openai"

    def test_feedback_green_yellow_black(self):
        game = WordleGame("CRANE")
        result = game.make_guess("openai", "CARTS", "test")
        assert result["feedback"][0] == "green"  # C in correct position
        assert result["feedback"][1] == "yellow"  # A in word but wrong pos
        assert result["feedback"][2] == "yellow"  # R in word but wrong pos
        assert result["game_over"] is False

    def test_six_guesses_both_players(self):
        game = WordleGame("CRANE")
        for _ in range(6):
            game.make_guess("openai", "WRONG", "test")
        for _ in range(6):
            game.make_guess("anthropic", "WRONG", "test")
        assert game.game_over is True

    def test_game_history_maintained(self):
        game = WordleGame("CRANE")
        game.make_guess("openai", "HOUSE", "test")
        game.make_guess("openai", "LIGHT", "test")
        assert len(game.models["openai"]["guesses"]) == 2
        assert len(game.models["openai"]["feedback"]) == 2
        assert game.models["openai"]["guesses"] == ["HOUSE", "LIGHT"]

    def test_both_players_independent(self):
        game = WordleGame("CRANE")
        game.make_guess("openai", "HOUSE", "test")
        game.make_guess("anthropic", "LIGHT", "test")
        assert len(game.models["openai"]["guesses"]) == 1
        assert len(game.models["anthropic"]["guesses"]) == 1

    def test_guess_after_game_over(self):
        game = WordleGame("CRANE")
        game.make_guess("openai", "CRANE", "test")
        result = game.make_guess("anthropic", "HOUSE", "test")
        assert "error" in result

    def test_check_guess_all_black(self):
        game = WordleGame("CRANE")
        feedback = game.check_guess("FLIMB")
        assert feedback.count("black") >= 4

    def test_duplicate_letter_handling(self):
        game = WordleGame("APPLE")
        feedback = game.check_guess("PAPAL")
        greens = sum(1 for f in feedback if f == "green")
        assert greens >= 1


class TestBattleshipGame:
    def _make_game(self):
        return BattleshipGame("gpt-5.5", "claude-sonnet-4-6")

    def test_create_game(self):
        game = self._make_game()
        assert game.board_size == 8
        assert game.current_player == 1
        assert game.status in ("setup", "placement")
        assert game.winner is None

    def test_valid_move_format(self):
        game = self._make_game()
        assert game.is_valid_move("A1") is True
        assert game.is_valid_move("H8") is True
        assert game.is_valid_move("Z9") is False
        assert game.is_valid_move("") is False
        assert game.is_valid_move("A") is False

    def test_make_move_result(self):
        game = self._make_game()
        game.status = "active"
        result = game.make_move(0, 0)
        assert result["success"] is True
        assert result["result"] in ["hit", "miss"]

    def test_out_of_bounds_move(self):
        game = self._make_game()
        game.status = "active"
        result = game.make_move(-1, 0)
        assert result["success"] is False

    def test_get_prompt_has_board(self):
        game = self._make_game()
        game.status = "active"
        prompt = game.get_prompt_for_player(1)
        assert "Your shots so far" in prompt
        assert "A B C D E F G H" in prompt

    def test_shot_tracking(self):
        game = self._make_game()
        game.status = "active"
        game.make_move(0, 0)
        shots = game.game_state['player1_shots']
        assert shots[0][0] is not None


class TestConnectionsGame:
    def test_create_game(self):
        game = ConnectionsGame()
        assert game.remaining_words is not None
        assert len(game.remaining_words) == 16
        assert game.game_over is False

    def test_check_guess_correct(self):
        game = ConnectionsGame()
        group = game.puzzle['answers'][0]
        words = group['members']
        result = game.check_guess(words)
        assert result is not None
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
        if result.get('correct'):
            assert len(game.remaining_words) == initial_count - 4
            assert len(game.found_groups) == 1

    def test_max_incorrect_limit(self):
        assert hasattr(ConnectionsGame, 'MAX_INCORRECT_GUESSES')


class TestTriviaQuestions:
    def test_question_bank_loaded(self):
        assert len(ALL_TRIVIA_QUESTIONS) > 0

    def test_question_bank_has_enough(self):
        assert len(ALL_TRIVIA_QUESTIONS) >= 50

    def test_get_random_questions(self):
        questions = get_random_questions(20)
        assert len(questions) == 20

    def test_get_more_than_available(self):
        questions = get_random_questions(999)
        assert len(questions) == len(ALL_TRIVIA_QUESTIONS)

    def test_question_format(self):
        q = ALL_TRIVIA_QUESTIONS[0]
        assert "question" in q
        assert "choices" in q
        assert "correct_answer" in q
        assert len(q["choices"]) == 4


class TestTriviaGame:
    def _make_game(self):
        questions = get_random_questions(10)
        return TriviaGame("gpt-5.5", "claude-sonnet-4-6", questions)

    def test_create_game(self):
        game = self._make_game()
        assert game.player1_score == 0
        assert game.player2_score == 0
        assert not game.race_finished

    def test_question_index_starts_at_zero(self):
        game = self._make_game()
        assert game.player1_question_index == 0
        assert game.player2_question_index == 0

    def test_get_player_current_question(self):
        game = self._make_game()
        q = game.get_player_current_question(1)
        assert q is not None
        assert "question" in q

    def test_score_penalty_on_wrong(self):
        game = self._make_game()
        game.player1_score = 5
        game.player1_question_index = 3
        old_index = game.player1_question_index
        loop = asyncio.new_event_loop()
        try:
            result = loop.run_until_complete(game.ask_question_to_player(1))
            if not result.get("correct", True):
                assert game.player1_score <= 5
                assert game.player1_question_index == old_index + 1
        finally:
            loop.close()

    def test_score_cannot_go_negative(self):
        game = self._make_game()
        game.player1_score = 0
        game.player1_question_index = 0
        loop = asyncio.new_event_loop()
        try:
            result = loop.run_until_complete(game.ask_question_to_player(1))
            assert game.player1_score >= 0
        finally:
            loop.close()

    def test_format_question_prompt(self):
        game = self._make_game()
        q = game.questions[0]
        prompt = game._format_question_prompt(q)
        assert "Question:" in prompt
        assert "A." in prompt or "Options:" in prompt


class TestWordleBuildPrompt:
    def test_first_turn_prompt(self):
        from src.games.wordle.wordle_simple import build_wordle_prompt
        prompt = build_wordle_prompt("openai", [], [])
        assert "turn 1" in prompt.lower() or "Turn 1" in prompt
        assert "5-letter" in prompt

    def test_subsequent_turn_prompt(self):
        from src.games.wordle.wordle_simple import build_wordle_prompt
        prompt = build_wordle_prompt("openai", ["CRANE"], [["green", "black", "yellow", "black", "green"]])
        assert "CRANE" in prompt
        assert "GREEN" in prompt
        assert "CONSTRAINTS" in prompt
        assert "Position 1 MUST be 'C'" in prompt


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
