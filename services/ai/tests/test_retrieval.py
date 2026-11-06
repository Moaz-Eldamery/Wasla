import pytest

from app.admin_chatbot.embeddings import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL
from app.admin_chatbot.retrieval import search_knowledge_base


class FakeProvider:
    def __init__(self) -> None:
        self.questions: list[str] = []

    def embed_query(self, text: str) -> list[float]:
        self.questions.append(text)
        return [1.0] + [0.0] * (EMBEDDING_DIMENSIONS - 1)


class FakeCursor:
    def __init__(self, rows: list[tuple]) -> None:
        self.rows = rows
        self.query = ""
        self.params: tuple | None = None

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, query: str, params: tuple) -> None:
        self.query = query
        self.params = params

    def fetchall(self) -> list[tuple]:
        return self.rows


class FakeConnection:
    def __init__(self, rows: list[tuple]) -> None:
        self.fake_cursor = FakeCursor(rows)

    def cursor(self) -> FakeCursor:
        return self.fake_cursor


def test_search_embeds_question_and_queries_active_matching_language() -> None:
    rows = [
        (
            "KB-001",
            "hours",
            "opening-hours",
            "Opening hours",
            "ساعات الاستقبال",
            "Open daily.",
            "en",
            0.92,
        )
    ]
    connection = FakeConnection(rows)
    provider = FakeProvider()

    matches = search_knowledge_base(connection, "  When are you open?  ", "en", provider, 3)

    assert matches[0].source_id == "KB-001"
    assert matches[0].similarity == 0.92
    assert provider.questions == ["When are you open?"]
    query = connection.fake_cursor.query
    assert 'entry."is_active" = true' in query
    assert 'embedding."language" = %s' in query
    assert 'embedding."embedding" <=> %s::vector' in query
    assert connection.fake_cursor.params is not None
    assert connection.fake_cursor.params[1:] == (
        "en",
        EMBEDDING_MODEL,
        connection.fake_cursor.params[0],
        3,
    )
    assert len(connection.fake_cursor.params[0].strip("[]").split(",")) == EMBEDDING_DIMENSIONS


@pytest.mark.parametrize(
    ("question", "language", "limit"),
    [("  ", "en", 5), ("valid question", "fr", 5), ("valid question", "ar", 0)],
)
def test_search_rejects_invalid_inputs(question: str, language: str, limit: int) -> None:
    with pytest.raises(ValueError):
        search_knowledge_base(FakeConnection([]), question, language, FakeProvider(), limit)
