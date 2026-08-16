"""Security helpers for administrative API endpoints."""

import hmac

from fastapi import Request
from fastapi.responses import JSONResponse

from .config import get_settings

PROTECTED_PATHS = {
    "/api/benchmark/run",
    "/api/capabilities/benchmark",
    "/api/models/sync",
}


def admin_auth_response(request: Request) -> JSONResponse | None:
    if request.method not in {"POST", "GET"} or request.url.path not in PROTECTED_PATHS:
        return None
    configured = get_settings().admin_token
    supplied = request.headers.get("X-Admin-Token", "").strip()
    if not configured:
        return JSONResponse(status_code=503, content={"error": "service_unavailable", "message": "Administrative API is not configured"})
    if not supplied:
        return JSONResponse(
            status_code=401,
            content={"error": "unauthorized", "message": "Administrative authorization required"},
        )
    if not hmac.compare_digest(supplied, configured):
        return JSONResponse(status_code=403, content={"error": "forbidden", "message": "Administrative token is invalid"})
    return None


def sanitize_provider_error(_exc: Exception | str | None) -> str:
    return "请求失败，请稍后重试"
