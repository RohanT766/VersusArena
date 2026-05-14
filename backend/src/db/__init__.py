"""SQLite persistence for benchmark runs."""

from src.db.database import get_connection, init_db

__all__ = ["get_connection", "init_db"]
