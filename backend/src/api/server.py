#!/usr/bin/env python3
"""
Unified VERSUS Server - Runs all game modes from a single server
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import asyncio
import json
import uvicorn
from typing import Any, Dict, List, Optional
import uuid
import random
import sys
import os
from datetime import datetime
import re
import time

# Add backend to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import game implementations
from src.games.battleship.battleship import BattleshipGame
from src.games.nyt_connections.connections_game import ConnectionsGame
from src.games.wordle.wordle_simple import WordleSimpleGame, get_llm_guess, parse_reasoning_for_ui, pick_secret_word

from src.engine.agent_loop import AgentLoop, GameRunner
from src.db.database import init_db
from src.benchmark.recorder import get_recorder
from src.api.benchmark_routes import router as benchmark_router
from src.games.prisoners_dilemma import (
    play_round as pd_play_round,
    start_session as pd_start_session,
    winner_side as pd_winner_side,
)
from src.games.twenty_questions import start_session as tq_start, play_turn as tq_play_turn, SECRETS
from src.games.code_debug_challenge import (
    CodeDebugSession,
    new_code_debug_session,
    run_player as code_debug_run_player,
)
from src.games.maze_race import (
    start_session as maze_start_session,
    play_step as maze_play_step,
    session_state as maze_session_state,
    winner_side as maze_winner_side,
)
from src.games.snake_game import (
    start_session as snake_start_session,
    play_step as snake_play_step,
    session_state as snake_session_state,
    winner_side as snake_winner_side,
)

# Default model configurations
DEFAULT_MODELS = {
    "battleship": {"player1": "openai", "player2": "anthropic"},
    "wordle": {"player1": "openai", "player2": "anthropic"},
    "connections": {"player1": "openai", "player2": "anthropic"}
}

def get_models_for_game(game_type: str, player1_model: Optional[str] = None, player2_model: Optional[str] = None):
    """Get models for a game, using defaults if not specified"""
    defaults = DEFAULT_MODELS.get(game_type, {"player1": "openai", "player2": "anthropic"})
    return {
        "player1": player1_model or defaults["player1"],
        "player2": player2_model or defaults["player2"]
    }

app = FastAPI(title="VERSUS Unified Game Server", version="2.0.0")
app.include_router(benchmark_router)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    init_db()
    asyncio.create_task(cleanup_stale_games())

# Store active games
active_games = {}
battleship_games = {}
wordle_games: Dict[str, Dict[str, Any]] = {}
connections_games: Dict[str, Dict] = {}

prisoners_sessions: Dict[str, Dict] = {}
twenty_questions_sessions: Dict[str, Dict] = {}
code_debug_sessions: Dict[str, Dict] = {}
maze_sessions: Dict[str, Dict] = {}
snake_sessions: Dict[str, Dict] = {}

# Store active game runners
game_runners: Dict[str, GameRunner] = {}

MAX_COMPLETED_GAME_AGE = 3600  # 1 hour

async def cleanup_stale_games():
    """Periodically remove finished game sessions to prevent memory leaks"""
    while True:
        await asyncio.sleep(300)
        removed = 0
        for store_name, store in [("connections", connections_games)]:
            stale_ids = []
            for gid, session in store.items():
                game_data = session.get("player1_game")
                if game_data and getattr(game_data, "game_over", False):
                    stale_ids.append(gid)
            for gid in stale_ids:
                del store[gid]
                removed += 1
        for gid in list(wordle_games.keys()):
            entry = wordle_games[gid]
            g = entry.get("game") if isinstance(entry, dict) else entry
            if g is not None and getattr(g, "game_over", False):
                del wordle_games[gid]
                removed += 1
        if removed:
            print(f"Cleaned up {removed} finished game session(s)")

# Connection manager for WebSockets
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, game_id: str):
        await websocket.accept()
        if game_id not in self.active_connections:
            self.active_connections[game_id] = []
        self.active_connections[game_id].append(websocket)

    def disconnect(self, websocket: WebSocket, game_id: str):
        if game_id in self.active_connections:
            try:
                self.active_connections[game_id].remove(websocket)
            except ValueError:
                pass
            if not self.active_connections[game_id]:
                del self.active_connections[game_id]

    async def broadcast_to_game(self, message: str, game_id: str):
        if game_id in self.active_connections:
            for connection in self.active_connections[game_id]:
                try:
                    await connection.send_text(message)
                except Exception:
                    pass

manager = ConnectionManager()

# ====================
# BATTLESHIP ENDPOINTS
# ====================

battleship_ws_alive: Dict[str, bool] = {}
battleship_benchmark_meta: Dict[str, Dict[str, Any]] = {}

@app.websocket("/games/battleship/{game_id}")
async def battleship_websocket(websocket: WebSocket, game_id: str):
    """WebSocket endpoint for Battleship games"""
    await websocket.accept()
    battleship_ws_alive[game_id] = True
    print(f"Client connected to battleship game {game_id}")
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "start_game":
                if game_id in battleship_games:
                    game = battleship_games[game_id]
                    print(f"Game {game_id} already exists, sending current state")
                    
                    await websocket.send_json({
                        "type": "game_state",
                        "status": game.status,
                        "message": "Game already in progress",
                        "board_size": game.board_size,
                        "currentPlayer": game.current_player,
                        "player1Shots": game.game_state["player1_shots"],
                        "player2Shots": game.game_state["player2_shots"],
                        "player1Board": game.game_state["player1_board"],
                        "player2Board": game.game_state["player2_board"],
                        "shipsPlaced": game.ships_placed,
                        "winner": game.winner
                    })
                    
                    if game.status == "active" and not game.winner:
                        asyncio.create_task(continue_battleship_game(game, websocket, game_id))
                    continue
                
                player1_model = data.get("player1Model", "gpt-5.5")
                player2_model = data.get("player2Model", "claude-sonnet-4-6")
                board_size = int(data.get("board_size", 8))
                llm_placement = bool(data.get("llm_placement", False))

                print(f"Creating battleship {board_size}x{board_size}: {player1_model} vs {player2_model}")

                game = BattleshipGame(player1_model, player2_model, board_size=board_size)
                rec = get_recorder()
                br = rec.start_run(
                    "battleship",
                    player1_model,
                    player2_model,
                    {"board_size": board_size, "llm_placement": llm_placement},
                )
                game.benchmark_run_id = br
                game._bench_seq = 0
                battleship_games[game_id] = game
                battleship_benchmark_meta[game_id] = {"run_id": br, "finished": False}

                await websocket.send_json({
                    "type": "game_state",
                    "status": "placement",
                    "board_size": game.board_size,
                    "message": "Placing ships...",
                    "currentPlayer": 1,
                    "player1Shots": game.game_state["player1_shots"],
                    "player2Shots": game.game_state["player2_shots"],
                    "shipsPlaced": game.ships_placed
                })
                
                for player in [1, 2]:
                    await websocket.send_json({
                        "type": "placement_start",
                        "player": player,
                        "message": f"Player {player} is placing ships..."
                    })
                    
                    if llm_placement:
                        llm = game.player1 if player == 1 else game.player2
                        if not game.place_ships_via_llm(player, llm):
                            game.place_ships_for_player(player)
                    else:
                        game.place_ships_for_player(player)
                    
                    await websocket.send_json({
                        "type": "ship_placed",
                        "player": player,
                        "board": game.game_state[f'player{player}_board']
                    })
                    
                    await asyncio.sleep(0.2)
                
                await websocket.send_json({
                    "type": "placement_complete",
                    "board_size": game.board_size,
                    "message": "All ships placed! Game starting...",
                    "player1Board": game.game_state['player1_board'],
                    "player2Board": game.game_state['player2_board']
                })
                
                await asyncio.sleep(0.5)
                
                game.status = "active"
                asyncio.create_task(run_battleship_game_loop(game, websocket, game_id))
            
            elif data.get("type") == "get_state":
                if game_id in battleship_games:
                    game = battleship_games[game_id]
                    await websocket.send_json({
                        "type": "game_state",
                        "status": game.status,
                        "board_size": game.board_size,
                        "currentPlayer": game.current_player,
                        "player1Shots": game.game_state["player1_shots"],
                        "player2Shots": game.game_state["player2_shots"],
                        "player1Board": game.game_state["player1_board"],
                        "player2Board": game.game_state["player2_board"],
                        "winner": game.winner,
                        "message": "Current game state"
                    })
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Game not found"
                    })
            
    except WebSocketDisconnect:
        print(f"Client disconnected from battleship game {game_id}")
        battleship_ws_alive[game_id] = False
        if game_id in battleship_games:
            battleship_games[game_id].status = "finished"
    except Exception as e:
        print(f"WebSocket error in game {game_id}: {e}")
        battleship_ws_alive[game_id] = False
        import traceback
        traceback.print_exc()

async def continue_battleship_game(game: BattleshipGame, websocket: WebSocket, game_id: str):
    """Continue an existing battleship game"""
    try:
        await websocket.send_json({
            "type": "game_state",
            "status": game.status,
            "board_size": game.board_size,
            "currentPlayer": game.current_player,
            "player1Shots": game.game_state["player1_shots"],
            "player2Shots": game.game_state["player2_shots"],
            "winner": game.winner,
            "message": "Continuing game..."
        })
        
        await run_battleship_game_loop(game, websocket, game_id)
    except Exception as e:
        print(f"Error continuing game {game_id}: {e}")


def _finalize_battleship_benchmark(game_id: str, game: BattleshipGame) -> None:
    meta = battleship_benchmark_meta.get(game_id)
    if not meta or meta.get("finished"):
        return
    br = meta.get("run_id")
    if not br:
        return
    meta["finished"] = True
    rec = get_recorder()
    w = int(game.winner) if game.winner else 0
    s1 = float(game.count_shots_and_hits(1)["hits"])
    s2 = float(game.count_shots_and_hits(2)["hits"])
    opt = game.optimal_hits_needed()
    rec.finish_run(
        br,
        "battleship",
        w,
        s1,
        s2,
        {
            "board_size": game.board_size,
            "shots_p1": game.count_shots_and_hits(1)["shots"],
            "shots_p2": game.count_shots_and_hits(2)["shots"],
            "optimal_hits": opt,
        },
    )


async def run_battleship_game_loop(game: BattleshipGame, websocket: WebSocket, game_id: str):
    """Run the battleship game loop in a separate task"""
    letters = game.board_letters()
    coord_re = re.compile(rf"([{letters}])(\d+)", re.I)
    rec = get_recorder()
    br = getattr(game, "benchmark_run_id", None)

    try:
        total_moves = 0
        MAX_TOTAL_MOVES = 400
        while game.status == "active" and not game.winner:
            if not battleship_ws_alive.get(game_id, False):
                print(f"Client disconnected, stopping battleship game {game_id}")
                game.status = "finished"
                break
            total_moves += 1
            if total_moves > MAX_TOTAL_MOVES:
                print(f"Game {game_id} exceeded max moves, ending")
                game.status = "finished"
                break
            current_player = game.current_player
            max_retries = 5
            retry_count = 0

            while retry_count < max_retries:
                if not battleship_ws_alive.get(game_id, False):
                    break
                prompt = game.get_prompt_for_player(current_player)
                usage: Dict[str, Any] = {}
                llm = game.player1 if current_player == 1 else game.player2
                move_response = llm.get_move(
                    prompt, game.game_state, usage_out=usage, board_letters=letters
                )

                try:
                    move_str = (move_response or "").strip().upper()
                    move_str = move_str.split()[0] if move_str else ""
                    m = coord_re.search(move_str)
                    if not m:
                        raise ValueError(f"Could not parse move: {move_response}")
                    col_letter = m.group(1).upper()
                    row_num = int(m.group(2))
                    col_idx = ord(col_letter) - ord("A")
                    row_idx = row_num - 1

                    if not (0 <= row_idx < game.board_size and 0 <= col_idx < game.board_size):
                        raise ValueError(f"Move out of bounds: row={row_idx}, col={col_idx}")

                    move_result = game.make_move(row_idx, col_idx)

                    if move_result["success"]:
                        if br:
                            game._bench_seq = getattr(game, "_bench_seq", 0) + 1
                            rec.add_move(
                                br,
                                f"player{current_player}",
                                game._bench_seq,
                                latency_ms=usage.get("latency_ms"),
                                input_tokens=usage.get("input_tokens"),
                                output_tokens=usage.get("output_tokens"),
                                cost_usd=usage.get("cost_usd"),
                                correctness=1.0 if move_result["result"] == "hit" else 0.0,
                                response_preview=move_str,
                                error=usage.get("error"),
                            )

                        col_letter = chr(col_idx + ord("A"))
                        await websocket.send_json({
                            "type": "game_state",
                            "board_size": game.board_size,
                            "currentPlayer": game.current_player,
                            "player1Shots": game.game_state["player1_shots"],
                            "player2Shots": game.game_state["player2_shots"],
                            "lastMove": f"{col_letter}{row_idx + 1}",
                            "lastResult": move_result["result"],
                            "message": f"Player {3 - game.current_player} fired at {col_letter}{row_idx + 1} - {move_result['result'].upper()}!",
                            "status": "finished" if game.winner else "in_progress",
                            "winner": game.winner,
                        })

                        if game.winner:
                            game.status = "finished"
                            await websocket.send_json({
                                "type": "game_over",
                                "winner": game.winner,
                                "message": f"Player {game.winner} wins!",
                                "board_size": game.board_size,
                            })
                            _finalize_battleship_benchmark(game_id, game)
                            if game_id in battleship_games:
                                del battleship_games[game_id]
                            battleship_benchmark_meta.pop(game_id, None)
                            break

                        await asyncio.sleep(0.3)
                        break
                    else:
                        print(f"Invalid move from player {current_player}: {move_result.get('reason', move_result.get('result', 'unknown error'))}")
                        retry_count += 1
                        await asyncio.sleep(0.5)

                except Exception as e:
                    print(f"Error processing move from player {current_player}: {e}")
                    print(f"Raw response was: {move_response}")
                    retry_count += 1
                    await asyncio.sleep(0.5)
                    continue

            if retry_count >= max_retries:
                print(f"Player {current_player} failed to make a valid move after {max_retries} attempts")
                available_positions = []
                shots = game.game_state[f"player{current_player}_shots"]
                for i in range(game.board_size):
                    for j in range(game.board_size):
                        if shots[i][j] is None:
                            available_positions.append((i, j))

                if available_positions:
                    row_idx, col_idx = random.choice(available_positions)
                    move_result = game.make_move(row_idx, col_idx)

                    if move_result["success"]:
                        col_letter = chr(col_idx + ord("A"))
                        await websocket.send_json({
                            "type": "game_state",
                            "board_size": game.board_size,
                            "currentPlayer": game.current_player,
                            "player1Shots": game.game_state["player1_shots"],
                            "player2Shots": game.game_state["player2_shots"],
                            "lastMove": f"{col_letter}{row_idx + 1}",
                            "lastResult": move_result["result"],
                            "message": f"Player {3 - game.current_player} fired at {col_letter}{row_idx + 1} - {move_result['result'].upper()}! (random fallback)",
                            "status": "finished" if game.winner else "in_progress",
                            "winner": game.winner,
                        })

                        if game.winner:
                            game.status = "finished"
                            await websocket.send_json({
                                "type": "game_over",
                                "winner": game.winner,
                                "message": f"Player {game.winner} wins!",
                                "board_size": game.board_size,
                            })
                            _finalize_battleship_benchmark(game_id, game)
                            if game_id in battleship_games:
                                del battleship_games[game_id]
                            battleship_benchmark_meta.pop(game_id, None)
                else:
                    print(f"No available positions for player {current_player}")
                    break

    except Exception as e:
        print(f"Error in game loop for {game_id}: {e}")
        import traceback
        traceback.print_exc()

# =================
# WORDLE ENDPOINTS
# =================

current_wordle_game = None


class WordleStartBody(BaseModel):
    secret_word: Optional[str] = None
    player1_model: str = "gpt-5.5"
    player2_model: str = "claude-sonnet-4-6"
    word_length: int = Field(5, ge=5, le=8)
    hard_mode: bool = False


@app.post("/api/wordle/start")
async def start_wordle_game(body: WordleStartBody):
    """Start a new Wordle game with configurable length and models."""
    global current_wordle_game

    secret = (body.secret_word or "").strip().upper()
    if not secret:
        secret = pick_secret_word(body.word_length).upper()
    if len(secret) != body.word_length or not secret.isalpha():
        raise HTTPException(
            status_code=400,
            detail=f"Secret must be exactly {body.word_length} letters (A-Z)",
        )

    game_id = str(uuid.uuid4())
    rec = get_recorder()
    br = rec.start_run(
        "wordle",
        body.player1_model,
        body.player2_model,
        {"word_length": body.word_length, "hard_mode": body.hard_mode, "secret_hash": secret[:1] + "***"},
    )
    game = WordleSimpleGame(
        secret,
        body.player1_model,
        body.player2_model,
        hard_mode=body.hard_mode,
    )
    game.benchmark_run_id = br
    game._bench_move_seq = 0

    current_wordle_game = game
    wordle_games[game_id] = {"game": game, "benchmark_run_id": br}

    return {
        "success": True,
        "game_id": game_id,
        "benchmark_run_id": br,
        "word_length": body.word_length,
        "hard_mode": body.hard_mode,
    }


@app.get("/api/wordle/state/{game_id}")
async def get_wordle_state(game_id: str):
    """Get current Wordle game state"""
    if game_id not in wordle_games:
        raise HTTPException(status_code=404, detail="No active game")

    game = wordle_games[game_id]["game"]
    return {
        "models": game.models,
        "model_ids": game.model_ids,
        "word_length": game.word_len,
        "hard_mode": game.hard_mode,
        "game_over": game.game_over,
        "winner": game.winner,
        "secret_word": game.secret_word if game.game_over else None,
    }


@app.get("/api/wordle/state")
async def get_wordle_state_no_id():
    """Get current Wordle game state (backward compatibility)"""
    if not current_wordle_game:
        raise HTTPException(status_code=404, detail="No active game")

    return {
        "models": current_wordle_game.models,
        "model_ids": current_wordle_game.model_ids,
        "word_length": current_wordle_game.word_len,
        "hard_mode": current_wordle_game.hard_mode,
        "game_over": current_wordle_game.game_over,
        "winner": current_wordle_game.winner,
        "secret_word": current_wordle_game.secret_word if current_wordle_game.game_over else None,
    }


async def _wordle_guess_impl(game: WordleSimpleGame, body: dict, benchmark_run_id: Optional[str]):
    raw = body.get("side") or body.get("model")
    alias = {
        "openai": "player1",
        "anthropic": "player2",
        "gpt-4o": "player1",
        "claude": "player2",
    }
    side = alias.get(str(raw).lower(), raw)
    if side not in ("player1", "player2"):
        raise HTTPException(status_code=400, detail="Invalid side: use player1 or player2")

    model_id = game.model_ids[side]
    model_data = game.models[side]
    usage: Dict[str, Any] = {}

    def _call():
        return get_llm_guess(
            model_id,
            list(model_data["guesses"]),
            list(model_data["feedback"]),
            word_len=game.word_len,
            hard_mode=game.hard_mode,
            usage_out=usage,
        )

    try:
        guess, reasoning = await asyncio.to_thread(_call)
    except Exception as e:
        print(f"Error getting guess from {model_id}: {e}")
        pool = ["CRANE", "SLATE", "AUDIO", "HOUSE", "ROUND", "LIGHT"]
        guess = pool[len(model_data["guesses"]) % len(pool)][: game.word_len].ljust(game.word_len, "A")[
            : game.word_len
        ]
        reasoning = f"API error - fallback: {guess}"

    result = game.make_guess(side, guess, reasoning)

    if "error" in result:
        return {
            "error": result["error"],
            "game_over": game.game_over,
            "winner": game.winner,
        }

    if benchmark_run_id:
        rec = get_recorder()
        game._bench_move_seq += 1
        rec.add_move(
            benchmark_run_id,
            side,
            game._bench_move_seq,
            latency_ms=usage.get("latency_ms"),
            input_tokens=usage.get("input_tokens"),
            output_tokens=usage.get("output_tokens"),
            cost_usd=usage.get("cost_usd"),
            correctness=1.0 if guess == game.secret_word else 0.0,
            response_preview=guess,
            error=usage.get("error"),
        )

    detailed = parse_reasoning_for_ui(side, reasoning, model_data["guesses"], model_data["feedback"])

    if result["game_over"] and benchmark_run_id and not getattr(game, "_benchmark_finished", False):
        game._benchmark_finished = True
        win = result.get("winner")
        if win is None or win == "TIE":
            w = 0
        else:
            wmap = {"player1": 1, "player2": 2}
            w = wmap.get(str(win), 0)
        rec = get_recorder()
        rec.finish_run(
            benchmark_run_id,
            "wordle",
            w,
            float(len(game.models["player1"]["guesses"])),
            float(len(game.models["player2"]["guesses"])),
            {"secret_length": game.word_len, "hard_mode": game.hard_mode},
        )

    return {
        "guess": guess,
        "reasoning": reasoning,
        "detailed_reasoning": detailed,
        "feedback": result["feedback"],
        "game_over": result["game_over"],
        "winner": result["winner"],
    }


@app.post("/api/wordle/guess/{game_id}")
async def make_wordle_guess(game_id: str, request: dict):
    if game_id not in wordle_games:
        raise HTTPException(status_code=404, detail="No active game")
    entry = wordle_games[game_id]
    game = entry["game"]
    br = entry.get("benchmark_run_id")
    return await _wordle_guess_impl(game, request, br)


@app.post("/api/wordle/guess")
async def make_wordle_guess_no_id(request: dict):
    if not current_wordle_game:
        raise HTTPException(status_code=404, detail="No active game")
    return await _wordle_guess_impl(
        current_wordle_game,
        request,
        getattr(current_wordle_game, "benchmark_run_id", None),
    )

# =======================
# NYT CONNECTIONS ENDPOINTS
# =======================

class ConnectionsStartRequest(BaseModel):
    player1_model: Optional[str] = None
    player2_model: Optional[str] = None

@app.post("/api/connections/start")
async def start_connections_game(request: ConnectionsStartRequest):
    """Start a new NYT Connections game"""
    try:
        game_id = str(uuid.uuid4())
        
        player1_model = request.player1_model or "gpt-5.5"
        player2_model = request.player2_model or "claude-sonnet-4-6"
        
        game1 = ConnectionsGame()
        game2 = ConnectionsGame(puzzle_data=game1.puzzle)
        
        rec = get_recorder()
        br = rec.start_run(
            "connections",
            player1_model,
            player2_model,
            {"puzzle_id": game1.id},
        )
        connections_games[game_id] = {
            "player1_game": game1,
            "player2_game": game2,
            "player1_model": player1_model,
            "player2_model": player2_model,
            "benchmark_run_id": br,
            "move_seq": 0,
            "benchmark_finished": False,
        }
        
        return {
            "game_id": game_id,
            "status": "started",
            "benchmark_run_id": br,
            "puzzle_id": game1.id,
            "date": game1.date,
            "words": game1.all_words,
            "player1_model": player1_model,
            "player2_model": player2_model
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start game: {str(e)}")

@app.websocket("/api/connections/ws/{game_id}")
async def connections_websocket(websocket: WebSocket, game_id: str):
    """WebSocket endpoint for NYT Connections real-time updates"""
    await manager.connect(websocket, game_id)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                if message.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except (json.JSONDecodeError, Exception):
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, game_id)
        if game_id not in manager.active_connections or not manager.active_connections.get(game_id):
            if game_id in game_runners:
                print(f"All clients disconnected from connections {game_id}, stopping runner")
                game_runners[game_id].stop_all()
                del game_runners[game_id]


@app.websocket("/games/connections/{game_id}")
async def connections_websocket_alias(websocket: WebSocket, game_id: str):
    """Alias path for frontend WebSocket (matches /games/connections/{id})."""
    await connections_websocket(websocket, game_id)


@app.post("/api/connections/game/{game_id}/player/{player}/ai-turn")
async def connections_ai_turn(game_id: str, player: str, request: dict):
    """Process an AI turn for NYT Connections"""
    try:
        player_num = int(player)
        if player_num not in [1, 2]:
            raise ValueError("Player must be 1 or 2")
    except ValueError:
        raise HTTPException(status_code=400, detail="Player must be 1 or 2")
    
    if game_id not in connections_games:
        raise HTTPException(status_code=404, detail="Game not found")
    
    session = connections_games[game_id]
    
    if player_num == 1:
        game = session["player1_game"]
        model_id = session["player1_model"]
    else:
        game = session["player2_game"]
        model_id = session["player2_model"]
    
    if game.game_over:
        return {"error": "Game is already over"}
    
    try:
        guess = await asyncio.to_thread(game.get_ai_guess, model_id)
        
        if not guess:
            return {"error": "Failed to get AI guess"}
        
        result = game.make_guess(model_id, guess)

        br = session.get("benchmark_run_id")
        if br:
            session["move_seq"] = session.get("move_seq", 0) + 1
            u = getattr(game, "_last_llm_usage", {}) or {}
            corr = 1.0 if result.get("result", {}).get("correct") else 0.0
            get_recorder().add_move(
                br,
                f"player{player_num}",
                session["move_seq"],
                latency_ms=u.get("latency_ms"),
                input_tokens=u.get("input_tokens"),
                output_tokens=u.get("output_tokens"),
                cost_usd=u.get("cost_usd"),
                correctness=corr,
                response_preview=str(guess)[:500],
                error=u.get("error"),
            )
        _connections_try_finish(game_id)
        
        await manager.broadcast_to_game(
            json.dumps({
                "type": "game_update",
                "data": {
                    "player": player_num,
                    "model": model_id,
                    "guess": guess,
                    "result": result,
                    "game_state": game.get_game_state()
                }
            }),
            game_id
        )
        
        return {
            "player": player_num,
            "model": model_id,
            "guess": guess,
            "result": result,
            "game_state": game.get_game_state()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/connections/game/{game_id}/start-race")
async def start_connections_race(game_id: str):
    """Start the autonomous connections race with async agent loops"""
    if game_id not in connections_games:
        raise HTTPException(status_code=404, detail="Game not found")

    session = connections_games[game_id]
    
    if game_id in game_runners:
        return {"status": "already_running"}

    async def broadcast_fn(gid, data):
        await manager.broadcast_to_game(json.dumps(data), gid)

    runner = GameRunner(game_id, broadcast_fn=broadcast_fn)

    async def make_connections_move(agent_id: str, state: dict):
        player_num = 1 if agent_id == "player1" else 2
        game = session[f"player{player_num}_game"]
        model_id = session[f"player{player_num}_model"]

        async with runner.lock:
            if game.game_over:
                both_done = session["player1_game"].game_over and session["player2_game"].game_over
                if both_done:
                    runner.mark_game_over()
                return

            try:
                guess = game.get_ai_guess(model_id)
                if not guess:
                    return
                result = game.make_guess(model_id, guess)
                br = session.get("benchmark_run_id")
                if br:
                    session["move_seq"] = session.get("move_seq", 0) + 1
                    u = getattr(game, "_last_llm_usage", {}) or {}
                    corr = 1.0 if result.get("result", {}).get("correct") else 0.0
                    get_recorder().add_move(
                        br,
                        f"player{player_num}",
                        session["move_seq"],
                        latency_ms=u.get("latency_ms"),
                        input_tokens=u.get("input_tokens"),
                        output_tokens=u.get("output_tokens"),
                        cost_usd=u.get("cost_usd"),
                        correctness=corr,
                        response_preview=str(guess)[:500],
                        error=u.get("error"),
                    )
                _connections_try_finish(game_id)
                await runner.broadcast("game_update", {
                    "data": {
                        "player": player_num,
                        "model": model_id,
                        "guess": guess,
                        "result": result,
                        "game_state": game.get_game_state()
                    }
                })
            except Exception as e:
                print(f"Connections agent {agent_id} error: {e}")

    agent1 = AgentLoop(
        agent_id="player1",
        game_state_fn=lambda: session["player1_game"].get_game_state(),
        move_fn=make_connections_move,
        is_game_over_fn=lambda: runner.is_game_over,
        think_delay=1.0,
    )
    agent2 = AgentLoop(
        agent_id="player2",
        game_state_fn=lambda: session["player2_game"].get_game_state(),
        move_fn=make_connections_move,
        is_game_over_fn=lambda: runner.is_game_over,
        think_delay=1.5,
    )

    runner.add_agent(agent1)
    runner.add_agent(agent2)
    game_runners[game_id] = runner

    asyncio.create_task(runner.run())
    return {"status": "race_started", "game_id": game_id}

@app.get("/api/connections/game/{game_id}/state")
async def get_connections_state(game_id: str):
    """Get current NYT Connections game state"""
    if game_id not in connections_games:
        raise HTTPException(status_code=404, detail="Game not found")
    
    session = connections_games[game_id]
    return {
        "player1_state": session["player1_game"].get_game_state(),
        "player2_state": session["player2_game"].get_game_state(),
        "player1_model": session["player1_model"],
        "player2_model": session["player2_model"],
    }


def _connections_try_finish(game_id: str) -> None:
    sess = connections_games.get(game_id)
    if not sess or sess.get("benchmark_finished"):
        return
    g1, g2 = sess["player1_game"], sess["player2_game"]
    if not (g1.game_over and g2.game_over):
        return
    br = sess.get("benchmark_run_id")
    if not br:
        sess["benchmark_finished"] = True
        return
    s1, s2 = len(g1.found_groups), len(g2.found_groups)
    i1, i2 = len(g1.incorrect_guesses), len(g2.incorrect_guesses)
    if s1 > s2:
        w = 1
    elif s2 > s1:
        w = 2
    elif i1 < i2:
        w = 1
    elif i2 < i1:
        w = 2
    else:
        w = 0
    get_recorder().finish_run(
        br,
        "connections",
        w,
        float(s1),
        float(s2),
        {
            "incorrect_p1": i1,
            "incorrect_p2": i2,
            "difficulty_avg_p1": getattr(g1, "difficulty_avg", None),
            "difficulty_avg_p2": getattr(g2, "difficulty_avg", None),
        },
    )
    sess["benchmark_finished"] = True


# ==========================
# BENCHMARK MINI-GAMES (REST)
# ==========================


class PrisonersStartBody(BaseModel):
    player1_model: str = "gpt-5.5"
    player2_model: str = "claude-sonnet-4-6"
    rounds: int = 10


@app.post("/api/prisoners/start")
async def prisoners_start(body: PrisonersStartBody):
    sess = pd_start_session(body.player1_model, body.player2_model, rounds=body.rounds)
    rec = get_recorder()
    rid = rec.start_run(
        "prisoners_dilemma",
        body.player1_model,
        body.player2_model,
        {"rounds": body.rounds},
    )
    sess.benchmark_run_id = rid
    prisoners_sessions[sess.id] = {"session": sess, "move_seq": 0, "finished": False}
    return {"session_id": sess.id, "benchmark_run_id": rid, "rounds": body.rounds}


@app.post("/api/prisoners/{session_id}/step")
async def prisoners_step(session_id: str):
    entry = prisoners_sessions.get(session_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Session not found")
    sess: Any = entry["session"]
    if entry.get("finished"):
        return {"done": True, "scores": sess.scores, "history": sess.history}

    out = pd_play_round(sess)
    br = getattr(sess, "benchmark_run_id", None)
    rnd = out.get("round")
    if br and isinstance(rnd, dict):
        rec = get_recorder()
        for ag, u in (("player1", rnd.get("usage1")), ("player2", rnd.get("usage2"))):
            u = u or {}
            entry["move_seq"] += 1
            rec.add_move(
                br,
                ag,
                entry["move_seq"],
                latency_ms=u.get("latency_ms"),
                input_tokens=u.get("input_tokens"),
                output_tokens=u.get("output_tokens"),
                cost_usd=u.get("cost_usd"),
                correctness=1.0,
                response_preview=(rnd.get("raw1") if ag == "player1" else rnd.get("raw2")),
                error=u.get("error"),
            )

    if out.get("done") and br and not entry.get("finished"):
        entry["finished"] = True
        w = pd_winner_side(sess)
        get_recorder().finish_run(
            br,
            "prisoners_dilemma",
            w,
            float(sess.scores[0]),
            float(sess.scores[1]),
            {"rounds": len(sess.history)},
        )

    return out


class TwentyQuestionsStartBody(BaseModel):
    answerer_model: str = "gpt-5.5"
    questioner_model: str = "claude-sonnet-4-6"
    secret: Optional[str] = None
    max_questions: int = 20


@app.post("/api/twenty-questions/start")
async def twenty_questions_start(body: TwentyQuestionsStartBody):
    sess = tq_start(body.answerer_model, body.questioner_model, body.secret)
    rec = get_recorder()
    rid = rec.start_run(
        "twenty_questions",
        body.questioner_model,
        body.answerer_model,
        {"max_questions": body.max_questions},
    )
    sess.benchmark_run_id = rid
    twenty_questions_sessions[sess.id] = {"session": sess, "seq": 0, "finished": False}
    return {"session_id": sess.id, "benchmark_run_id": rid}


@app.post("/api/twenty-questions/{session_id}/step")
async def twenty_questions_step(session_id: str):
    entry = twenty_questions_sessions.get(session_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Session not found")
    sess: Any = entry["session"]
    if entry.get("finished"):
        return {"done": True}

    out = tq_play_turn(sess)
    br = getattr(sess, "benchmark_run_id", None)
    rec = get_recorder()
    if br:
        entry["seq"] += 1
        uq = out.get("usage_q") or {}
        rec.add_move(
            br,
            "questioner",
            entry["seq"],
            latency_ms=uq.get("latency_ms"),
            input_tokens=uq.get("input_tokens"),
            output_tokens=uq.get("output_tokens"),
            cost_usd=uq.get("cost_usd"),
            correctness=None,
            response_preview=str(out.get("exchange", {}).get("q", ""))[:500],
            error=uq.get("error"),
        )
        if not out.get("done"):
            ua = out.get("usage_a") or {}
            entry["seq"] += 1
            rec.add_move(
                br,
                "answerer",
                entry["seq"],
                latency_ms=ua.get("latency_ms"),
                input_tokens=ua.get("input_tokens"),
                output_tokens=ua.get("output_tokens"),
                cost_usd=ua.get("cost_usd"),
                correctness=None,
                response_preview=str(out.get("exchange", {}).get("a", ""))[:80],
                error=ua.get("error"),
            )

    if out.get("done") and br and not entry.get("finished"):
        entry["finished"] = True
        oc = out.get("outcome")
        if oc == "win":
            w = 1
        elif oc == "loss":
            w = 2
        else:
            w = 0
        rec.finish_run(
            br,
            "twenty_questions",
            w,
            float(out.get("questions_used") or len(sess.transcript)),
            0.0,
            {"outcome": oc, "secret": sess.secret},
        )

    return out


class CodeDebugStartBody(BaseModel):
    player1_model: str = "gpt-5.5"
    player2_model: str = "claude-sonnet-4-6"
    challenge_index: int = 0


@app.post("/api/code-debug/start")
async def code_debug_start(body: CodeDebugStartBody):
    sess = new_code_debug_session(body.player1_model, body.player2_model, body.challenge_index)
    rec = get_recorder()
    rid = rec.start_run(
        "code_debug",
        body.player1_model,
        body.player2_model,
        {"challenge": sess.challenge.get("id")},
    )
    sess.benchmark_run_id = rid
    code_debug_sessions[sess.id] = {"session": sess, "finished": False}
    return {
        "session_id": sess.id,
        "benchmark_run_id": rid,
        "title": sess.challenge.get("title"),
        "broken": sess.challenge.get("broken"),
    }


@app.post("/api/code-debug/{session_id}/run")
async def code_debug_run(session_id: str):
    entry = code_debug_sessions.get(session_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Session not found")
    if entry.get("finished"):
        raise HTTPException(status_code=400, detail="Already solved")
    sess: Any = entry["session"]
    br = getattr(sess, "benchmark_run_id", None)
    rec = get_recorder()
    seq = 0
    outs = {}
    for side in ("player1", "player2"):
        o = code_debug_run_player(sess, side)
        outs[side] = o
        if br:
            seq += 1
            u = o.get("usage") or {}
            rec.add_move(
                br,
                side,
                seq,
                latency_ms=u.get("latency_ms"),
                input_tokens=u.get("input_tokens"),
                output_tokens=u.get("output_tokens"),
                cost_usd=u.get("cost_usd"),
                correctness=o.get("score"),
                response_preview=o.get("code_preview"),
                error=u.get("error"),
            )
    s1 = CodeDebugSession.score(sess.submissions.get("player1", ""), sess.challenge)
    s2 = CodeDebugSession.score(sess.submissions.get("player2", ""), sess.challenge)
    w = 1 if s1 > s2 else 2 if s2 > s1 else 0
    if br:
        rec.finish_run(br, "code_debug", w, float(s1), float(s2), {"challenge": sess.challenge.get("id")})
    entry["finished"] = True
    return {"scores": {"player1": s1, "player2": s2}, "winner_side": w, "details": outs}


# ====================
# MAZE RACE
# ====================

class MazeStartBody(BaseModel):
    player1_model: str = "gpt-5.5"
    player2_model: str = "claude-sonnet-4-6"
    rows: int = 10
    cols: int = 10


@app.post("/api/maze/start")
async def maze_start(body: MazeStartBody):
    sess = maze_start_session(body.player1_model, body.player2_model, body.rows, body.cols)
    rec = get_recorder()
    rid = rec.start_run(
        "maze_race",
        body.player1_model,
        body.player2_model,
        {"rows": body.rows, "cols": body.cols},
    )
    sess.benchmark_run_id = rid
    maze_sessions[sess.id] = {"session": sess, "finished": False}
    state = maze_session_state(sess)
    state["benchmark_run_id"] = rid
    return state


@app.post("/api/maze/{session_id}/step")
async def maze_step(session_id: str):
    entry = maze_sessions.get(session_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Session not found")
    sess = entry["session"]
    if sess.done:
        return {"done": True, "winner": sess.winner, "step": sess.step_count}

    result = await asyncio.to_thread(maze_play_step, sess)

    if result.get("done") and not entry.get("finished"):
        entry["finished"] = True
        br = getattr(sess, "benchmark_run_id", None)
        if br:
            rec = get_recorder()
            w = maze_winner_side(sess)
            rec.finish_run(
                br, "maze_race", w,
                float(sess.step_count), float(sess.step_count),
                {"rows": sess.rows, "cols": sess.cols, "steps": sess.step_count},
            )

    return result


@app.get("/api/maze/{session_id}/state")
async def maze_state(session_id: str):
    entry = maze_sessions.get(session_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Session not found")
    return maze_session_state(entry["session"])


# ====================
# SNAKE DUEL
# ====================

class SnakeStartBody(BaseModel):
    player1_model: str = "gpt-5.5"
    player2_model: str = "claude-sonnet-4-6"
    rows: int = 15
    cols: int = 15


@app.post("/api/snake/start")
async def snake_start(body: SnakeStartBody):
    sess = snake_start_session(body.player1_model, body.player2_model, body.rows, body.cols)
    rec = get_recorder()
    rid = rec.start_run(
        "snake_duel",
        body.player1_model,
        body.player2_model,
        {"rows": body.rows, "cols": body.cols},
    )
    sess.benchmark_run_id = rid
    snake_sessions[sess.id] = {"session": sess, "finished": False}
    state = snake_session_state(sess)
    state["benchmark_run_id"] = rid
    return state


@app.post("/api/snake/{session_id}/step")
async def snake_step(session_id: str):
    entry = snake_sessions.get(session_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Session not found")
    sess = entry["session"]
    if sess.done:
        return snake_session_state(sess)

    result = await asyncio.to_thread(snake_play_step, sess)

    if result.get("done") and not entry.get("finished"):
        entry["finished"] = True
        br = getattr(sess, "benchmark_run_id", None)
        if br:
            rec = get_recorder()
            w = snake_winner_side(sess)
            rec.finish_run(
                br, "snake_duel", w,
                float(sess.score1), float(sess.score2),
                {"rows": sess.rows, "cols": sess.cols, "steps": sess.step_count},
            )

    return result


@app.get("/api/snake/{session_id}/state")
async def snake_state(session_id: str):
    entry = snake_sessions.get(session_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Session not found")
    return snake_session_state(entry["session"])


# ====================
# COMMON ENDPOINTS
# ====================

@app.get("/")
async def root():
    """Root endpoint with server info"""
    return {
        "server": "VERSUS Unified Game Server",
        "version": "2.0.0",
        "games": {
            "battleship": {"active": len([g for g in active_games.items() if g[1].get("type") == "battleship"])},
            "wordle": {"active": len(wordle_games)},
            "connections": {"active": len(connections_games)}
        },
        "endpoints": {
            "battleship": "/games/battleship/{game_id}",
            "wordle": "/api/wordle/*",
            "connections": "/api/connections/*"
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "games": {
            "battleship": "ready",
            "wordle": "ready",
            "connections": "ready"
        }
    }

@app.get("/api/default-models")
async def get_default_models():
    """Get default model configurations for all games"""
    return {
        "default_models": DEFAULT_MODELS,
        "supported_models": ["openai", "anthropic", "gemini"]
    }

if __name__ == "__main__":
    print("Starting VERSUS Unified Game Server...")
    print("Server running on http://localhost:8000")
    print("API docs available at http://localhost:8000/docs")
    print("Press Ctrl+C to stop the server")
    print("-" * 50)
    print("Available games:")
    print("  - Battleship: WebSocket at /games/battleship/{game_id}")
    print("  - Wordle: API at /api/wordle/*")
    print("  - NYT Connections: API at /api/connections/*")
    print("-" * 50)
    
    uvicorn.run(app, host="0.0.0.0", port=8000)
