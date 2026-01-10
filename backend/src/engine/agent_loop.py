"""
Async Agent Loop Engine

Each game spawns two independent agent loops that run concurrently.
Each agent observes the shared game state, decides its next move,
and submits it. An asyncio.Lock on the game state prevents races.
"""

import asyncio
import logging
import time
from typing import Any, Callable, Coroutine, Dict, Optional

logger = logging.getLogger(__name__)


class AgentLoop:
    """
    An independent async loop for a single AI agent within a game.

    The loop repeats: observe → think → act → wait, until the game ends
    or the agent's task is cancelled.
    """

    def __init__(
        self,
        agent_id: str,
        game_state_fn: Callable[[], Dict[str, Any]],
        move_fn: Callable[[str, Dict[str, Any]], Coroutine],
        is_game_over_fn: Callable[[], bool],
        think_delay: float = 0.5,
    ):
        """
        Args:
            agent_id: identifier for this agent (e.g. model name)
            game_state_fn: callable that returns a snapshot of the current game state
            move_fn: async callable(agent_id, state) that executes one move
            is_game_over_fn: callable that returns True when the game is finished
            think_delay: seconds to wait between moves (simulates thinking)
        """
        self.agent_id = agent_id
        self._get_state = game_state_fn
        self._make_move = move_fn
        self._is_over = is_game_over_fn
        self.think_delay = think_delay
        self._task: Optional[asyncio.Task] = None
        self.moves_made = 0
        self.errors = 0

    async def _run(self):
        """Core loop: observe → act → sleep → repeat."""
        logger.info(f"Agent {self.agent_id} loop started")
        while not self._is_over():
            try:
                state = self._get_state()
                await self._make_move(self.agent_id, state)
                self.moves_made += 1
            except asyncio.CancelledError:
                logger.info(f"Agent {self.agent_id} loop cancelled")
                return
            except Exception as e:
                self.errors += 1
                logger.error(f"Agent {self.agent_id} error (attempt {self.errors}): {e}")
                if self.errors > 10:
                    logger.error(f"Agent {self.agent_id} exceeded error limit, stopping")
                    return
            await asyncio.sleep(self.think_delay)

        logger.info(
            f"Agent {self.agent_id} loop finished after {self.moves_made} moves"
        )

    def start(self) -> asyncio.Task:
        """Spawn the agent loop as a background task."""
        self._task = asyncio.create_task(self._run())
        return self._task

    def stop(self):
        """Cancel the agent loop."""
        if self._task and not self._task.done():
            self._task.cancel()


class GameRunner:
    """
    Manages a pair of agent loops for a two-player game.

    Provides a shared lock so moves don't collide, and a broadcast
    callback so the frontend is notified after every state change.
    """

    def __init__(
        self,
        game_id: str,
        broadcast_fn: Optional[Callable[[str, Dict], Coroutine]] = None,
    ):
        self.game_id = game_id
        self.lock = asyncio.Lock()
        self._broadcast = broadcast_fn
        self.agents: list[AgentLoop] = []
        self.start_time = time.time()
        self._game_over = False

    def mark_game_over(self):
        self._game_over = True

    @property
    def is_game_over(self) -> bool:
        return self._game_over

    async def broadcast(self, event_type: str, data: Dict[str, Any]):
        """Send a state update to all connected clients."""
        if self._broadcast:
            try:
                await self._broadcast(self.game_id, {"type": event_type, **data})
            except Exception as e:
                logger.error(f"Broadcast error for game {self.game_id}: {e}")

    def add_agent(self, agent: AgentLoop):
        self.agents.append(agent)

    async def run(self):
        """Start all agent loops and wait for them to finish."""
        tasks = [agent.start() for agent in self.agents]
        try:
            await asyncio.gather(*tasks, return_exceptions=True)
        finally:
            for agent in self.agents:
                agent.stop()

    def stop_all(self):
        """Cancel all agent loops."""
        for agent in self.agents:
            agent.stop()
