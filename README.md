# Versus Arena

Real-time competitive benchmarks for AI agents across classic games.

Versus Arena pits two AI agents against each other in head-to-head matches. Each model uses **structured tool calling**: game-specific tools to inspect state, then a terminal action to commit a move, in a multi-step observe-then-act loop. Every turn is logged with latency, tokens, cost, correctness, and tool usage, then rolled into Elo ratings and an analytics dashboard so you can compare models by game, matchup, and over time.

<img width="1192" height="662" alt="Screenshot 2026-05-20 at 1 54 30 AM" src="https://github.com/user-attachments/assets/df43ac5a-ec23-424d-8bcc-97d36c01308f" />
<img width="1193" height="661" alt="Screenshot 2026-05-20 at 2 13 20 AM" src="https://github.com/user-attachments/assets/2c8a5a3d-d783-4445-8c7e-0d7a21adcfb4" />
<img width="1195" height="662" alt="Screenshot 2026-05-20 at 1 44 22 PM" src="https://github.com/user-attachments/assets/29b03ade-15c9-46ea-ae47-7591e9a37dc3" />
<img width="1193" height="661" alt="Screenshot 2026-05-20 at 2 11 25 AM" src="https://github.com/user-attachments/assets/41f317e8-6e95-4b02-b509-a7842dbdc7da" />

## Games

**Arena games** (full UI, real-time playback, playable from the game menu):

| Game | What it tests | How it works |
|------|---------------|--------------|
| **Wordle** | Language, deduction, vocabulary | Tools: `get_feedback_history`, `submit_guess`. Same secret word; fewer guesses wins. |
| **NYT Connections** | Categorization, pattern recognition | Tools: `get_remaining_words`, `get_found_groups`, `submit_group`. Async race via agent-loop. |
| **Battleship** | Spatial reasoning, strategy | Tools: `get_board_state`, `fire_shot`, `place_ships`. Configurable grid + agent ship placement. |
| **Minesweeper Race** | Logical deduction, risk assessment | Tools: `get_board_view`, `reveal_cell`. Shared board; mines end your run. |
| **Auction Blitz** | Resource allocation, opponent modeling | Tools: `get_auction_state`, `place_bid`. Sealed bids over 8 rounds. |
| **Poker Showdown** | Game theory, bluffing, bet sizing | Tools: `get_hand_state`, `take_action`. Heads-up Hold'em over 10 hands. |

**Batch-only games** (no live UI; run via the benchmark batch API):

| Game | What it tests |
|------|---------------|
| **Prisoner's Dilemma** | Cooperation vs. defection strategy over iterated rounds |
| **Code Debug** | Code repair: fix a buggy snippet, graded against the canonical solution |
| **20 Questions** | One agent holds a secret word, the other asks yes/no questions to guess it |

## Supported Models

| Provider | Models |
|----------|--------|
| **OpenAI** | GPT-5.5, GPT-5.4 Mini, GPT-4o, o4-mini |
| **Anthropic** | Claude Opus 4.7, Claude Sonnet 4.6, Claude Haiku 4.5 |
| **Google** | Gemini 3.1 Pro, Gemini 2.5 Pro, Gemini 2.5 Flash |

Models are selected on the model-selection screen (Smash Bros-style card picker). A "Random" option picks a model at random for either slot.

## Analytics Dashboard

Every completed game feeds into a SQLite-backed benchmark database. The dashboard (`/dashboard`) provides:

- **Overview KPIs**: total runs, completion rate, median duration, unique models, avg latency and correctness
- **Elo Leaderboard**: filterable by game or overall, with win rate
- **Model Comparison**: bar charts of win rate and rating
- **Head-to-Head**: pairwise matchup win/loss/draw breakdown
- **Quality Metrics**: latency, cost, correctness, and error rate by model and game
- **Trend Charts**: runs per day, Elo movement over time
- **Run History**: filterable list with per-move detail drawer, delete with automatic Elo rebuild
- **Export**: CSV and JSON export of all run data

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- At least one API key: OpenAI, Anthropic, or Google

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Add your API keys to .env
```

Start the server:

```bash
python main.py
```

Runs on [http://localhost:8000](http://localhost:8000). API docs at [http://localhost:8000/docs](http://localhost:8000/docs).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on [http://localhost:5174](http://localhost:5174).

### Environment Variables

Create `backend/.env` from the template:

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
```

Only the providers you want to use need a key. The `BENCHMARK_DB_PATH` env var can override the default SQLite location (`backend/data/benchmark.sqlite`).

## Project Structure

```
VersusArena/
├── backend/
│   ├── main.py                          # Entry point: runs uvicorn on port 8000
│   ├── src/
│   │   ├── api/
│   │   │   ├── server.py                # FastAPI app, all game endpoints (REST + WebSocket)
│   │   │   └── benchmark_routes.py      # Leaderboard, analytics, batch runs, CSV/JSON export
│   │   ├── games/
│   │   │   ├── battleship/battleship.py # Battleship (extends BaseGame)
│   │   │   ├── wordle/wordle_simple.py  # Wordle engine
│   │   │   ├── nyt_connections/         # Connections puzzle + puzzle data
│   │   │   ├── minesweeper.py           # Minesweeper race
│   │   │   ├── auction.py               # Auction Blitz
│   │   │   ├── poker.py                 # Poker Showdown (+ poker_chips.py)
│   │   │   ├── prisoners_dilemma.py     # Iterated Prisoner's Dilemma
│   │   │   ├── code_debug_challenge.py  # Code repair benchmark
│   │   │   └── twenty_questions.py      # 20 Questions
│   │   ├── engine/
│   │   │   ├── agent_client.py          # Multi-step tool-call loop (OpenAI/Anthropic/Google)
│   │   │   ├── game_tools.py            # Per-game tool schemas
│   │   │   └── agent_loop.py            # Async race orchestration (Connections)
│   │   ├── benchmark/
│   │   │   ├── recorder.py              # Records runs, moves, and updates Elo
│   │   │   ├── analytics.py             # Aggregation queries (overview, h2h, trends, quality)
│   │   │   ├── elo.py                   # Elo rating math (K=32, initial 1200)
│   │   │   └── cost_estimate.py         # Per-model token cost estimates
│   │   ├── db/
│   │   │   └── database.py              # SQLite schema + connection pool
│   │   └── utils/
│   │       └── common.py                # LLMClient (batch games) + BaseGame
│   ├── tests/                           # pytest suite
│   ├── data/                            # SQLite DB (auto-created at runtime)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx                      # Router + game menu
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx          # Three.js WebGL landing (retro dither shader)
│   │   │   ├── ModelSelection.jsx       # Smash Bros-style model picker
│   │   │   └── Dashboard.jsx            # Analytics dashboard
│   │   ├── components/
│   │   │   ├── games/                   # Per-game UIs (Battleship, Wordle, Connections, etc.)
│   │   │   ├── dashboard/               # Dashboard widgets (Leaderboard, HeadToHead, Trends, etc.)
│   │   │   └── common/                  # GameLayout, GameOverModal, PixelIcons, timers
│   │   ├── hooks/                       # useGameFlow, useGameWebSocket, useWordleGameLoop
│   │   ├── config/modelCatalog.js       # Model registry
│   │   └── utils/                       # Network detection, chip math, game helpers
│   ├── package.json
│   └── vite.config.js
└── README.md
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend (React 19 + Vite, port 5174)              │
│  Three.js landing · Tailwind CSS · Recharts         │
│  REST + WebSocket ←→ backend                        │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│  Backend (FastAPI, port 8000)                        │
│                                                      │
│  ┌──────────┐  ┌─────────────┐  ┌──────────────────┐ │
│  │ Game     │  │ AgentClient │  │ Benchmark        │ │
│  │ Modules  │──│ + game_tools│  │ Recorder + Elo   │ │
│  └────┬─────┘  └──────┬──────┘  └────────┬─────────┘ │
│       │               │                  │           │
│  ┌────▼─────┐  ┌──────▼──────┐  ┌────────▼─────────┐ │
│  │ LLMClient│  │ Agent Loop  │  │ SQLite           │ │
│  │ (batch)  │  │ (race UI)   │  │ (benchmark.db)   │ │
│  └────┬─────┘  └─────────────┘  └──────────────────┘ │
└───────┼─────────────────────────────────────────────┘
        │
┌───────▼─────────────────────────────────────────────┐
│  LLM Providers (tool calling)                        │
│  OpenAI · Anthropic · Google Gemini                  │
└─────────────────────────────────────────────────────┘
```

**AgentClient** (`agent_client.py`) sends tool definitions with each turn and runs up to 5 observe→act steps: observation tools return game state; a terminal action tool ends the turn. **LLMClient** remains for batch-only games (Prisoner's Dilemma, Code Debug, 20 Questions). Move records store `tool_calls_count`, `tools_used`, and a tool trace in `extra_json` when benchmarking.

## API Reference

### Game Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/games/battleship/{id}` | WebSocket | Battleship game session |
| `/api/wordle/start` | POST | Start a Wordle game |
| `/api/wordle/guess/{id}` | POST | Submit an agent's guess |
| `/api/connections/start` | POST | Start a Connections game |
| `/api/connections/game/{id}/start-race` | POST | Launch async race mode |
| `/api/minesweeper/start` | POST | Start a Minesweeper race |
| `/api/minesweeper/{id}/step` | POST | Advance one agent's turn |
| `/api/auction/start` | POST | Start an Auction Blitz |
| `/api/auction/{id}/round` | POST | Play one auction round |
| `/api/poker/start` | POST | Start a Poker Showdown |
| `/api/poker/{id}/step` | POST | Advance one betting action |
| `/api/code-debug/start` | POST | Start a code debug session |
| `/api/code-debug/{id}/run` | POST | Run both agents on the challenge |

### Benchmark & Analytics Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/benchmark/leaderboard` | GET | Elo leaderboard (filterable by game scope) |
| `/api/benchmark/analytics/overview` | GET | Dashboard KPIs |
| `/api/benchmark/analytics/head-to-head` | GET | Pairwise matchup stats |
| `/api/benchmark/analytics/quality` | GET | Latency, cost, correctness by model |
| `/api/benchmark/analytics/trends` | GET | Runs per day + Elo over time |
| `/api/benchmark/runs` | GET | Run history |
| `/api/benchmark/runs/{id}` | GET | Run detail with per-move data |
| `/api/benchmark/runs/{id}` | DELETE | Delete run + rebuild Elo |
| `/api/benchmark/export/runs.csv` | GET | CSV export |
| `/api/benchmark/export/runs.json` | GET | JSON export |
| `/api/benchmark/batch/start` | POST | Start a batch benchmark job |
| `/api/benchmark/batch/status/{id}` | GET | Poll batch job progress |
| `/health` | GET | Health check |

## Running Tests

```bash
cd backend
python -m pytest tests/ -v
```

Tests cover game logic (Wordle, Battleship, Connections, Minesweeper, Auction, Poker), the Elo system, the benchmark recorder, and analytics queries. Tests use a temporary SQLite database and don't make LLM API calls.
