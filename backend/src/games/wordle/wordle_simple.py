"""
AI vs AI Wordle — configurable length, hard mode, agent tool calling.
"""

from __future__ import annotations

import random
from typing import Any, Dict, List, Optional, Tuple

from flask import Flask, jsonify, request
from flask_cors import CORS

from src.engine.agent_client import AgentClient, terminal_result
from src.engine.game_tools import WORDLE_TOOLS

app = Flask(__name__)
CORS(app)

current_game = None

# Curated pools for random secret selection (benchmark-style)
WORDS_BY_LEN: Dict[int, List[str]] = {
    5: [
        "CRANE", "SLATE", "AUDIO", "HOUSE", "BRAIN", "CLOUD", "PIANO", "FLAME",
        "GRAPE", "KNIFE", "LEMON", "MOUSE", "NIGHT", "OCEAN", "PEACH", "QUEST",
        "ROBIN", "SNAKE", "TIGER", "VOICE", "WATER", "YOUTH", "ZEBRA", "WORLD",
    ],
    6: [
        "BRIGHT", "CASTLE", "DRAGON", "FROZEN", "GUITAR", "ISLAND", "JUNGLE",
        "KITTEN", "LETTER", "MARKET", "NATURE", "ORANGE", "PUZZLE", "RANDOM",
        "SIGNAL", "TEMPLE", "UNIQUE", "VACUUM", "WINDOW", "YELLOW",
    ],
    7: [
        "ADAPTER", "BATTERY", "CAPTURE", "DYNAMIC", "ELEVATE", "FACTORY",
        "GALLERY", "HISTORY", "JOURNEY", "LIBRARY", "MISSION", "NETWORK",
        "PACKETS", "QUALITY", "SECTION", "TRIUMPH", "VICTORY", "WARRIOR",
    ],
    8: [
        "ABSTRACT", "BUILDING", "COMPUTER", "DATABASE", "ELEPHANT", "FORECAST",
        "GRAPHICS", "HARDWARE", "INTERNET", "KEYBOARD", "LANGUAGE", "MOUNTAIN",
        "NOTEBOOK", "OPERATOR", "PLATFORM", "QUESTION", "RESEARCH", "SOFTWARE",
    ],
}


def pick_secret_word(length: int) -> str:
    pool = WORDS_BY_LEN.get(length, WORDS_BY_LEN[5])
    return random.choice(pool)


class WordleAgentError(RuntimeError):
    """Agent failed to return a valid submit_guess tool call."""


def parse_agent_guess(raw: str, word_len: int) -> str:
    """Require a valid word from the agent — no substitution."""
    text = (raw or "").upper().strip()
    if len(text) == word_len and text.isalpha():
        return text

    for token in text.replace(",", " ").split():
        if len(token) == word_len and token.isalpha():
            return token

    clean = "".join(c for c in text if c.isalpha())
    if len(clean) >= word_len:
        candidate = clean[:word_len]
        if candidate.isalpha():
            return candidate

    raise WordleAgentError(
        f"Agent did not submit a valid {word_len}-letter word (raw={raw!r})"
    )


class WordleGame:
    def __init__(
        self,
        secret_word: str,
        player1_model_id: str,
        player2_model_id: str,
        *,
        hard_mode: bool = False,
    ):
        self.secret_word = secret_word.upper()
        self.word_len = len(self.secret_word)
        self.hard_mode = hard_mode
        self.model_ids = {"player1": player1_model_id, "player2": player2_model_id}
        self.models = {
            "player1": {"guesses": [], "feedback": [], "reasoning": [], "won": False},
            "player2": {"guesses": [], "feedback": [], "reasoning": [], "won": False},
        }
        self.game_over = False
        self.winner: Optional[str] = None
        self.benchmark_run_id: Optional[str] = None
        self._move_seq = 0
        print(f"\n=== NEW WORDLE ({self.word_len}L, hard={hard_mode}) ===")
        print(f"Secret word: {self.secret_word}")

    def check_guess(self, guess: str) -> List[str]:
        guess = guess.upper()
        n = self.word_len
        feedback: List[Optional[str]] = [None] * n
        secret_copy = list(self.secret_word)

        for i in range(n):
            if guess[i] == self.secret_word[i]:
                feedback[i] = "green"
                secret_copy[i] = None

        for i in range(n):
            if feedback[i] is None:
                if guess[i] in secret_copy:
                    feedback[i] = "yellow"
                    secret_copy[secret_copy.index(guess[i])] = None
                else:
                    feedback[i] = "black"

        return feedback  # type: ignore[return-value]

    def _hard_valid_for_side(self, side: str, g: str) -> bool:
        if not self.hard_mode:
            return True
        g = g.upper()
        guesses = self.models[side]["guesses"]
        feedbacks = self.models[side]["feedback"]
        if not guesses:
            return True
        green_pos: Dict[int, str] = {}
        banned: Dict[str, set] = {}
        confirmed_letters: set = set()

        for guess_prev, fb in zip(guesses, feedbacks):
            for i, (ch, col) in enumerate(zip(guess_prev, fb)):
                if col == "green":
                    green_pos[i] = ch
                    confirmed_letters.add(ch)
                elif col == "yellow":
                    confirmed_letters.add(ch)
                    banned.setdefault(ch, set()).add(i)

        for pos, ch in green_pos.items():
            if pos < len(g) and g[pos] != ch:
                return False
        for ch in confirmed_letters:
            if ch not in g:
                return False
        for ch, bad_pos in banned.items():
            for i in bad_pos:
                if i < len(g) and g[i] == ch:
                    return False
        gray_forbidden = set()
        for guess_prev, fb in zip(guesses, feedbacks):
            for ch, col in zip(guess_prev, fb):
                if col == "black" and ch not in confirmed_letters:
                    gray_forbidden.add(ch)
        for ch in gray_forbidden:
            if ch in g:
                return False
        return True

    def make_guess(self, side: str, guess: str, reasoning: str = "") -> Dict:
        if self.game_over:
            return {"error": "Game already over"}
        if side not in ("player1", "player2"):
            return {"error": "Invalid side"}

        if len(self.models[side]["guesses"]) >= 6:
            return {"error": f"{side} has used all 6 guesses"}

        guess_upper = guess.upper()
        if len(guess_upper) != self.word_len or not guess_upper.isalpha():
            return {"error": f"Guess must be {self.word_len} letters"}

        if not self._hard_valid_for_side(side, guess_upper):
            return {"error": "Hard mode: guess must use all hints and obey gray exclusions"}

        feedback = self.check_guess(guess_upper)

        self.models[side]["guesses"].append(guess_upper)
        self.models[side]["feedback"].append(feedback)
        self.models[side]["reasoning"].append(reasoning)

        if guess_upper == self.secret_word:
            self.models[side]["won"] = True
            cg = len(self.models[side]["guesses"])

            if not self.game_over:
                self.game_over = True
                self.winner = side
                print(f"{side.upper()} wins in {cg} guesses")
            else:
                other = "player2" if side == "player1" else "player1"
                og = len(self.models[other]["guesses"])
                if cg < og:
                    self.winner = side
                elif cg > og:
                    pass
                else:
                    self.winner = "TIE"
        else:
            if all(len(self.models[m]["guesses"]) >= 6 for m in self.models):
                self.game_over = True

        self._move_seq += 1
        return {
            "guess": guess_upper,
            "feedback": feedback,
            "game_over": self.game_over,
            "winner": self.winner,
        }


def build_wordle_prompt(
    word_len: int,
    previous_guesses: List[str],
    previous_feedback: List[List[str]],
    hard_mode: bool,
) -> str:
    turn = len(previous_guesses) + 1
    hm = "\nHARD MODE: Every later guess MUST use every revealed green letter in place, include every yellow letter somewhere (not same slot), and never reuse letters ruled out.\n" if hard_mode else ""

    if turn == 1:
        return f"""You are playing Wordle (max 6 guesses per player). The hidden word has exactly {word_len} letters.{hm}

This is guess 1 of 6.

RULES:
- Green = correct letter and position
- Yellow = letter in word, wrong position
- Black / gray = letter not in the word (or exhausted copies)

Respond with ONLY one {word_len}-letter English word in ALL CAPS, no punctuation or explanation."""

    history = "GAME HISTORY:\n"
    for i, (guess, feedback) in enumerate(zip(previous_guesses, previous_feedback)):
        parts = []
        for letter, color in zip(guess, feedback):
            parts.append(f"{letter}({color.upper()})")
        history += f"Turn {i + 1}: {guess} -> {' '.join(parts)}\n"

    green_positions = {}
    yellow_letters = set()
    yellow_banned = {}
    black_letters = set()

    for guess, feedback in zip(previous_guesses, previous_feedback):
        for i, (letter, color) in enumerate(zip(guess, feedback)):
            if color == "green":
                green_positions[i] = letter
            elif color == "yellow":
                yellow_letters.add(letter)
                yellow_banned.setdefault(letter, set()).add(i)
            elif color == "black":
                if letter not in green_positions.values() and letter not in yellow_letters:
                    black_letters.add(letter)

    constraints = "\nCONSTRAINTS:\n"
    for pos, letter in green_positions.items():
        constraints += f"- Position {pos + 1} MUST be '{letter}'\n"
    for letter in yellow_letters:
        banned_pos = yellow_banned.get(letter, set())
        if banned_pos:
            constraints += f"- '{letter}' appears but NOT at: {', '.join(str(p + 1) for p in sorted(banned_pos))}\n"
        else:
            constraints += f"- '{letter}' must appear somewhere\n"
    if black_letters:
        constraints += f"- Do NOT use letters: {', '.join(sorted(black_letters))}\n"

    return f"""You are playing Wordle. Hidden word length: {word_len}.{hm}

{history}
{constraints}

Turn {turn} of 6. Next guess: exactly {word_len} letters, ALL CAPS, one word only."""


def get_llm_guess(
    model_id: str,
    previous_guesses: List[str],
    previous_feedback: List[List[str]],
    *,
    word_len: int,
    hard_mode: bool,
    usage_out: Optional[Dict[str, Any]] = None,
) -> Tuple[str, str]:
    prompt = build_wordle_prompt(word_len, previous_guesses, previous_feedback, hard_mode)
    usage: Dict[str, Any] = {}

    def executor(name: str, args: Dict[str, Any]) -> Any:
        if name == "get_feedback_history":
            history = []
            for g, fb in zip(previous_guesses, previous_feedback):
                history.append({"guess": g, "feedback": fb})
            return {"turn": len(previous_guesses) + 1, "max_turns": 6, "history": history}
        if name == "submit_guess":
            word = str(args.get("word", "")).upper().strip()
            return terminal_result({"word": word})
        return {"error": f"Unknown tool {name}"}

    agent = AgentClient(model_id)
    turn = agent.run_turn(
        [{"role": "user", "content": prompt}],
        WORDLE_TOOLS,
        executor,
        max_steps=8,
        max_tokens=128,
        temperature=0.4,
        usage_out=usage,
        system=(
            f"You are playing Wordle ({word_len} letters). "
            "You must call submit_guess with a single real English word of exactly that length."
        ),
    )

    if turn.action_name != "submit_guess":
        raise WordleAgentError(
            f"Agent did not call submit_guess (last tool: {turn.action_name!r})"
        )

    raw = str(turn.action_args.get("word", ""))
    guess = parse_agent_guess(raw, word_len)
    reasoning = turn.reasoning or f"Turn {len(previous_guesses) + 1} via {', '.join(turn.tools_used)}"
    if usage_out is not None:
        usage_out.update(usage)
        usage_out["tool_calls"] = turn.tool_calls
        usage_out["agent_raw_word"] = raw

    return guess, reasoning


def parse_reasoning_for_ui(
    side: str,
    reasoning: str,
    previous_guesses: List[str],
    previous_feedback: List[List[str]],
) -> Dict:
    green_positions = {}
    yellow_letters = set()
    yellow_banned = {}
    black_letters = set()

    for guess, feedback in zip(previous_guesses, previous_feedback):
        for i, (letter, color) in enumerate(zip(guess, feedback)):
            if color == "green":
                green_positions[i] = letter
            elif color == "yellow":
                yellow_letters.add(letter)
                yellow_banned.setdefault(letter, set()).add(i)
            elif color == "black":
                if letter not in green_positions.values() and letter not in yellow_letters:
                    black_letters.add(letter)

    constraints = []
    for pos, letter in green_positions.items():
        constraints.append(f"Position {pos + 1} must be '{letter}'")
    for letter in yellow_letters:
        banned_pos = yellow_banned.get(letter, set())
        if banned_pos:
            constraints.append(
                f"'{letter}' in word but not at {', '.join(str(p + 1) for p in sorted(banned_pos))}"
            )
        else:
            constraints.append(f"'{letter}' must appear somewhere")
    if black_letters:
        constraints.append(f"Cannot use: {', '.join(sorted(black_letters))}")

    turn = len(previous_guesses)
    known = len(green_positions) + len(yellow_letters)
    if known >= 4:
        strategy = "Pattern completion mode"
    elif known >= 2:
        strategy = "Strategic positioning"
    elif turn <= 2:
        strategy = "Information gathering"
    else:
        strategy = "Constraint-based exploration"

    return {
        "turn": turn,
        "strategy": strategy,
        "knowledge": {
            "green_letters": {str(pos + 1): letter for pos, letter in green_positions.items()},
            "yellow_letters": sorted(yellow_letters),
            "black_letters": sorted(black_letters),
            "constraints": constraints,
        },
        "thinking": f"{side} model is narrowing the search space from Wordle feedback.",
    }


WordleSimpleGame = WordleGame


# --- Legacy Flask routes (optional local testing) ---
@app.route("/api/wordle/start", methods=["POST"])
def flask_start_game():
    global current_game
    data = request.json or {}
    secret_word = (data.get("secret_word") or "").upper()
    if len(secret_word) != 5 or not secret_word.isalpha():
        return jsonify({"error": "Must be a 5-letter word"}), 400
    current_game = WordleGame(secret_word, "gpt-5.5", "claude-sonnet-4-6")
    return jsonify({"success": True})


@app.route("/api/wordle/state", methods=["GET"])
def flask_get_state():
    if not current_game:
        return jsonify({"error": "No active game"}), 404
    return jsonify(
        {
            "models": current_game.models,
            "game_over": current_game.game_over,
            "winner": current_game.winner,
            "secret_word": current_game.secret_word if current_game.game_over else None,
        }
    )


@app.route("/api/wordle/guess", methods=["POST"])
def flask_make_guess():
    if not current_game:
        return jsonify({"error": "No active game"}), 404
    data = request.json or {}
    side = data.get("side", "player1")
    md = current_game.models[side]
    try:
        guess, reasoning = get_llm_guess(
            current_game.model_ids[side],
            list(md["guesses"]),
            list(md["feedback"]),
            word_len=current_game.word_len,
            hard_mode=current_game.hard_mode,
        )
    except Exception as e:
        guess = WORDS_BY_LEN[5][0]
        reasoning = str(e)
    result = current_game.make_guess(side, guess, reasoning)
    if "error" in result:
        return jsonify(result), 400
    dr = parse_reasoning_for_ui(side, reasoning, md["guesses"], md["feedback"])
    return jsonify(
        {
            "guess": guess,
            "reasoning": reasoning,
            "detailed_reasoning": dr,
            "feedback": result["feedback"],
            "game_over": result["game_over"],
            "winner": result["winner"],
        }
    )


if __name__ == "__main__":
    app.run(debug=True, port=5002, threaded=True)
