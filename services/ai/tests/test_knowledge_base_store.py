from contextlib import contextmanager

from app.admin_chatbot.embeddings import EMBEDDING_DIMENSIONS
from app.admin_chatbot.knowledge_base import KnowledgeBaseEntry
from app.admin_chatbot.knowledge_base_store import sync_knowledge_base


class FakeProvider:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(texts)
        return [[1.0] + [0.0] * (EMBEDDING_DIMENSIONS - 1) for _ in texts]


class FakeCursor:
    def __init__(self, connection: "FakeConnection") -> None:
        self.connection = connection
        self.result = None

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, query: str, params: tuple | None = None) -> None:
        if query.lstrip().startswith("SELECT"):
            self.result = [
                (source_id, language, model, digest)
                for (source_id, language), (model, digest) in self.connection.hashes.items()
                if source_id in self.connection.active
            ]
        elif query.lstrip().startswith("UPDATE"):
            self.connection.active.clear()
        elif 'INSERT INTO "public"."knowledge_base_entries"' in query:
            assert params is not None
            record_id, source_id = params[:2]
            record_id = self.connection.ids.setdefault(source_id, record_id)
            self.connection.active.add(source_id)
            self.result = (record_id,)
        elif 'INSERT INTO "public"."knowledge_base_embeddings"' in query:
            assert params is not None
            record_id, language, model, digest, _vector = params
            source_id = next(
                key for key, value in self.connection.ids.items() if value == record_id
            )
            self.connection.hashes[(source_id, language)] = (model, digest)
        else:
            raise AssertionError(f"Unexpected SQL: {query}")

    def fetchall(self) -> list[tuple[str, str, str, str]]:
        return self.result or []

    def fetchone(self) -> tuple[str]:
        assert self.result is not None
        return self.result


class FakeConnection:
    def __init__(self) -> None:
        self.ids: dict[str, str] = {}
        self.hashes: dict[tuple[str, str], tuple[str, str]] = {}
        self.active: set[str] = set()

    def cursor(self) -> FakeCursor:
        return FakeCursor(self)

    @contextmanager
    def transaction(self):
        yield


def test_sync_is_idempotent_and_refreshes_two_language_embeddings() -> None:
    entry = KnowledgeBaseEntry(
        id="KB-001",
        slug="reception-hours",
        category="opening-hours",
        title_en="Reception hours",
        title_ar="مواعيد الاستقبال",
        content_en="Open daily.",
        content_ar="مفتوح يوميًا.",
        data_type="synthetic_demo",
    )
    connection = FakeConnection()
    provider = FakeProvider()

    first = sync_knowledge_base(connection, [entry], provider)
    second = sync_knowledge_base(connection, [entry], provider)

    assert first.entry_count == 1
    assert first.embeddings_created_or_refreshed == 2
    assert first.embeddings_unchanged == 0
    assert second.embeddings_created_or_refreshed == 0
    assert second.embeddings_unchanged == 2
    assert len(provider.calls) == 1
    assert len(provider.calls[0]) == 2
