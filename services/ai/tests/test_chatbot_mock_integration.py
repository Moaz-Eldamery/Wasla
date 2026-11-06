"""Local endpoint integration tests with no external AI provider calls."""

from contextlib import contextmanager

from fastapi.testclient import TestClient

from app.admin_chatbot.dependencies import get_chatbot_service
from app.admin_chatbot.embeddings import EMBEDDING_DIMENSIONS
from app.admin_chatbot.retrieval import KnowledgeBaseMatch
from app.admin_chatbot.schemas import ClaudeDecision
from app.admin_chatbot.service import ChatbotService
from app.main import app

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


class MockEmbeddingProvider:
    """Return a valid normalized query vector without calling Gemini."""

    def __init__(self) -> None:
        self.questions: list[str] = []

    def embed_query(self, text: str) -> list[float]:
        self.questions.append(text)
        return [1.0] + [0.0] * (EMBEDDING_DIMENSIONS - 1)


class MockClaudeProvider:
    """Produce a grounded decision directly from the retrieved fixture entry."""

    def __init__(self) -> None:
        self.calls = 0

    def generate(
        self, _question: str, _language: str, entries: list[KnowledgeBaseMatch]
    ) -> ClaudeDecision:
        self.calls += 1
        entry = entries[0]
        return ClaudeDecision(status="ANSWERED", answer=entry.content, source_ids=[entry.source_id])


class MockCursor:
    def __init__(self, rows: list[tuple]) -> None:
        self.rows = rows

    def __enter__(self) -> "MockCursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, _query: str, _parameters: tuple) -> None:
        return None

    def fetchall(self) -> list[tuple]:
        return self.rows


class MockConnection:
    def __init__(self, rows: list[tuple]) -> None:
        self.rows = rows

    def __enter__(self) -> "MockConnection":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def cursor(self) -> MockCursor:
        return MockCursor(self.rows)


def make_test_client(
    rows: list[tuple], mock_claude: MockClaudeProvider, mock_embeddings: MockEmbeddingProvider
) -> TestClient:
    @contextmanager
    def connection_factory(*_args: object, **_kwargs: object):
        yield MockConnection(rows)

    service = ChatbotService(
        "postgresql://test-only",
        mock_embeddings,
        mock_claude,
        connection_factory=connection_factory,
    )
    app.dependency_overrides[get_chatbot_service] = lambda: service
    return TestClient(app)


def test_internal_endpoint_integrates_english_retrieval_mock_answer_and_sources() -> None:
    mock_claude = MockClaudeProvider()
    mock_embeddings = MockEmbeddingProvider()
    try:
        response = make_test_client([ENGLISH_ROW], mock_claude, mock_embeddings).post(
            "/internal/admin/chatbot/answer",
            json={"question": "By what time is the central front desk staffed each day?"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "status": "ANSWERED",
        "answer": ENGLISH_ROW[5],
        "language": "en",
        "sources": [
            {
                "entryId": "KB-001",
                "title": {"ar": "مواعيد الاستقبال الرئيسي", "en": "Main Reception Hours"},
            }
        ],
    }
    assert mock_claude.calls == 1
    assert mock_embeddings.questions == ["By what time is the central front desk staffed each day?"]


def test_internal_endpoint_integrates_arabic_response_and_no_information_fallback() -> None:
    mock_claude = MockClaudeProvider()
    mock_embeddings = MockEmbeddingProvider()
    try:
        answered = make_test_client([ARABIC_ROW], mock_claude, mock_embeddings).post(
            "/internal/admin/chatbot/answer",
            json={"question": "إلى أي ساعة يبقى مكتب الاستقبال الرئيسي مفتوحًا؟"},
        )
        fallback = make_test_client([], mock_claude, mock_embeddings).post(
            "/internal/admin/chatbot/answer",
            json={"question": "أين توجد خدمة غير موجودة؟"},
        )
    finally:
        app.dependency_overrides.clear()

    assert answered.status_code == 200
    assert answered.json()["language"] == "ar"
    assert answered.json()["answer"] == ARABIC_ROW[5]
    assert answered.json()["sources"][0]["entryId"] == "KB-001"
    assert fallback.status_code == 200
    assert fallback.json() == {
        "status": "NO_INFORMATION",
        "answer": "ليست لدي هذه المعلومات",
        "language": "ar",
        "sources": [],
    }
    assert mock_claude.calls == 1
    assert mock_embeddings.questions == [
        "إلى أي ساعة يبقى مكتب الاستقبال الرئيسي مفتوحًا؟",
        "أين توجد خدمة غير موجودة؟",
    ]
