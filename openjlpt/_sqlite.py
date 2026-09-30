from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from ._data import data_root


def db_path() -> str:
    """Return the absolute path to the bundled SQLite database."""
    return os.path.join(data_root(), "openjlpt.sqlite")


def connect() -> sqlite3.Connection:
    """Open a read-only connection to the bundled SQLite database.

    Rows are :class:`sqlite3.Row`, so columns can be read by name. Array columns
    (``meanings``, ``pos``, ``examples``, …) hold JSON text. The ``vocab_fts``
    table is an FTS5 full-text index over word, reading, romaji and meanings.
    """
    # as_uri() percent-encodes the path, so spaces, "#" or "?" in it are safe (and Windows paths work).
    uri = Path(db_path()).resolve().as_uri() + "?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def query(sql: str, params: Optional[Sequence[Any]] = None) -> List[Dict[str, Any]]:
    """Run a read-only query against the bundled database; returns one dict per row.

    >>> query("SELECT word, reading FROM vocab WHERE word = ?", ["食べる"])
    [{'word': '食べる', 'reading': 'たべる'}]

    Use :func:`connect` for cursors, streaming or ``sqlite3.Row`` access.
    """
    conn = connect()
    try:
        return [dict(row) for row in conn.execute(sql, tuple(params or ()))]
    finally:
        conn.close()
