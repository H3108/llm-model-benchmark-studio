from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, JSON, Integer, String, Text, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from ..db import Base
from .tasks import DEFAULT_TASKS, DefaultTask


class CapabilityTask(Base):
    __tablename__ = "capability_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_key: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    capability: Mapped[str] = mapped_column(String(80), index=True)
    name: Mapped[str] = mapped_column(String(255))
    prompt: Mapped[str] = mapped_column(Text)
    expected_format: Mapped[str] = mapped_column(String(80))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    version: Mapped[str] = mapped_column(String(30), default="v1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class CapabilityBenchmark(Base):
    __tablename__ = "capability_benchmarks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    model_id: Mapped[str] = mapped_column(String(255), index=True)
    provider: Mapped[str] = mapped_column(String(50), index=True)
    task_key: Mapped[str] = mapped_column(String(120), index=True)
    task_version: Mapped[str] = mapped_column(String(30))
    capability: Mapped[str] = mapped_column(String(80), index=True)
    status: Mapped[str] = mapped_column(String(20), index=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    first_token_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    tokens_generated: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_per_second: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    evaluation_details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    tested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


def seed_default_tasks(db: Session, tasks: tuple[DefaultTask, ...] = DEFAULT_TASKS) -> list[CapabilityTask]:
    """Idempotently insert/update built-in task definitions by task_key."""
    rows: list[CapabilityTask] = []
    for task in tasks:
        row = db.scalar(select(CapabilityTask).where(CapabilityTask.task_key == task.task_key))
        values = {
            "capability": task.capability,
            "name": task.name,
            "prompt": task.prompt,
            "expected_format": task.expected_format,
            "version": task.version,
            "enabled": True,
            "updated_at": datetime.now(timezone.utc),
        }
        if row is None:
            row = CapabilityTask(task_key=task.task_key, **values)
            db.add(row)
        else:
            for key, value in values.items():
                setattr(row, key, value)
        rows.append(row)
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


def list_tasks(db: Session, enabled_only: bool = True) -> list[CapabilityTask]:
    statement = select(CapabilityTask).order_by(CapabilityTask.capability, CapabilityTask.task_key)
    if enabled_only:
        statement = statement.where(CapabilityTask.enabled.is_(True))
    return list(db.scalars(statement))
