"""
Tests for all game engines in the Versus platform.
Run with: python -m pytest tests/ -v
"""

import sys
import os
import json
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.games.wordle.wordle_simple import WordleGame, parse_reasoning_for_ui
from src.games.nyt_connections.connections_game import ConnectionsGame
from src.games.trivia.questions import get_random_questions


class TestWordleGame:
    def test_correct_guess_wins(self):
        game = WordleGame("CRANE")
        result = game.make_guess("openai", "CRANE", "test")
        assert result["game_over"] is True
        assert result["winner"] == "openai"
        assert result["feedback"] == ["green", "green", "green", "green", "green"]

    def test_wrong_guess_continues(self):
        game = WordleGame("CRANE")
        result = game.make_guess("openai", "SLATE", "test")
        assert result["game_over"] is False
        assert result["winner"] is None

    def test_feedback_green_yellow_black(self):
        game = WordleGame("CRANE")
        fb = game.check_guess("CRATE")
        assert fb == ["green", "green", "green", "black", "green"]

    def test_feedback_no_match(self):
        game = WordleGame("CRANE")
        fb = game.check_guess("FLIGHT")[:5]
        game2 = WordleGame("CRANE")
        fb2 = game2.check_guess("DUMPY")
        assert all(c == "black" for c in fb2)

    def test_duplicate_letters_in_secret(self):
        game = WordleGame("HELLO")
        fb = game.check_guess("LLAMA")
        assert fb == ["yellow", "yellow", "black", "black", "black"]

    def test_duplicate_letters_in_guess(self):
        game = WordleGame("PAPER")
        fb = game.check_guess("APPLE")
        assert fb == ["yellow", "yellow", "green", "black", "yellow"]

    def test_rejects_after_game_over(self):
        game = WordleGame("CRANE")
        game.make_guess("openai", "CRANE", "test")
        result = game.make_guess("anthropic", "CRANE", "test")
        assert "error" in result

    def test_six_guess_limit(self):
        game = WordleGame("WORLD")
        for i in range(6):
            result = game.make_guess("openai", "CRANE", f"guess {i+1}")
            assert "error" not in result
        # 7th guess should fail (model has used all 6)
        result = game.make_guess("openai", "CRANE", "guess 7")
        assert "error" in result

    def test_case_insensitive(self):
        game = WordleGame("crane")
        fb = game.check_guess("crane")
        assert fb == ["green", "green", "green", "green", "green"]

    def test_parse_reasoning_structure(self):
        result = parse_reasoning_for_ui(
            "openai", "test reasoning",
            ["CRANE", "SLATE"],
            [
                ["green", "black", "yellow", "black", "green"],
                ["black", "black", "black", "black", "green"],
            ],
        )
        assert "strategy" in result
        assert "knowledge" in result
        assert "green_letters" in result["knowledge"]
        assert "yellow_letters" in result["knowledge"]
        assert "black_letters" in result["knowledge"]


class TestConnectionsGame:
    def test_initial_state(self):
        game = ConnectionsGame()
        assert len(game.all_words) == 16
        assert len(game.remaining_words) == 16
        assert game.game_over is False

    def test_correct_guess(self):
        game = ConnectionsGame()
        group = game.answers[0]["members"]
        result = game.make_guess("player1", group)
        assert result["result"]["correct"] is True
        assert len(result["remaining_words"]) == 12

    def test_wrong_guess(self):
        game = ConnectionsGame()
        wrong = game.all_words[:3] + [game.all_words[-1]]
        result = game.make_guess("player1", wrong)
        assert result["result"]["correct"] is False
        assert len(game.incorrect_guesses) == 1

    def test_full_game(self):
        game = ConnectionsGame()
        for group in game.answers:
            result = game.make_guess("player1", group["members"])
            assert result["result"]["correct"] is True
        assert game.game_over is True

    def test_same_puzzle_shared(self):
        game1 = ConnectionsGame()
        game2 = ConnectionsGame(puzzle_data=game1.puzzle)
        assert game1.id == game2.id
        assert set(w.upper() for w in game1.all_words) == set(
            w.upper() for w in game2.all_words
        )

    def test_game_state_hides_solution(self):
        game = ConnectionsGame()
        state = game.get_game_state()
        assert state["solution"] is None
        for group in game.answers:
            game.make_guess("p1", group["members"])
        state = game.get_game_state()
        assert state["solution"] is not None


class TestTriviaQuestions:
    def test_random_questions_count(self):
        questions = get_random_questions(5)
        assert len(questions) == 5

    def test_random_questions_max(self):
        questions = get_random_questions(100)
        assert len(questions) <= 100

    def test_question_structure(self):
        questions = get_random_questions(1)
        q = questions[0]
        assert "question" in q
        assert "correct_answer" in q

    def test_questions_are_randomized(self):
        q1 = get_random_questions(10)
        q2 = get_random_questions(10)
        texts1 = [q["question"] for q in q1]
        texts2 = [q["question"] for q in q2]
        assert texts1 != texts2 or len(q1) <= 1


class TestServerImport:
    def test_server_imports(self):
        from src.api.server import app
        assert app.title == "VERSUS Unified Game Server"

    def test_connection_manager(self):
        from src.api.server import ConnectionManager
        cm = ConnectionManager()
        assert cm.active_connections == {}


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
