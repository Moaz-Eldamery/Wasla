"""Test-only FastAPI app for the Core-to-AI local integration test.

This module is not part of the AI runtime image. It replaces the database,
Gemini, and Claude providers with in-memory fixtures while keeping the real
FastAPI route and chatbot orchestration.
"""

from contextlib import contextmanager

from app.admin_chatbot.dependencies import get_chatbot_service
from app.admin_chatbot.embeddings import EMBEDDING_DIMENSIONS
from app.admin_chatbot.retrieval import KnowledgeBaseMatch
from app.admin_chatbot.schemas import ClaudeDecision
from app.admin_chatbot.service import ChatbotService
from app.main import app as ai_app

ENGLISH_ROW = (
    "KB-001",
    "main-reception-hours",
    "opening-hours",
    "Main Reception Hours",
    "مواعيد الاستقبال الرئيسي",
    "The main reception desk is open daily from 8:00 AM to 8:00 PM.",
    "en",
    0.92,
)
ARABIC_ROW = (
    "KB-001",
    "main-reception-hours",
    "opening-hours",
    "Main Reception Hours",
    "مواعيد الاستقبال الرئيسي",
    "مكتب الاستقبال الرئيسي مفتوح يوميًا من الساعة 8:00 صباحًا حتى 8:00 مساءً.",
    "ar",
    0.92,
)


class MockQueryEmbeddingProvider:
    def __init__(self) -> None:
        self.questions: list[str] = []

    def embed_query(self, text: str) -> list[float]:
        self.questions.append(text)
        return [1.0] + [0.0] * (EMBEDDING_DIMENSIONS - 1)


class MockClaudeProvider:
    def __init__(self) -> None:
        self.languages: list[str] = []

    def generate(
        self, _question: str, language: str, entries: list[KnowledgeBaseMatch]
    ) -> ClaudeDecision:
        self.languages.append(language)
        entry = entries[0]
        return ClaudeDecision(status="ANSWERED", answer=entry.content, source_ids=[entry.source_id])


class MockCursor:
    def __init__(self) -> None:
        self.rows: list[tuple] = []

    def __enter__(self) -> "MockCursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, _query: str, parameters: tuple) -> None:
        question = query_embeddings.questions[-1]
        supported_questions = {
            "By what time is the central front desk staffed each day?",
            "إلى أي ساعة يبقى مكتب الاستقبال الرئيسي مفتوحًا؟",
        }
        if question not in supported_questions:
            self.rows = []
            return
        language = parameters[1]
        self.rows = [row for row in (ENGLISH_ROW, ARABIC_ROW) if row[6] == language]

    def fetchall(self) -> list[tuple]:
        return self.rows


class MockConnection:
    def __enter__(self) -> "MockConnection":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def cursor(self) -> MockCursor:
        return MockCursor()


query_embeddings = MockQueryEmbeddingProvider()
claude = MockClaudeProvider()


@contextmanager
def connection_factory(*_args: object, **_kwargs: object):
    yield MockConnection()


service = ChatbotService(
    database_url="postgresql://test-only",
    embedding_provider=query_embeddings,
    answer_generator=claude,
    connection_factory=connection_factory,
)
ai_app.dependency_overrides[get_chatbot_service] = lambda: service

app = ai_app


@app.get("/__test__/state")
def mock_state() -> dict[str, list[str]]:
    """Expose mock call metadata to the local integration test only."""
    return {"query_texts": query_embeddings.questions, "claude_languages": claude.languages}
