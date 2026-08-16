#!/usr/bin/env python3
"""Restore a SQLite database from a backup file."""

from __future__ import annotations

import argparse
from pathlib import Path
import sqlite3

from backup_db import database_path


def restore_database(source: Path, destination: Path) -> None:
    source = source.resolve()
    destination = destination.resolve()
    if not source.exists():
        raise FileNotFoundError(f"Backup does not exist: {source}")
    if source == destination:
        raise ValueError("Restore source and destination must differ")
    destination.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(source) as source_connection, sqlite3.connect(destination) as destination_connection:
        source_connection.backup(destination_connection)
        result = destination_connection.execute("PRAGMA integrity_check").fetchone()
        if not result or result[0] != "ok":
            raise RuntimeError(f"Restored database integrity check failed: {result}")
        destination_connection.commit()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup", type=Path, required=True, help="SQLite backup path")
    parser.add_argument("--database", type=Path, default=None, help="Restore destination path")
    args = parser.parse_args()

    destination = (args.database or database_path()).resolve()
    restore_database(args.backup, destination)
    print(f"Database restored: {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
