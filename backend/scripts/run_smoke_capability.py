#!/usr/bin/env python3
"""Run a three-model Capability Benchmark smoke batch through the public API."""

from __future__ import annotations

from datetime import datetime, timezone
import sys
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session


SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
PROJECT_DIR = BACKEND_DIR.parent
REPORT_PATH = PROJECT_DIR / "docs" / "45_First_Capability_Smoke_Report.md"
DEFAULT_API_URL = "http://localhost:8000"
REQUIRED_TASKS = (
    "coding_basic_v1",
    "structured_output_basic_v1",
    "instruction_following_basic_v1",
)

sys.path.insert(0, str(BACKEND_DIR))

from app.capabilities.registry import CapabilityBenchmark  # noqa: E402
from app.models import ModelBenchmark  # noqa: E402
from app.registry import ModelRegistry  # noqa: E402
from scripts.run_smoke_benchmark import database_engine, format_metric, load_settings  # noqa: E402


def successful_models(db: Session, count: int = 3) -> list[str]:
    """Return the latest distinct models with a successful Operational run."""
    rows = db.scalars(
        select(ModelBenchmark)
        .where(ModelBenchmark.status == "success")
        .order_by(ModelBenchmark.tested_at.desc())
    )
    model_ids: list[str] = []
    seen: set[str] = set()
    for row in rows:
        if row.model_id not in seen:
            seen.add(row.model_id)
            model_ids.append(row.model_id)
        if len(model_ids) == count:
            break
    return model_ids


def fetch_tasks(client: httpx.Client, api_url: str) -> tuple[int | None, Any]:
    response = client.get(f"{api_url}/api/capabilities/tasks")
    try:
        payload = response.json()
    except ValueError:
        payload = {"raw_response": response.text[:500]}
    return response.status_code, payload


def run_request(
    client: httpx.Client,
    api_url: str,
    admin_token: str,
    model_ids: list[str],
    task_keys: list[str],
) -> tuple[int | None, Any]:
    headers = {"X-Admin-Token": admin_token} if admin_token else {}
    response = client.post(
        f"{api_url}/api/capabilities/benchmark",
        json={"models": model_ids, "tasks": task_keys},
        headers=headers,
    )
    try:
        payload = response.json()
    except ValueError:
        payload = {"raw_response": response.text[:500]}
    return response.status_code, payload


def make_report(
    *,
    started_at: datetime,
    finished_at: datetime,
    selected_models: list[str],
    requested_tasks: list[str],
    available_tasks: list[str],
    task_status_code: int | None,
    run_status_code: int | None,
    payload: Any,
    before_count: int | None,
    after_count: int | None,
) -> str:
    results = payload.get("results", []) if isinstance(payload, dict) else []
    results = results if isinstance(results, list) else []
    success_count = sum(item.get("status") == "success" for item in results if isinstance(item, dict))
    failed_count = sum(item.get("status") == "failed" for item in results if isinstance(item, dict))
    expected_count = len(selected_models) * len(requested_tasks)
    if run_status_code == 200 and len(results) == expected_count:
        outcome = "SUCCESS" if failed_count == 0 else "PARTIAL"
    else:
        outcome = "BLOCKED"

    lines = [
        "# First Capability Smoke Benchmark Report",
        "",
        f"- 执行时间（开始）: {started_at.isoformat()}",
        f"- 执行时间（结束）: {finished_at.isoformat()}",
        f"- 执行状态: **{outcome}**",
        f"- Task API HTTP 状态: `{task_status_code if task_status_code is not None else '未连接'}`",
        f"- Capability API HTTP 状态: `{run_status_code if run_status_code is not None else '未执行'}`",
        "",
        "## 模型",
        "",
        "| Model | 来源 |",
        "|---|---|",
    ]
    if selected_models:
        lines.extend(f"| `{model_id}` | Operational Benchmark 成功记录 |" for model_id in selected_models)
    else:
        lines.append("| 无 | 没有成功 Operational Benchmark 模型 |")

    lines.extend(
        [
            "",
            "## Task",
            "",
            f"- 请求任务: {', '.join(f'`{task}`' for task in requested_tasks)}",
            f"- API 返回的启用任务: {', '.join(f'`{task}`' for task in available_tasks) or '无'}",
            "",
            "## 执行结果",
            "",
            "| Model | Task | Capability | Score | Latency | Status |",
            "|---|---|---|---:|---:|---|",
        ]
    )
    if results:
        for item in results:
            lines.append(
                f"| `{item.get('model_id', '-')}` | `{item.get('task_key', '-')}` | "
                f"{item.get('capability', '-')} | {format_metric(item.get('score'))} | "
                f"{format_metric(item.get('latency_ms'), ' ms')} | {item.get('status', '-')} |"
            )
    else:
        lines.append("| 无 API 结果 | - | - | - | - | 未执行 |")

    database_delta = (
        str(after_count - before_count)
        if before_count is not None and after_count is not None
        else "未验证"
    )
    failure_reasons = [
        item.get("error_message")
        for item in results
        if isinstance(item, dict) and item.get("error_message")
    ]
    if run_status_code != 200 and isinstance(payload, dict):
        failure_reasons.append(payload.get("message") or payload.get("detail") or str(payload))

    lines.extend(
        [
            "",
            "## 汇总",
            "",
            f"- 模型数量: `{len(selected_models)}`",
            f"- Task 数量: `{len(requested_tasks)}`",
            f"- 预期结果数: `{expected_count}`",
            f"- API 返回结果数: `{len(results)}`",
            f"- 成功数: `{success_count}`",
            f"- 失败数: `{failed_count}`",
            f"- 成功率: `{(success_count / len(results) * 100):.1f}%`" if results else "- 成功率: `未执行`",
            f"- 数据库 Capability Benchmark 新增数量: `{database_delta}`",
            "",
            "## 失败原因",
            "",
        ]
    )
    if failure_reasons:
        lines.extend(f"- {reason}" for reason in sorted(set(str(item) for item in failure_reasons)))
    elif outcome == "SUCCESS":
        lines.append("- 无")
    else:
        lines.append("- 未获得可验证的 API 结果")

    lines.extend(
        [
            "",
            "## 数据完整性声明",
            "",
            "- 本工具只调用 `GET /api/capabilities/tasks` 和 `POST /api/capabilities/benchmark`。",
            "- 本工具不直接写入 Capability 数据库。",
            "- 失败模型和历史数据未被删除或修改。",
            "- 报告中的结果来自本次 API 返回；未执行或无法连接时明确标记为 BLOCKED。",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> int:
    started_at = datetime.now(timezone.utc)
    database_url, admin_token, api_url = load_settings()
    selected_models: list[str] = []
    requested_tasks = list(REQUIRED_TASKS)
    available_tasks: list[str] = []
    task_status_code: int | None = None
    run_status_code: int | None = None
    payload: Any = {"message": "Capability smoke runner did not start"}
    before_count: int | None = None
    after_count: int | None = None
    engine = None

    try:
        engine = database_engine(database_url)
        with Session(engine) as db:
            selected_models = successful_models(db, 3)
            before_count = db.scalar(select(func.count()).select_from(CapabilityBenchmark)) or 0

        with httpx.Client(timeout=180.0) as client:
            task_status_code, task_payload = fetch_tasks(client, api_url)
            if isinstance(task_payload, list):
                available_tasks = [
                    item.get("task_key")
                    for item in task_payload
                    if isinstance(item, dict) and item.get("task_key")
                ]
            missing_tasks = [task for task in requested_tasks if task not in available_tasks]

            if not selected_models:
                payload = {"message": "No successful Operational Benchmark models found"}
            elif task_status_code != 200:
                payload = task_payload
            elif missing_tasks:
                payload = {"message": f"Required capability tasks unavailable: {', '.join(missing_tasks)}"}
            elif not admin_token:
                payload = {"message": "ADMIN_TOKEN is not configured"}
            else:
                run_status_code, payload = run_request(
                    client,
                    api_url,
                    admin_token,
                    selected_models,
                    requested_tasks,
                )

        with Session(engine) as db:
            after_count = db.scalar(select(func.count()).select_from(CapabilityBenchmark)) or 0
    except Exception as exc:
        payload = {"message": f"Capability smoke runner failed: {type(exc).__name__}"}

    if engine is not None:
        try:
            with Session(engine) as db:
                after_count = db.scalar(select(func.count()).select_from(CapabilityBenchmark)) or 0
        except Exception:
            after_count = None

    finished_at = datetime.now(timezone.utc)
    report = make_report(
        started_at=started_at,
        finished_at=finished_at,
        selected_models=selected_models,
        requested_tasks=requested_tasks,
        available_tasks=available_tasks,
        task_status_code=task_status_code,
        run_status_code=run_status_code,
        payload=payload,
        before_count=before_count,
        after_count=after_count,
    )
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(report, encoding="utf-8")

    results = payload.get("results", []) if isinstance(payload, dict) else []
    print(f"Capability Smoke Benchmark: {len(results)} result(s), report: {REPORT_PATH}")
    print("Model\tTask\tCapability\tScore\tLatency\tStatus")
    for item in results:
        print(
            f"{item.get('model_id', '-')}\t{item.get('task_key', '-')}\t"
            f"{item.get('capability', '-')}\t{format_metric(item.get('score'))}\t"
            f"{format_metric(item.get('latency_ms'), ' ms')}\t{item.get('status', '-')}"
        )
    return 0 if run_status_code == 200 and len(results) == len(selected_models) * len(requested_tasks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
