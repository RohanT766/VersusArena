"""
Common utilities and base classes for all games
"""

import os
import time
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, Tuple, List
from enum import Enum
from dotenv import load_dotenv
import asyncio

from src.benchmark.cost_estimate import estimate_cost_usd
from src.engine.model_registry import anthropic_messages_create, effective_max_tokens

# Load environment variables from backend/.env
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))  # Go up 3 levels from src/utils/common.py
env_path = os.path.join(backend_dir, '.env')
load_dotenv(env_path)

class GameStatus(Enum):
    """Game status enumeration"""
    WAITING = "waiting"
    IN_PROGRESS = "in_progress"
    FINISHED = "finished"
    ERROR = "error"

class LLMClient:
    """Wrapper for different LLM API clients"""
    
    def __init__(self, model_id: str, use_async: bool = False):
        self.model_id = model_id
        self.use_async = use_async
        self.model_type, self.model_name = self._parse_model_id(model_id)
        self.client = self._initialize_client()
    
    def _parse_model_id(self, model_id: str) -> Tuple[str, str]:
        """Parse model ID to determine provider and model name"""
        model_id_lower = model_id.lower()
        
        # OpenAI models (including o-series reasoning models)
        if any(x in model_id_lower for x in ['gpt', 'o1', 'o3', 'o4', 'davinci']):
            return "OPENAI", model_id
        
        # Claude models
        elif 'claude' in model_id_lower:
            return "ANTHROPIC", model_id
        
        # Gemini models
        elif 'gemini' in model_id_lower:
            return "GOOGLE", model_id
        
        # Default to OpenAI
        else:
            return "OPENAI", model_id
    
    def _is_new_openai_model(self) -> bool:
        """GPT-5.x and o-series models use max_completion_tokens instead of max_tokens"""
        m = self.model_name.lower()
        return any(m.startswith(p) for p in ['gpt-5', 'o1', 'o3', 'o4'])
    
    def _initialize_client(self):
        """Initialize the appropriate API client"""
        if self.model_type == "OPENAI":
            from openai import OpenAI
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY not found in environment variables")
            return OpenAI(api_key=api_key)
            
        elif self.model_type == "ANTHROPIC":
            from anthropic import Anthropic
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY not found in environment variables")
            return Anthropic(api_key=api_key)
            
        elif self.model_type == "GOOGLE":
            import google.generativeai as genai
            api_key = os.getenv("GOOGLE_API_KEY")
            if not api_key:
                raise ValueError("GOOGLE_API_KEY not found in environment variables")
            genai.configure(api_key=api_key)
            return genai.GenerativeModel(self.model_name)
            
        else:
            raise ValueError(f"Unknown model type: {self.model_type}")
    
    def _fill_usage_openai(self, usage_out: Dict[str, Any], response: Any, t0: float) -> None:
        usage_out["latency_ms"] = (time.time() - t0) * 1000.0
        u = getattr(response, "usage", None)
        if u:
            inp = getattr(u, "prompt_tokens", None) or getattr(u, "input_tokens", None)
            outp = getattr(u, "completion_tokens", None) or getattr(u, "output_tokens", None)
            usage_out["input_tokens"] = inp
            usage_out["output_tokens"] = outp
            usage_out["cost_usd"] = estimate_cost_usd(
                self.model_type, self.model_name.lower(),
                inp or 0, outp or 0,
            )

    def _fill_usage_anthropic(self, usage_out: Dict[str, Any], response: Any, t0: float) -> None:
        usage_out["latency_ms"] = (time.time() - t0) * 1000.0
        u = getattr(response, "usage", None)
        if u:
            inp = getattr(u, "input_tokens", None)
            outp = getattr(u, "output_tokens", None)
            usage_out["input_tokens"] = inp
            usage_out["output_tokens"] = outp
            usage_out["cost_usd"] = estimate_cost_usd(
                self.model_type, self.model_name.lower(),
                inp or 0, outp or 0,
            )

    def _fill_usage_google(self, usage_out: Dict[str, Any], response: Any, t0: float) -> None:
        usage_out["latency_ms"] = (time.time() - t0) * 1000.0
        um = getattr(response, "usage_metadata", None)
        if um:
            inp = getattr(um, "prompt_token_count", None)
            outp = getattr(um, "candidates_token_count", None)
            usage_out["input_tokens"] = inp
            usage_out["output_tokens"] = outp
            usage_out["cost_usd"] = estimate_cost_usd(
                self.model_type, self.model_name.lower(),
                inp or 0, outp or 0,
            )

    def get_response(
        self,
        prompt: str,
        max_tokens: int = 100,
        temperature: float = 0.7,
        max_retries: int = 3,
        usage_out: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Get a response from the LLM with retry and backoff."""
        out = usage_out if usage_out is not None else None
        for attempt in range(max_retries):
            t0 = time.time()
            try:
                if self.model_type == "OPENAI":
                    params = {
                        "model": self.model_name,
                        "messages": [{"role": "user", "content": prompt}],
                        "timeout": 60,
                    }
                    cap = effective_max_tokens(self.model_name, max_tokens)
                    if self._is_new_openai_model():
                        params["max_completion_tokens"] = cap
                    else:
                        params["temperature"] = temperature
                        params["max_tokens"] = cap
                    response = self.client.chat.completions.create(**params)
                    text = response.choices[0].message.content
                    text = text.strip() if text else ""
                    if out is not None:
                        self._fill_usage_openai(out, response, t0)
                        out["error"] = None
                    return text
                elif self.model_type == "ANTHROPIC":
                    response = anthropic_messages_create(
                        self.client,
                        model=self.model_name,
                        messages=[{"role": "user", "content": prompt}],
                        temperature=temperature,
                        max_tokens=max_tokens,
                    )
                    text = response.content[0].text.strip()
                    if out is not None:
                        self._fill_usage_anthropic(out, response, t0)
                        out["error"] = None
                    return text
                elif self.model_type == "GOOGLE":
                    response = self.client.generate_content(prompt)
                    text = getattr(response, "text", "") or ""
                    text = text.strip()
                    if out is not None:
                        self._fill_usage_google(out, response, t0)
                        out["error"] = None
                    return text
                else:
                    raise ValueError(f"Unknown model type: {self.model_type}")
            except Exception as e:
                print(f"LLM call attempt {attempt+1}/{max_retries} failed for {self.model_id}: {e}")
                if out is not None:
                    out["latency_ms"] = (time.time() - t0) * 1000.0
                    out["error"] = str(e)
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                else:
                    print(f"All {max_retries} attempts failed for {self.model_id}")
                    return None
    
    def get_move(
        self,
        prompt: str,
        game_state: dict = None,
        max_retries: int = 3,
        usage_out: Optional[Dict[str, Any]] = None,
        board_letters: str = "ABCDEFGH",
    ) -> str:
        """Get a move from the LLM with retry and backoff (sync version for battleship)"""
        import re
        import random
        import string

        n = len(board_letters)

        def _random_move():
            col = random.choice(board_letters)
            row = random.randint(1, n)
            return f"{col}{row}"

        def _fallback_move():
            pat = rf"Suggested position: ([{board_letters}]\d+)"
            suggested_match = re.search(pat, prompt, re.I)
            if suggested_match:
                return suggested_match.group(1).upper()
            return _random_move()

        coord_re = re.compile(rf"([{board_letters}])(\d+)", re.I)

        for attempt in range(max_retries):
            t0 = time.time()
            try:
                if self.model_type == "OPENAI":
                    params = {
                        "model": self.model_name,
                        "messages": [
                            {"role": "system", "content": "You are playing Battleship. Reply with ONLY a coordinate like 'A5'. No other text."},
                            {"role": "user", "content": prompt}
                        ],
                        "timeout": 60,
                    }
                    cap = effective_max_tokens(self.model_name, 10)
                    if self._is_new_openai_model():
                        params["max_completion_tokens"] = cap
                    else:
                        params["temperature"] = 0.7
                        params["max_tokens"] = cap
                    response = self.client.chat.completions.create(**params)
                    content = response.choices[0].message.content.strip()
                    if usage_out is not None:
                        self._fill_usage_openai(usage_out, response, t0)
                        usage_out["error"] = None
                elif self.model_type == "ANTHROPIC":
                    response = anthropic_messages_create(
                        self.client,
                        model=self.model_name,
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=effective_max_tokens(self.model_name, 10),
                        temperature=0.7,
                    )
                    content = response.content[0].text.strip()
                    if usage_out is not None:
                        self._fill_usage_anthropic(usage_out, response, t0)
                        usage_out["error"] = None
                elif self.model_type == "GOOGLE":
                    response = self.client.generate_content(prompt)
                    content = response.text.strip()
                    if usage_out is not None:
                        self._fill_usage_google(usage_out, response, t0)
                        usage_out["error"] = None
                else:
                    return _fallback_move()

                coord_match = coord_re.search(content)
                if coord_match:
                    return f"{coord_match.group(1).upper()}{coord_match.group(2)}"

                suggested_match = re.search(rf"Suggested position: ([{board_letters}]\d+)", prompt, re.I)
                if suggested_match:
                    return suggested_match.group(1).upper()

                return _random_move()

            except Exception as e:
                print(f"get_move attempt {attempt+1}/{max_retries} failed for {self.model_type} ({self.model_name}): {e}")
                if usage_out is not None:
                    usage_out["latency_ms"] = (time.time() - t0) * 1000.0
                    usage_out["error"] = str(e)
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                else:
                    print(f"All {max_retries} get_move attempts failed, falling back to random")
                    return _fallback_move()
    
    async def get_move_async(self, prompt: str, game_state: dict = None) -> str:
        """Get a move from the LLM (async version for other games)"""
        # This method can be implemented for async games
        # For now, it raises NotImplementedError to maintain compatibility with main branch
        raise NotImplementedError("Async move generation should be implemented in individual game classes")


class BaseGame(ABC):
    """Base class for all games"""
    
    def __init__(self, player1_model: str, player2_model: str, use_async: bool = False):
        self.player1 = LLMClient(player1_model, use_async)
        self.player2 = LLMClient(player2_model, use_async)
        self.current_player = 1
        self.game_state = self.initialize_game()
        self.winner = None
        self.game_over = False
    
    @abstractmethod
    def initialize_game(self) -> Dict[str, Any]:
        """Initialize the game state"""
        pass
    
    @abstractmethod
    def make_move(self, move: str) -> bool:
        """Make a move and update game state"""
        pass
    
    @abstractmethod
    def check_winner(self) -> Optional[int]:
        """Check if there's a winner"""
        pass
    
    @abstractmethod
    def get_prompt_for_player(self, player: int) -> str:
        """Generate prompt for the current player"""
        pass
    
    @abstractmethod
    def is_valid_move(self, move: str) -> bool:
        """Check if a move is valid"""
        pass
    
    def switch_player(self):
        """Switch to the other player"""
        self.current_player = 3 - self.current_player  # Switches between 1 and 2
    
    def play_turn(self) -> Dict[str, Any]:
        """Play one turn of the game"""
        # Get current player's LLM
        current_llm = self.player1 if self.current_player == 1 else self.player2
        
        # Generate prompt
        prompt = self.get_prompt_for_player(self.current_player)
        
        # Try to get a valid move (with retries)
        max_retries = 3
        for attempt in range(max_retries):
            # Get move from LLM
            move = current_llm.get_move(prompt)
            
            # Clean up the move (remove extra text if any)
            move = move.split()[0] if move else ""
            
            # Validate and make move
            if self.is_valid_move(move):
                self.make_move(move)
                
                # Check for winner
                self.winner = self.check_winner()
                if self.winner:
                    self.game_over = True
                else:
                    self.switch_player()
                
                return {
                    "success": True,
                    "move": move,
                    "player": self.current_player,
                    "game_state": self.game_state,
                    "game_over": self.game_over,
                    "winner": self.winner
                }
        
        # If we couldn't get a valid move after retries
        return {
            "success": False,
            "error": "Could not get valid move after retries",
            "player": self.current_player
        }