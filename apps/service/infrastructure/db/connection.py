from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Iterator

from dotenv import load_dotenv

load_dotenv()


def _host() -> str | None:
    return os.getenv("PG_HOST")


def connect() -> Any:
    import psycopg
    from psycopg.rows import dict_row

    return psycopg.connect(
        host=_host(),
        port=int(os.getenv("PG_PORT", "5432")),
        user=os.getenv("PG_USER"),
        password=os.getenv("PG_PASSWORD"),
        dbname=os.getenv("PG_DATABASE"),
        autocommit=False,
        row_factory=dict_row,
        options="-c search_path=shigachat,public",
    )


@contextmanager
def cursor() -> Iterator[tuple[Any, Any]]:
    conn = connect()
    cur = conn.cursor()
    try:
        yield cur, conn
    finally:
        cur.close()
        conn.close()
