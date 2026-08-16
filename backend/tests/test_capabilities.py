from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.capabilities.registry import CapabilityTask, list_tasks, seed_default_tasks
from app.db import Base


def test_default_capability_tasks_are_seeded_idempotently():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    first = seed_default_tasks(session)
    second = seed_default_tasks(session)
    assert len(first) == 6
    assert len(second) == 6
    assert session.scalar(select(CapabilityTask).where(CapabilityTask.task_key == "coding_basic_v1"))
    assert {task.task_key for task in list_tasks(session)} == {
        "coding_basic_v1", "structured_output_basic_v1", "instruction_following_basic_v1",
        "reasoning_basic_v1", "tool_calling_basic_v1", "long_context_basic_v1",
    }
