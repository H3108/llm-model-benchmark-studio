from types import SimpleNamespace

from app.capabilities.evaluator import CapabilityEvaluator


def task(key: str):
    return SimpleNamespace(task_key=key)


def test_structured_output_scores_all_checks():
    result = CapabilityEvaluator().evaluate(task("structured_output_basic_v1"), '{"name":"api","status":"ok","summary":"ready"}')
    assert result["score"] == 100
    assert all(check["passed"] for check in result["details"]["checks"])


def test_instruction_following_checks_count_and_format():
    result = CapabilityEvaluator().evaluate(task("instruction_following_basic_v1"), "- one\n- two\n- three")
    assert result["score"] == 100


def test_coding_checks_block_keywords_and_syntax():
    output = "```python\nfrom fastapi import FastAPI\napp = FastAPI()\n@app.get('/')\ndef hello():\n    return {'hello': 'world'}\n```"
    result = CapabilityEvaluator().evaluate(task("coding_basic_v1"), output)
    assert result["score"] == 100


def test_reasoning_checks_final_answer():
    output = "3 boxes x 6 marbles = 18 marbles. 18 - 5 = 13. She has 13 marbles left."
    result = CapabilityEvaluator().evaluate(task("reasoning_basic_v1"), output)
    assert result["score"] == 100
    assert all(check["passed"] for check in result["details"]["checks"])


def test_tool_calling_checks_name_and_args():
    output = '{"name": "get_weather", "arguments": {"city": "Tokyo"}}'
    result = CapabilityEvaluator().evaluate(task("tool_calling_basic_v1"), output)
    assert result["score"] == 100
    assert all(check["passed"] for check in result["details"]["checks"])


def test_long_context_checks_retrieval():
    output = "Project Aurora is delayed due to the external vendor dependency."
    result = CapabilityEvaluator().evaluate(task("long_context_basic_v1"), output)
    assert result["score"] == 100
    assert all(check["passed"] for check in result["details"]["checks"])
