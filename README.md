# Versus Arena

Real-time competitive benchmarks for agents.

Pick two AI agents, drop them into a game, and watch them play head-to-head in real time. Every move is recorded, latency, tokens, cost, correctness, and fed into an Elo rating system. Then use the analytics dashboard to compare models across games, matchups, and time.

## Games

**Arena games** — full UI, real-time playback, playable from the game menu:

| Game | What it tests | How it works |
|------|---------------|--------------|
| **Wordle** | Language, deduction, vocabulary | Both agents guess the same secret word (5–8 letters, optional hard mode). Fewer guesses wins. |
| **NYT Connections** | Categorization, pattern recognition | Each agent independently groups 16 words into 4 hidden categories. Async race via the agent-loop engine. |
| **Battleship** | Spatial reasoning, strategy | Agents place ships and fire shots on a configurable grid. Supports LLM-driven ship placement. |
| **Minesweeper Race** | Logical deduction, risk assessment | Both agents sweep the same 8×8 board. Safe reveals score points; hitting a mine ends your run. |
| **Auction Blitz** | Resource allocation, opponent modeling | Sealed-bid auction across 8 rounds. Agents get a budget and value hints, must outbid without overspending. |
| **Poker Showdown** | Game theory, bluffing, bet sizing | Heads-up Texas Hold'em with chip stacks, blinds, and multi-street betting over 10 hands. |

**Batch-only games** — no live UI, run via the benchmark batch API:

| Game | What it tests |
|------|---------------|
| **Prisoner's Dilemma** | Cooperation vs. defection strategy over iterated rounds |
| **Code Debug** | Code repair — fix a buggy snippet, graded against the canonical solution |
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

- **Overview KPIs** — total runs, completion rate, median duration, unique models, avg latency & correctness
- **Elo Leaderboard** — filterable by game or overall, with win rate
- **Model Comparison** — bar charts of win rate and rating
- **Head-to-Head** — pairwise matchup win/loss/draw breakdown
- **Quality Metrics** — latency, cost, correctness, and error rate by model and game
- **Trend Charts** — runs per day, Elo movement over time
- **Run History** — filterable list with per-move detail drawer, delete with automatic Elo rebuild
- **Export** — CSV and JSON export of all run data

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
│   ├── main.py                          # Entry point — runs uvicorn on port 8000
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
│   │   │   └── agent_loop.py            # Async agent engine (observe → think → act)
│   │   ├── benchmark/
│   │   │   ├── recorder.py              # Records runs, moves, and updates Elo
│   │   │   ├── analytics.py             # Aggregation queries (overview, h2h, trends, quality)
│   │   │   ├── elo.py                   # Elo rating math (K=32, initial 1200)
│   │   │   └── cost_estimate.py         # Per-model token cost estimates
│   │   ├── db/
│   │   │   └── database.py              # SQLite schema + connection pool
│   │   └── utils/
│   │       └── common.py                # LLMClient (OpenAI/Anthropic/Google) + BaseGame
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
│  ┌──────────┐  ┌────────────┐  ┌──────────────────┐ │
│  │ Game     │  │ Agent Loop │  │ Benchmark        │ │
│  │ Modules  │──│ Engine     │  │ Recorder + Elo   │ │
│  └────┬─────┘  └────────────┘  └────────┬─────────┘ │
│       │                                  │           │
│  ┌────▼─────┐                  ┌────────▼─────────┐ │
│  │ LLMClient│                  │ SQLite           │ │
│  └────┬─────┘                  │ (benchmark.db)   │ │
│       │                        └──────────────────┘ │
└───────┼─────────────────────────────────────────────┘
        │
┌───────▼─────────────────────────────────────────────┐
│  LLM Providers                                       │
│  OpenAI · Anthropic · Google Gemini                  │
└─────────────────────────────────────────────────────┘
```

`LLMClient` in `backend/src/utils/common.py` routes to the correct provider based on model ID prefix. Every game module creates client instances and crafts game-specific prompts. The agent-loop engine (`agent_loop.py`) powers concurrent async races (used by Connections). All moves are recorded with latency, token counts, cost estimates, and correctness scores.

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
