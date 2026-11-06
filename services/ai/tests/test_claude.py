from types import SimpleNamespace

import pytest

from app.admin_chatbot.claude import MODEL, TOOL_NAME, ClaudeAnswerGenerator
from app.admin_chatbot.retrieval import KnowledgeBaseMatch

ENTRY = KnowledgeBaseMatch(
    "KB-001",
    "main-reception-hours",
    "opening-hours",
    "Main Reception Hours",
    "ساعات الاستقبال الرئيسي",
    "Open daily.",
    "en",
    0.9,
)


class FakeMessages:
    def __init__(self, content: list[object]) -> None:
        self.content = content
        self.request: dict | None = None

    def create(self, **request: object) -> object:
        self.request = request
        return SimpleNamespace(content=self.content)


def test_claude_client_returns_a_valid_forced_tool_decision() -> None:
    messages = FakeMessages(
        [
            SimpleNamespace(
                type="tool_use",
                name=TOOL_NAME,
                input={"status": "ANSWERED", "answer": "Open daily.", "source_ids": ["KB-001"]},
            )
        ]
    )
    generator = ClaudeAnswerGenerator(SimpleNamespace(messages=messages))

    decision = generator.generate("When is reception open?", "en", [ENTRY])

    assert decision.status == "ANSWERED"
    assert decision.source_ids == ["KB-001"]
    assert messages.request is not None
    assert messages.request["model"] == MODEL
    assert messages.request["tool_choice"] == {"type": "tool", "name": TOOL_NAME}
    assert messages.request["tools"][0]["input_schema"]["properties"]["source_ids"]["items"][
        "enum"
    ] == ["KB-001"]


def test_claude_client_rejects_unknown_source_ids() -> None:
    messages = FakeMessages(
        [
            SimpleNamespace(
                type="tool_use",
                name=TOOL_NAME,
                input={"status": "ANSWERED", "answer": "Open daily.", "source_ids": ["OTHER"]},
            )
        ]
    )

    with pytest.raises(ValueError, match="outside the retrieved knowledge base"):
        ClaudeAnswerGenerator(SimpleNamespace(messages=messages)).generate(
            "When is reception open?", "en", [ENTRY]
        )


def test_claude_client_requires_the_expected_tool_response() -> None:
    messages = FakeMessages([SimpleNamespace(type="text", text="unstructured")])

    with pytest.raises(ValueError, match="required structured answer"):
        ClaudeAnswerGenerator(SimpleNamespace(messages=messages)).generate(
            "When is reception open?", "en", [ENTRY]
        )
