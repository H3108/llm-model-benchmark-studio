#!/usr/bin/env python3
"""Create a consistent SQLite backup for the local benchmark database."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
import shutil
import sqlite3

from dotenv import dotenv_values


SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent


def database_path() -> Path:
    values = dotenv_values(BACKEND_DIR / ".env")
    url = str(values.get("DATABASE_URL") or "sqlite:///./benchmark.db")
    if not url.startswith("sqlite:///"):
        raise SystemExit("Only SQLite DATABASE_URL values are supported")
    relative = url.removeprefix("sqlite:///./")
    return (BACKEND_DIR / relative).resolve()


def backup_database(source: Path, destination: Path) -> None:
    source = source.resolve()
    destination = destination.resolve()
    if not source.exists():
        raise FileNotFoundError(f"Database does not exist: {source}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination == source:
        raise ValueError("Backup destination must differ from the database")

    with sqlite3.connect(source) as source_connection, sqlite3.connect(destination) as destination_connection:
        source_connection.backup(destination_connection)
        destination_connection.execute("PRAGMA integrity_check")
        destination_connection.commit()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=None, help="SQLite database path")
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Backup path; defaults to backend/backups/benchmark-<UTC timestamp>.sqlite3",
    )
    args = parser.parse_args()

    source = (args.database or database_path()).resolve()
    output = (
        args.output
        or BACKEND_DIR / "backups" / f"benchmark-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.sqlite3"
    ).resolve()
    backup_database(source, output)
    print(f"Backup created: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
