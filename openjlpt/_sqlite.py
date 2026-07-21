from __future__ import annotations

import os
import sqlite3
from typing import Any, List, Optional


def _data_root() -> str:
    """Locate the data directory (development root or bundled wheel)."""
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(here, "..", "data"),  # development / editable install
        os.path.join(here, "data"),         # wheel / bundled
    ]
    for candidate in candidates:
        if os.path.isdir(candidate):
            return candidate
    raise FileNotFoundError("OpenJLPT data directory not found")


_DB_PATH = os.path.join(_data_root(), "openjlpt.sqlite")


def db_path() -> str:
    """Return the absolute path to the bundled SQLite database."""
    return os.path.abspath(_DB_PATH)


def connect() -> sqlite3.Connection:
    """Open a connection to the bundled SQLite database."""
    return sqlite3.connect(db_path())


def query(sql: str, params: Optional[tuple[Any, ...]] = None) -> List[tuple[Any, ...]]:
    """Run a read-only query and return all rows."""
    with connect() as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(sql, params or ()).fetchall()
