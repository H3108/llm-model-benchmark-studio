from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


def _connect_args(url: str) -> dict:
    return {"check_same_thread": False} if url.startswith("sqlite") else {}


engine = create_engine(get_settings().database_url, connect_args=_connect_args(get_settings().database_url))
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db() -> None:
    from . import models  # noqa: F401
    from . import registry  # noqa: F401
    from .capabilities import registry as capability_registry  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _migrate_v15_columns()
    _migrate_model_registry_columns()
    _migrate_audit_logs_table()
    _enforce_explicit_free_catalog()
    seed_session = SessionLocal()
    try:
        capability_registry.seed_default_tasks(seed_session)
    finally:
        seed_session.close()


def _migrate_v15_columns() -> None:
    inspector = inspect(engine)
    table = "model_benchmarks"
    if table not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns(table)}
    with engine.begin() as connection:
        if "run_id" not in existing:
            connection.execute(text("ALTER TABLE model_benchmarks ADD COLUMN run_id VARCHAR(36)"))
        if "streaming_status" not in existing:
            connection.execute(text("ALTER TABLE model_benchmarks ADD COLUMN streaming_status VARCHAR(20)"))


def _migrate_model_registry_columns() -> None:
    """Add Phase 5.4.1 catalog columns to existing SQLite databases.

    SQLAlchemy create_all does not alter an already existing table. Keep this
    migration additive and scoped to model_registry so benchmark history is
    untouched. New columns remain nullable for compatibility with old rows.
    """
    inspector = inspect(engine)
    table = "model_registry"
    if table not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns(table)}
    additions = {
        "family": "VARCHAR(120)",
        "organization": "VARCHAR(120)",
        "is_free": "BOOLEAN",
        "catalog_status": "VARCHAR(20)",
        "access_status": "VARCHAR(20)",
        "model_type": "VARCHAR(30)",
        "tags": "JSON",
        "source": "VARCHAR(40)",
        "source_updated_at": "DATETIME",
        "last_access_checked_at": "DATETIME",
        "metadata_override": "JSON",
        "raw_metadata": "JSON",
        "excluded_reason": "VARCHAR(500)",
    }
    with engine.begin() as connection:
        for name, definition in additions.items():
            if name not in existing:
                connection.execute(text(f"ALTER TABLE model_registry ADD COLUMN {name} {definition}"))
        connection.execute(text("UPDATE model_registry SET catalog_status = 'unknown' WHERE catalog_status IS NULL"))
        connection.execute(text("UPDATE model_registry SET access_status = 'unknown' WHERE access_status IS NULL"))
        connection.execute(text("UPDATE model_registry SET source = 'openrouter' WHERE source IS NULL"))


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _migrate_audit_logs_table() -> None:
    """Create the audit_logs table on existing databases."""
    inspector = inspect(engine)
    if "audit_logs" in inspector.get_table_names():
        return
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE TABLE audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    action VARCHAR(120) NOT NULL,
                    detail VARCHAR(500),
                    created_at DATETIME NOT NULL
                )
                """
            )
        )
        connection.execute(text("CREATE INDEX ix_audit_logs_action ON audit_logs (action)"))
        connection.execute(text("CREATE INDEX ix_audit_logs_created_at ON audit_logs (created_at)"))


def _enforce_explicit_free_catalog() -> None:
    """Quarantine legacy OpenRouter rows without an explicit free label.

    Older versions inferred free access from zero pricing. That is unsafe for
    OpenRouter because pricing metadata can change or be incomplete. Enforce
    the same suffix/route allowlist at startup so an existing database cannot
    keep exposing or executing a previously inferred model.
    """
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                UPDATE model_registry
                SET is_free = 0,
                    catalog_status = 'excluded',
                    excluded_reason = '仅保留明确标记为免费的模型'
                WHERE provider = 'openrouter'
                  AND model_id <> 'openrouter/free'
                  AND substr(model_id, -5) <> char(58) || 'free'
                  AND catalog_status <> 'excluded'
                """
            )
        )
