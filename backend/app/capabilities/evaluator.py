import json
import re
from typing import Any

from .registry import CapabilityTask


class CapabilityEvaluator:
    """Deterministic rule evaluator for the first capability scoring version."""

    def evaluate(self, task: CapabilityTask, output: str | None) -> dict[str, Any]:
        text = output or ""
        if task.task_key == "structured_output_basic_v1":
            return self._structured_output(text)
        if task.task_key == "instruction_following_basic_v1":
            return self._instruction_following(text)
        if task.task_key == "coding_basic_v1":
            return self._coding(text)
        if task.task_key == "reasoning_basic_v1":
            return self._reasoning(text)
        if task.task_key == "tool_calling_basic_v1":
            return self._tool_calling(text)
        if task.task_key == "long_context_basic_v1":
            return self._long_context(text)
        return {"score": 0.0, "details": {"checks": [{"name": "known_task", "passed": False, "message": "Unsupported capability task"}]}}

    @staticmethod
    def _result(checks: list[dict[str, Any]]) -> dict[str, Any]:
        score = round(sum(bool(check["passed"]) for check in checks) / len(checks) * 100, 2) if checks else 0.0
        return {"score": score, "details": {"checks": checks}}

    def _structured_output(self, output: str) -> dict[str, Any]:
        checks: list[dict[str, Any]] = []
        try:
            value = json.loads(output.strip())
            parsed = isinstance(value, dict)
        except (json.JSONDecodeError, TypeError):
            value = None
            parsed = False
        checks.append({"name": "json_parse", "passed": parsed, "message": "Output is valid JSON" if parsed else "Output is not valid JSON"})
        required = {"name", "status", "summary"}
        has_fields = parsed and set(value.keys()) == required
        checks.append({"name": "schema_fields", "passed": has_fields, "message": "Contains exactly name, status, summary" if has_fields else "Expected exactly name, status, summary"})
        types_ok = parsed and all(isinstance(value.get(key), str) for key in required)
        checks.append({"name": "field_types", "passed": types_ok, "message": "All fields are strings" if types_ok else "All required fields must be strings"})
        return self._result(checks)

    def _instruction_following(self, output: str) -> dict[str, Any]:
        lines = [line.strip() for line in output.strip().splitlines() if line.strip()]
        bullets = [line for line in lines if re.match(r"^(?:[-*•]|\d+[.)])\s+", line)]
        format_ok = len(lines) == len(bullets) and bool(bullets)
        checks = [
            {"name": "bullet_count", "passed": len(bullets) == 3, "message": f"Found {len(bullets)} bullet points; expected 3"},
            {"name": "bullet_format", "passed": format_ok, "message": "Every non-empty line uses bullet format" if format_ok else "Output must contain only bullet lines"},
            {"name": "length_limit", "passed": bool(bullets) and all(1 <= len(self._bullet_text(line)) <= 200 for line in bullets), "message": "Each bullet is between 1 and 200 characters"},
        ]
        return self._result(checks)

    def _coding(self, output: str) -> dict[str, Any]:
        code = self._extract_code(output)
        has_code_block = bool(re.search(r"```(?:python)?\s*\n[\s\S]*?```", output, flags=re.IGNORECASE))
        keywords_ok = "fastapi" in output.lower() and ("@app.get" in output or "FastAPI(" in output)
        syntax_ok = False
        syntax_message = "No Python code found"
        if code.strip():
            try:
                compile(code, "<capability-output>", "exec")
                syntax_ok = True
                syntax_message = "Python syntax compiles"
            except SyntaxError as exc:
                syntax_message = f"Python syntax error: {exc.msg}"
        checks = [
            {"name": "code_block", "passed": has_code_block, "message": "Contains a fenced code block" if has_code_block else "Expected a fenced code block"},
            {"name": "fastapi_keywords", "passed": keywords_ok, "message": "Contains FastAPI and route markers" if keywords_ok else "Expected FastAPI and route markers"},
            {"name": "python_syntax", "passed": syntax_ok, "message": syntax_message},
        ]
        return self._result(checks)

    @staticmethod
    def _bullet_text(line: str) -> str:
        return re.sub(r"^(?:[-*•]|\d+[.)])\s+", "", line).strip()

    @staticmethod
    def _extract_code(output: str) -> str:
        match = re.search(r"```(?:python)?\s*\n([\s\S]*?)```", output, flags=re.IGNORECASE)
        return match.group(1) if match else ""

    @staticmethod
    def _extract_numbers(text: str) -> list[float]:
        return [float(m) for m in re.findall(r"-?\d+(?:\.\d+)?", text)]

    @staticmethod
    def _extract_json(text: str) -> Any | None:
        candidate = text.strip()
        fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", candidate, flags=re.IGNORECASE)
        if fence:
            candidate = fence.group(1).strip()
        else:
            brace = re.search(r"\{[\s\S]*\}", candidate)
            if brace:
                candidate = brace.group(0)
        try:
            return json.loads(candidate)
        except (json.JSONDecodeError, TypeError):
            return None

    @staticmethod
    def _contains_refusal(text: str) -> bool:
        lowered = text.lower()
        markers = ["i don't know", "i do not know", "as an ai", "i cannot", "unable to", "cannot determine", "i'm unable"]
        return any(m in lowered for m in markers)

    def _reasoning(self, output: str) -> dict[str, Any]:
        numbers = self._extract_numbers(output)
        last = numbers[-1] if numbers else None
        checks = [
            {"name": "answer_present", "passed": last is not None, "message": "Output contains a numeric answer" if last is not None else "No number found in output"},
            {"name": "answer_correct", "passed": last is not None and round(last) == 13, "message": f"Final answer is 13 (got {int(last) if last is not None else 'none'})"},
            {"name": "multi_step", "passed": len(set(numbers)) >= 2, "message": "Shows intermediate computation" if len(set(numbers)) >= 2 else "No evidence of multi-step reasoning"},
        ]
        return self._result(checks)

    def _tool_calling(self, output: str) -> dict[str, Any]:
        data = self._extract_json(output)
        is_json = isinstance(data, dict)
        name_ok = is_json and data.get("name") == "get_weather"
        args = data.get("arguments") if (is_json and isinstance(data.get("arguments"), dict)) else {}
        city_ok = isinstance(args, dict) and args.get("city") == "Tokyo"
        checks = [
            {"name": "json_parse", "passed": is_json, "message": "Output is valid JSON" if is_json else "Could not parse JSON tool call"},
            {"name": "function_name", "passed": name_ok, "message": "Function name is get_weather" if name_ok else "Expected function name 'get_weather'"},
            {"name": "arguments_correct", "passed": city_ok, "message": "Argument city is 'Tokyo'" if city_ok else "Expected arguments.city == 'Tokyo'"},
        ]
        return self._result(checks)

    def _long_context(self, output: str) -> dict[str, Any]:
        lowered = output.lower()
        answer_ok = "delayed" in lowered
        target_ok = "aurora" in lowered
        not_refused = not self._contains_refusal(output)
        checks = [
            {"name": "answer_correct", "passed": answer_ok, "message": "Identified Aurora's status as 'delayed'" if answer_ok else "Expected status 'delayed'"},
            {"name": "target_identified", "passed": target_ok, "message": "Referenced Project Aurora" if target_ok else "Did not identify Project Aurora"},
            {"name": "not_refused", "passed": not_refused, "message": "Provided an answer (not a refusal)" if not_refused else "Model refused or claimed lack of information"},
        ]
        return self._result(checks)
