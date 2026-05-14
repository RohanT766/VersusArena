import random
import json
import re
import time
from typing import Dict, List, Optional, Any
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from src.utils.common import BaseGame, LLMClient

BOARD_PRESETS: Dict[int, Dict[str, int]] = {
    8: {"carrier": 4, "battleship": 3, "destroyer": 3, "submarine": 2, "patrol": 2},
    10: {"carrier": 5, "battleship": 4, "cruiser": 3, "submarine": 3, "patrol": 2},
    12: {"carrier": 6, "battleship": 5, "cruiser": 4, "submarine": 3, "patrol": 2, "scout": 2},
}


class BattleshipGame(BaseGame):
    def __init__(self, player1_model: str, player2_model: str, board_size: int = 8):
        self.board_size = board_size if board_size in BOARD_PRESETS else 8
        self.ships = dict(BOARD_PRESETS[self.board_size])
        self.total_ship_cells = sum(self.ships.values())

        self.player1_board = [[None for _ in range(self.board_size)] for _ in range(self.board_size)]
        self.player2_board = [[None for _ in range(self.board_size)] for _ in range(self.board_size)]
        self.player1_shots = [[None for _ in range(self.board_size)] for _ in range(self.board_size)]
        self.player2_shots = [[None for _ in range(self.board_size)] for _ in range(self.board_size)]
        self.player1_ships_remaining = dict(self.ships)
        self.player2_ships_remaining = dict(self.ships)

        self.ships_remaining = {1: self.total_ship_cells, 2: self.total_ship_cells}
        self.ships_placed = {1: False, 2: False}
        self.placement_updates: List[dict] = []
        self.player1_model = player1_model
        self.player2_model = player2_model
        self.status = "placement"
        self.current_player = 1
        self.start_time = time.time()

        self.benchmark_run_id: Optional[str] = None
        self._bench_move_seq = 0
        self._last_shot_usage: Dict[str, Any] = {}

        super().__init__(player1_model, player2_model)

    def board_letters(self) -> str:
        return "".join(chr(ord("A") + j) for j in range(self.board_size))

    def _reset_player_board(self, player: int) -> None:
        key = f"player{player}_board"
        self.game_state[key] = [[None for _ in range(self.board_size)] for _ in range(self.board_size)]

    def place_ships_via_llm(self, player: int, llm: LLMClient) -> bool:
        """Ask the agent to propose valid ship coordinates; fallback is random placement."""
        self._reset_player_board(player)
        self.placement_updates = [u for u in self.placement_updates if u.get("player") != player]

        cols = self.board_letters()
        ship_spec = ", ".join(f'{name} length {size}' for name, size in self.ships.items())
        prompt = f"""Battleship ship placement benchmark.
Board: {self.board_size}x{self.board_size}, columns {cols[0]} through {cols[-1]} (but use 0-based col index), rows 0..{self.board_size - 1}.
Place EVERY ship exactly once — {ship_spec}.

Return ONLY a JSON array, no markdown, shape:
[
  {{"id":"carrier","row":0,"col":0,"orientation":"horizontal"}},
  ...
]
orientations are "horizontal" or "vertical". Indices are 0-based. Ships cannot overlap."""

        usage: Dict[str, Any] = {}
        try:
            raw = llm.get_response(prompt, max_tokens=600, temperature=0.2, usage_out=usage)
            self._last_shot_usage = usage
            if not raw:
                return False
            raw = raw.strip()
            if raw.startswith("```"):
                raw = re.sub(r"^```[a-zA-Z]*", "", raw)
                raw = re.sub(r"```$", "", raw).strip()
            placements = json.loads(raw)
            if not isinstance(placements, list):
                return False

            ship_names = set(self.ships.keys())
            seen = set()
            board_key = f"player{player}_board"
            board = self.game_state[board_key]

            for item in placements:
                sid = str(item.get("id", "")).lower()
                matched = None
                for name in ship_names:
                    if name.startswith(sid) or sid in name:
                        matched = name
                        break
                if not matched or matched in seen:
                    continue
                seen.add(matched)
                row = int(item["row"])
                col = int(item["col"])
                orientation = str(item.get("orientation", "horizontal")).lower()
                orient = "vertical" if orientation.startswith("v") else "horizontal"
                sz = self.ships[matched]
                if not self._can_place_ship(board, row, col, sz, orient):
                    return False
                self._place_ship_on_board(
                    board,
                    {
                        "id": matched,
                        "row": row,
                        "col": col,
                        "size": sz,
                        "orientation": orient,
                    },
                )
                self.placement_updates.append(
                    {
                        "player": player,
                        "ship": matched,
                        "size": sz,
                        "position": {"row": row, "col": col},
                        "orientation": orientation,
                    }
                )

            occupied = sum(1 for r in board for c in r if c is not None)
            if occupied != self.total_ship_cells or len(seen) != len(self.ships):
                return False

            self.game_state[f"player{player}_ships_placed"] = True
            self.ships_placed[player] = True
            return True
        except Exception as e:
            print(f"LLM placement failed for player {player}: {e}")
            return False

    def initialize_game(self) -> Dict:
        return {
            "player1_board": self.player1_board,
            "player2_board": self.player2_board,
            "player1_shots": self.player1_shots,
            "player2_shots": self.player2_shots,
            "player1_ships_placed": False,
            "player2_ships_placed": False,
            "turn_count": 0,
            "last_moves": [],
            "ships_remaining": self.ships_remaining,
            "ships_placed": self.ships_placed,
            "placement_updates": self.placement_updates,
        }

    def place_ships_for_player(self, player: int, ships_data: List[Dict] = None):
        board_key = f"player{player}_board"
        board = self.game_state[board_key]

        if ships_data:
            for ship in ships_data:
                self._place_ship_on_board(board, ship)
        else:
            for ship_name, ship_size in self.ships.items():
                placed = False
                attempts = 0

                while not placed and attempts < 200:
                    row = random.randint(0, self.board_size - 1)
                    col = random.randint(0, self.board_size - 1)
                    orientation = random.choice(["horizontal", "vertical"])

                    if self._can_place_ship(board, row, col, ship_size, orientation):
                        ship_data = {
                            "id": ship_name,
                            "row": row,
                            "col": col,
                            "size": ship_size,
                            "orientation": orientation,
                        }
                        self._place_ship_on_board(board, ship_data)
                        placed = True
                        self.placement_updates.append(
                            {
                                "player": player,
                                "ship": ship_name,
                                "size": ship_size,
                                "position": {"row": row, "col": col},
                                "orientation": orientation,
                            }
                        )

                    attempts += 1

        self.game_state[f"player{player}_ships_placed"] = True
        self.ships_placed[player] = True

    def place_ship(self, player: int, ship_data: Dict):
        board_key = f"player{player}_board"
        board = self.game_state[board_key]
        self._place_ship_on_board(board, ship_data)
        self.placement_updates.append(
            {
                "player": player,
                "ship": ship_data["id"],
                "size": ship_data["size"],
                "position": {"row": ship_data["row"], "col": ship_data["col"]},
                "orientation": ship_data["orientation"],
            }
        )

        ships_on_board = sum(1 for row in board for cell in row if cell is not None)
        if ships_on_board >= self.total_ship_cells:
            self.game_state[f"player{player}_ships_placed"] = True
            self.ships_placed[player] = True

    def _can_place_ship(self, board, row, col, size, orientation):
        if orientation == "horizontal":
            if col + size > self.board_size:
                return False
            for i in range(size):
                if board[row][col + i] is not None:
                    return False
        else:
            if row + size > self.board_size:
                return False
            for i in range(size):
                if board[row + i][col] is not None:
                    return False
        return True

    def _place_ship_on_board(self, board, ship_data):
        row, col = ship_data["row"], ship_data["col"]
        size = ship_data["size"]
        ship_id = ship_data["id"]

        if ship_data["orientation"] == "horizontal":
            for i in range(size):
                board[row][col + i] = ship_id
        else:
            for i in range(size):
                board[row + i][col] = ship_id

    def make_move(self, row: int, col: int) -> Dict:
        try:
            if not (0 <= row < self.board_size and 0 <= col < self.board_size):
                return {"success": False, "result": "invalid", "reason": "Coordinates out of bounds"}

            shots_key = f"player{self.current_player}_shots"
            opponent_board_key = f"player{3 - self.current_player}_board"

            if self.game_state[shots_key][row][col] is not None:
                return {
                    "success": False,
                    "result": "already_shot",
                    "reason": f"Already shot at {chr(col + ord('A'))}{row + 1}",
                }

            target_cell = self.game_state[opponent_board_key][row][col]
            if target_cell:
                self.game_state[shots_key][row][col] = "hit"
                result = "hit"
                opponent = 3 - self.current_player
                self.ships_remaining[opponent] -= 1
            else:
                self.game_state[shots_key][row][col] = "miss"
                result = "miss"

            col_letter = chr(col + ord("A"))
            move_str = f"{col_letter}{row + 1}"
            self.game_state["last_moves"].append(
                {"player": self.current_player, "move": move_str, "result": result}
            )

            self.game_state["turn_count"] += 1
            self.winner = self.check_winner()
            if not self.winner:
                self.switch_player()

            return {"success": True, "result": result, "move": move_str}

        except Exception as e:
            print(f"Error in make_move: {e}")
            return {"success": False, "result": "error", "reason": str(e)}

    def check_winner(self) -> Optional[int]:
        if self.ships_remaining[1] == 0:
            return 2
        if self.ships_remaining[2] == 0:
            return 1
        return None

    def optimal_hits_needed(self) -> int:
        """Minimum hits required to sink all ships (benchmark bracket)."""
        return self.total_ship_cells

    def count_shots_and_hits(self, player: int) -> Dict[str, int]:
        shots = self.game_state[f"player{player}_shots"]
        total = hits = 0
        for r in shots:
            for c in r:
                if c is not None:
                    total += 1
                if c == "hit":
                    hits += 1
        return {"shots": total, "hits": hits}

    def get_prompt_for_player(self, player: int) -> str:
        shots = self.game_state[f"player{player}_shots"]
        letters = self.board_letters()
        last_col = letters[-1]

        available_positions = []
        for i in range(self.board_size):
            for j in range(self.board_size):
                if shots[i][j] is None:
                    available_positions.append(f"{letters[j]}{i + 1}")

        if not available_positions:
            return "No positions available. Game should be over."

        header = "   " + " ".join(list(letters))
        board_str = "Your shots so far:\n" + header + "\n"
        for i in range(self.board_size):
            row = f"{i + 1:2} "
            for j in range(self.board_size):
                if shots[i][j] == "hit":
                    row += "X "
                elif shots[i][j] == "miss":
                    row += "O "
                else:
                    row += ". "
            board_str += row + "\n"

        strategic_targets = []
        for i in range(self.board_size):
            for j in range(self.board_size):
                if shots[i][j] == "hit":
                    for di, dj in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                        ni, nj = i + di, j + dj
                        if 0 <= ni < self.board_size and 0 <= nj < self.board_size:
                            if shots[ni][nj] is None:
                                strategic_targets.append(f"{letters[nj]}{ni + 1}")

        strategic_targets = list(set(strategic_targets))

        lo = max(0, self.board_size // 2 - 2)
        hi = min(self.board_size - 1, self.board_size // 2 + 2)

        if strategic_targets:
            suggested = strategic_targets[0]
            strategy_hint = f"\nSuggested position: {suggested} (adjacent to a hit)"
        else:
            center_positions = []
            for pos in available_positions:
                col = ord(pos[0]) - ord("A")
                row = int(pos[1:]) - 1
                if lo <= row <= hi and lo <= col <= hi:
                    center_positions.append(pos)
            if center_positions:
                suggested = center_positions[0]
                strategy_hint = f"\nSuggested position: {suggested} (center area)"
            else:
                suggested = available_positions[0]
                strategy_hint = f"\nSuggested position: {suggested}"

        prompt = f"""You are playing Battleship on a {self.board_size}x{self.board_size} grid (columns A-{last_col}, rows 1-{self.board_size}).

{board_str}

Legend: X = hit, O = miss, . = not yet shot

Available shots remain: {len(available_positions)}{strategy_hint}

Reply with ONLY one coordinate such as "{suggested}". Nothing else."""

        return prompt

    def is_valid_move(self, move: str) -> bool:
        if not move or len(move) < 2:
            return False
        if not move[0].isalpha() or not move[1:].isdigit():
            return False
        col = ord(move[0].upper()) - ord("A")
        row = int(move[1:]) - 1
        if not (0 <= row < self.board_size and 0 <= col < self.board_size):
            return False
        shots = self.game_state[f"player{self.current_player}_shots"]
        return shots[row][col] is None

    def get_state(self) -> dict:
        state = {
            "board_size": self.board_size,
            "total_ship_cells": self.total_ship_cells,
            "current_player": self.current_player,
            "winner": self.winner,
            "player1_shots": self.game_state["player1_shots"],
            "player2_shots": self.game_state["player2_shots"],
            "ships_remaining": self.ships_remaining,
            "status": self.status,
            "placement_updates": self.placement_updates,
            "ships_placed": self.game_state[
                f"player{self.current_player}_ships_placed"
            ],
        }
        if self.status == "placement" or self.winner:
            state["player1_ships"] = self.game_state["player1_board"]
            state["player2_ships"] = self.game_state["player2_board"]
        return state
