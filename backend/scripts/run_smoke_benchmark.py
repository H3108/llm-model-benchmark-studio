#!/usr/bin/env python3
"""Run the first three-model Benchmark smoke batch through the public API."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import sys
from typing import Any

import httpx
from dotenv import dotenv_values
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session


SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
PROJECT_DIR = BACKEND_DIR.parent
REPORT_PATH = PROJECT_DIR / "docs" / "44_First_Smoke_Benchmark_Report.md"
DEFAULT_API_URL = "http://localhost:8000"
DEFAULT_TASK = "coding_basic_v1"
ACCESSIBLE_STATUSES = {"available", "active", "ok", "success", "reachable"}

sys.path.insert(0, str(BACKEND_DIR))

from app.models import ModelBenchmark  # noqa: E402
from app.registry import ModelRegistry  # noqa: E402


def load_settings() -> tuple[str, str, str]:
    """Load only the values needed by this development tool."""
    values = dotenv_values(BACKEND_DIR / ".env")
    database_url = os.getenv("DATABASE_URL") or values.get("DATABASE_URL") or "sqlite:///./benchmark.db"
    admin_token = os.getenv("ADMIN_TOKEN") or values.get("ADMIN_TOKEN") or ""
    api_url = os.getenv("BENCHMARK_API_URL") or DEFAULT_API_URL
    return str(database_url), str(admin_token), api_url.rstrip("/")


def database_engine(database_url: str):
    if database_url.startswith("sqlite:///./"):
        database_url = f"sqlite:///{(BACKEND_DIR / database_url.removeprefix('sqlite:///./')).resolve()}"
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    return create_engine(database_url, connect_args=connect_args)


def _priority(row: ModelRegistry) -> tuple[int, int, int, int, str]:
    is_free = 1 if row.is_free is True or row.model_id.endswith(":free") else 0
    is_active = 1 if row.catalog_status == "active" else 0
    is_accessible = 1 if (row.access_status or "").lower() in ACCESSIBLE_STATUSES else 0
    has_access_metadata = 1 if row.access_status not in (None, "", "unknown") else 0
    return (-is_free, -is_active, -is_accessible, -has_access_metadata, row.model_id)


def select_models(db: Session, count: int = 3) -> list[ModelRegistry]:
    rows = list(
        db.scalars(
            select(ModelRegistry).where(
                ModelRegistry.catalog_status.not_in(("inactive", "excluded"))
            )
        )
    )
    if len(rows) < count:
        rows = list(db.scalars(select(ModelRegistry).where(ModelRegistry.catalog_status != "excluded")))
    return sorted(rows, key=_priority)[:count]


def format_metric(value: Any, suffix: str = "") -> str:
    if value is None:
        return "-"
    if isinstance(value, float):
        return f"{value:.2f}{suffix}"
    return f"{value}{suffix}"


def run_request(
    client: httpx.Client,
    api_url: str,
    admin_token: str,
    model_ids: list[str],
) -> tuple[int | None, Any]:
    headers = {"X-Admin-Token": admin_token} if admin_token else {}
    response = client.post(
        f"{api_url}/api/benchmark/run",
        json={"models": model_ids},
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
    task: str,
    selected: list[ModelRegistry],
    status_code: int | None,
    payload: Any,
    before_count: int | None,
    after_count: int | None,
) -> str:
    results = payload if isinstance(payload, list) else []
    success_count = sum(item.get("status") == "success" for item in results if isinstance(item, dict))
    failed_count = sum(item.get("status") == "failed" for item in results if isinstance(item, dict))
    if status_code == 200 and len(results) == len(selected):
        outcome = "SUCCESS" if failed_count == 0 else "PARTIAL"
    else:
        outcome = "BLOCKED"

    lines = [
        "# First Smoke Benchmark Report",
        "",
        f"- 执行时间（开始）: {started_at.isoformat()}",
        f"- 执行时间（结束）: {finished_at.isoformat()}",
        f"- Benchmark 任务标签: `{task}`（当前 Operational Benchmark API 不接收 task 字段）",
        f"- 执行状态: **{outcome}**",
        f"- HTTP 状态: `{status_code if status_code is not None else '未连接'}`",
        "",
        "## 模型选择",
        "",
        "| Model | Provider | Free | Catalog status | Access status |",
        "|---|---|---:|---|---|",
    ]
    for row in selected:
        lines.append(
            f"| `{row.model_id}` | {row.provider} | "
            f"{'是' if row.is_free else '否/未知'} | "
            f"{row.catalog_status or '-'} | {row.access_status or '-'} |"
        )
    if not selected:
        lines.append("| 无 | - | - | - | - |")

    lines.extend(
        [
            "",
            "## 执行结果",
            "",
            "| Model | Status | Latency | TTFT | Tokens/s | Error |",
            "|---|---|---:|---:|---:|---|",
        ]
    )
    if results:
        for item in results:
            lines.append(
                f"| `{item.get('model_id', '-')}` | {item.get('status', '-')} | "
                f"{format_metric(item.get('latency_ms'), ' ms')} | "
                f"{format_metric(item.get('first_token_ms'), ' ms')} | "
                f"{format_metric(item.get('tokens_per_second'))} | "
                f"{item.get('error_message') or '-'} |"
            )
    else:
        lines.append("| 无 API 结果 | - | - | - | - | 请求未成功或未执行 |")

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
    if status_code != 200 and isinstance(payload, dict):
        failure_reasons.append(payload.get("message") or payload.get("detail") or str(payload))

    lines.extend(
        [
            "",
            "## 汇总",
            "",
            f"- 选择模型数: `{len(selected)}`",
            f"- API 返回结果数: `{len(results)}`",
            f"- 成功数: `{success_count}`",
            f"- 失败数: `{failed_count}`",
            f"- 成功率: `{(success_count / len(results) * 100):.1f}%`" if results else "- 成功率: `未执行`",
            f"- 数据库 Benchmark 新增数量: `{database_delta}`",
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
            "- 本工具只调用 `POST /api/benchmark/run`，不直接写入 Benchmark 数据库。",
            "- 失败模型不会被删除，历史数据不会被修改。",
            "- 报告中的结果来自本次 API 返回；未执行或无法连接时明确标记为 BLOCKED。",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=3, help="Number of models in the smoke batch")
    parser.add_argument("--task", default=DEFAULT_TASK, help="Task label recorded in the report")
    parser.add_argument("--api-url", default=None, help="Backend URL, defaults to BENCHMARK_API_URL or localhost")
    args = parser.parse_args()
    if args.count < 1:
        parser.error("--count must be at least 1")

    started_at = datetime.now(timezone.utc)
    database_url, admin_token, configured_api_url = load_settings()
    api_url = (args.api_url or configured_api_url).rstrip("/")
    selected: list[ModelRegistry] = []
    status_code: int | None = None
    payload: Any = {"message": "Smoke runner did not start"}
    before_count: int | None = None
    after_count: int | None = None
    engine = None

    try:
        engine = database_engine(database_url)
        with Session(engine) as db:
            selected = select_models(db, args.count)
            before_count = db.scalar(select(func.count()).select_from(ModelBenchmark)) or 0
            model_ids = [row.model_id for row in selected]

        if len(selected) < args.count:
            payload = {"message": f"Only {len(selected)} eligible models found; need {args.count}"}
        elif not admin_token:
            payload = {"message": "ADMIN_TOKEN is not configured"}
        else:
            with httpx.Client(timeout=120.0) as client:
                status_code, payload = run_request(client, api_url, admin_token, model_ids)

        with Session(engine) as db:
            after_count = db.scalar(select(func.count()).select_from(ModelBenchmark)) or 0
    except Exception as exc:
        payload = {"message": f"Smoke runner failed: {type(exc).__name__}"}

    if engine is not None:
        try:
            with Session(engine) as db:
                after_count = db.scalar(select(func.count()).select_from(ModelBenchmark)) or 0
        except Exception:
            after_count = None

    finished_at = datetime.now(timezone.utc)
    report = make_report(
        started_at=started_at,
        finished_at=finished_at,
        task=args.task,
        selected=selected,
        status_code=status_code,
        payload=payload,
        before_count=before_count,
        after_count=after_count,
    )
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(report, encoding="utf-8")

    results = payload if isinstance(payload, list) else []
    print(f"Smoke Benchmark: {len(results)} result(s), report: {REPORT_PATH}")
    print("Model\tStatus\tLatency\tTTFT\tTokens/s\tError")
    for item in results:
        print(
            f"{item.get('model_id', '-')}\t{item.get('status', '-')}\t"
            f"{format_metric(item.get('latency_ms'), ' ms')}\t"
            f"{format_metric(item.get('first_token_ms'), ' ms')}\t"
            f"{format_metric(item.get('tokens_per_second'))}\t"
            f"{item.get('error_message') or '-'}"
        )
    return 0 if status_code == 200 and len(results) == len(selected) else 1


if __name__ == "__main__":
    raise SystemExit(main())
