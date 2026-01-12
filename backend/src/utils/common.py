"""
Common utilities and base classes for all games
"""

import os
import time
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, Tuple
from enum import Enum
from dotenv import load_dotenv
import asyncio

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
    
    def get_response(self, prompt: str, max_tokens: int = 100, temperature: float = 0.7, max_retries: int = 3) -> str:
        """Get a response from the LLM with retry and backoff"""
        for attempt in range(max_retries):
            try:
                if self.model_type == "OPENAI":
                    params = {
                        "model": self.model_name,
                        "messages": [{"role": "user", "content": prompt}],
                        "timeout": 30,
                    }
                    if self._is_new_openai_model():
                        params["max_completion_tokens"] = max_tokens
                    else:
                        params["temperature"] = temperature
                        params["max_tokens"] = max_tokens
                    response = self.client.chat.completions.create(**params)
                    return response.choices[0].message.content.strip()
                elif self.model_type == "ANTHROPIC":
                    response = self.client.messages.create(
                        model=self.model_name,
                        messages=[{"role": "user", "content": prompt}],
                        temperature=temperature,
                        max_tokens=max_tokens,
                    )
                    return response.content[0].text.strip()
                elif self.model_type == "GOOGLE":
                    response = self.client.generate_content(prompt)
                    return response.text.strip()
                else:
                    raise ValueError(f"Unknown model type: {self.model_type}")
            except Exception as e:
                print(f"LLM call attempt {attempt+1}/{max_retries} failed for {self.model_id}: {e}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                else:
                    print(f"All {max_retries} attempts failed for {self.model_id}")
                    return None
    
    def get_move(self, prompt: str, game_state: dict = None, max_retries: int = 3) -> str:
        """Get a move from the LLM with retry and backoff (sync version for battleship)"""
        import re
        import random
        import string

        def _random_move():
            col = random.choice(string.ascii_uppercase[:8])
            row = random.randint(1, 8)
            return f"{col}{row}"

        def _fallback_move():
            suggested_match = re.search(r'Suggested position: ([A-H][1-8])', prompt)
            if suggested_match:
                return suggested_match.group(1)
            return _random_move()

        for attempt in range(max_retries):
            try:
                if self.model_type == "OPENAI":
                    params = {
                        "model": self.model_name,
                        "messages": [
                            {"role": "system", "content": "You are playing Battleship. Reply with ONLY a coordinate like 'A5'. No other text."},
                            {"role": "user", "content": prompt}
                        ],
                        "timeout": 30,
                    }
                    if self._is_new_openai_model():
                        params["max_completion_tokens"] = 10
                    else:
                        params["temperature"] = 0.7
                        params["max_tokens"] = 10
                    response = self.client.chat.completions.create(**params)
                    content = response.choices[0].message.content.strip()
                elif self.model_type == "ANTHROPIC":
                    response = self.client.messages.create(
                        model=self.model_name,
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=10,
                        temperature=0.7,
                    )
                    content = response.content[0].text.strip()
                elif self.model_type == "GOOGLE":
                    response = self.client.generate_content(prompt)
                    content = response.text.strip()
                else:
                    return _fallback_move()

                coord_match = re.search(r'[A-Ha-h][1-8]', content)
                if coord_match:
                    return coord_match.group(0).upper()

                suggested_match = re.search(r'Suggested position: ([A-H][1-8])', prompt)
                if suggested_match:
                    return suggested_match.group(1)

                return _random_move()

            except Exception as e:
                print(f"get_move attempt {attempt+1}/{max_retries} failed for {self.model_type} ({self.model_name}): {e}")
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