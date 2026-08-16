from datetime import datetime

from pydantic import BaseModel, Field


class BenchmarkRunRequest(BaseModel):
    models: list[str] = Field(min_length=1)


class BenchmarkResult(BaseModel):
    id: int
    run_id: str | None = None
    provider: str
    model_id: str
    status: str
    latency_ms: float | None = None
    first_token_ms: float | None = None
    tokens_generated: int | None = None
    tokens_per_second: float | None = None
    streaming_supported: bool | None = None
    streaming_status: str | None = None
    tested_at: datetime
    error_message: str | None = None

    model_config = {"from_attributes": True}


class ScoreResult(BaseModel):
    model_id: str
    provider: str
    availability_score: float
    speed_score: float
    latency_score: float
    context_score: float
    overall_score: float
    operational_score: float = 0.0
    capability_score: float = 0.0
    capabilities: dict[str, float] = Field(default_factory=dict)
    tests: int
    success_rate: float
    avg_first_token_ms: float | None = None
    avg_latency_ms: float | None = None
    avg_tokens_per_second: float | None = None


class LeaderboardResponse(BaseModel):
    profile: str = "default"
    weights: dict[str, float] = Field(default_factory=dict)
    fastest_model: ScoreResult | None = None
    most_stable_model: ScoreResult | None = None
    highest_score_model: ScoreResult | None = None
    rankings: list[ScoreResult]


class RecommendationResponse(BaseModel):
    task: str
    profile: str = "default"
    weights: dict[str, float] = Field(default_factory=dict)
    model: ScoreResult | None = None
    reason: str
    recommendation_reason: dict[str, object] = Field(default_factory=dict)


class IntelligenceResponse(BaseModel):
    model_id: str
    profile: str
    operational_score: float
    capability_score: float
    overall_score: float
    capabilities: dict[str, float] = Field(default_factory=dict)
    benchmark_statistics: dict[str, object] = Field(default_factory=dict)


class CapabilityLeaderboardEntry(BaseModel):
    rank: int
    model_id: str
    capability: str
    score: float
    tests: int
    successful_tests: int


class CapabilityLeaderboardResponse(BaseModel):
    capability: str
    rankings: list[CapabilityLeaderboardEntry]


class BenchmarkRunResult(BaseModel):
    id: int
    run_id: str
    created_at: datetime
    total_models: int
    success_count: int
    duration: float | None = None

    model_config = {"from_attributes": True}


class ModelRegistryResult(BaseModel):
    id: int
    provider: str
    model_id: str
    model_name: str | None = None
    context_length: int | None = None
    pricing_input: float | None = None
    pricing_output: float | None = None
    capabilities: dict | None = None
    family: str | None = None
    organization: str | None = None
    is_free: bool | None = None
    catalog_status: str | None = None
    access_status: str | None = None
    model_type: str | None = None
    tags: list | None = None
    source: str | None = None
    source_updated_at: datetime | None = None
    last_access_checked_at: datetime | None = None
    excluded_reason: str | None = None
    updated_at: datetime

    model_config = {"from_attributes": True}


class ModelSyncRunResult(BaseModel):
    id: int
    sync_run_id: str
    provider: str
    started_at: datetime
    completed_at: datetime | None = None
    status: str
    received_count: int
    inserted_count: int
    updated_count: int
    inactive_count: int
    error_message: str | None = None

    model_config = {"from_attributes": True}


class CapabilityBenchmarkRequest(BaseModel):
    models: list[str] = Field(min_length=1)
    tasks: list[str] = Field(min_length=1)


class AuditLogEntry(BaseModel):
    id: int
    action: str
    detail: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogCreate(BaseModel):
    action: str = Field(min_length=1, max_length=120)
    detail: str | None = Field(default=None, max_length=500)


class CapabilityTaskResult(BaseModel):
    id: int
    run_id: str | None = None
    model_id: str
    provider: str
    task_key: str
    task_version: str
    capability: str
    status: str
    score: float | None = None
    latency_ms: float | None = None
    first_token_ms: float | None = None
    tokens_generated: int | None = None
    tokens_per_second: float | None = None
    raw_output: str | None = None
    evaluation_details: dict | None = None
    error_message: str | None = None
    tested_at: datetime

    model_config = {"from_attributes": True}


class CapabilityBenchmarkResponse(BaseModel):
    run_id: str
    results: list[CapabilityTaskResult]


class CapabilityTaskResultDefinition(BaseModel):
    id: int
    task_key: str
    capability: str
    name: str
    prompt: str
    expected_format: str
    enabled: bool
    version: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
