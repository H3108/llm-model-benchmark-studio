from dataclasses import dataclass


@dataclass(frozen=True)
class DefaultTask:
    task_key: str
    capability: str
    name: str
    prompt: str
    expected_format: str
    version: str = "v1"


DEFAULT_TASKS = (
    DefaultTask(
        task_key="coding_basic_v1",
        capability="coding",
        name="Basic coding response",
        prompt="Write a simple FastAPI hello world API. Return the answer briefly.",
        expected_format="text",
    ),
    DefaultTask(
        task_key="structured_output_basic_v1",
        capability="structured_output",
        name="Basic structured output",
        prompt='Return a JSON object with exactly these keys: "name", "status", and "summary". Use concise string values.',
        expected_format="json",
    ),
    DefaultTask(
        task_key="instruction_following_basic_v1",
        capability="instruction_following",
        name="Basic instruction following",
        prompt="Reply with exactly three short bullet points explaining why API health checks are useful. Do not add an introduction.",
        expected_format="bullet_list",
    ),
    DefaultTask(
        task_key="reasoning_basic_v1",
        capability="reasoning",
        name="Basic reasoning",
        prompt="Sarah has 3 boxes. Each box contains 4 red marbles and 2 blue marbles. She gives away 5 marbles. How many marbles does she have left? Answer with the final number only.",
        expected_format="number",
    ),
    DefaultTask(
        task_key="tool_calling_basic_v1",
        capability="tool_calling",
        name="Basic tool calling",
        prompt='You have a tool called `get_weather` that accepts one argument `city` (string). Output exactly one JSON object representing the tool call, shaped like: {"name": "get_weather", "arguments": {"city": "Tokyo"}}. Respond with only the JSON object.',
        expected_format="json",
    ),
    DefaultTask(
        task_key="long_context_basic_v1",
        capability="long_context",
        name="Basic long context",
        prompt=(
            "Read the status report and answer the question.\n\n"
            "Status report:\n"
            "- Project Apollo: completed and shipped to production.\n"
            "- Project Borealis: in active development, on track for Q3.\n"
            "- Project Cygnus: paused pending budget approval.\n"
            "- Project Aurora: delayed due to dependency on an external vendor.\n"
            "- Project Draco: cancelled after review.\n"
            "- Project Ember: launched in beta with limited users.\n"
            "- Project Foxglove: on hold, awaiting legal sign-off.\n"
            "- Project Gemini: completed ahead of schedule.\n\n"
            "Question: What is the current status of Project Aurora? Answer in one short phrase."
        ),
        expected_format="text",
    ),
)
