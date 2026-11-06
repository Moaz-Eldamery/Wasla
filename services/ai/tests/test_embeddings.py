from types import SimpleNamespace

import pytest

from app.admin_chatbot.embeddings import (
    EMBEDDING_DIMENSIONS,
    EMBEDDING_MODEL,
    GeminiEmbeddingProvider,
)
from app.admin_chatbot.knowledge_base_store import content_hash, embedding_text


class FakeModels:
    def __init__(self) -> None:
        self.model = ""
        self.contents: list[object] = []
        self.config = None

    def embed_content(self, *, model: str, contents: list[object], config: object) -> object:
        self.model = model
        self.contents = contents
        self.config = config
        vector = [1.0] + [0.0] * (EMBEDDING_DIMENSIONS - 1)
        return SimpleNamespace(embeddings=[SimpleNamespace(values=vector) for _ in contents])


def test_gemini_generates_normalized_document_vectors() -> None:
    models = FakeModels()
    provider = GeminiEmbeddingProvider(SimpleNamespace(models=models))

    vectors = provider.embed_documents(["English", "العربية"])

    assert EMBEDDING_MODEL == "gemini-embedding-2"
    assert EMBEDDING_DIMENSIONS == 1536
    assert models.model == EMBEDDING_MODEL
    assert [content.parts[0].text for content in models.contents] == [
        "task: search_document | query: English",
        "task: search_document | query: العربية",
    ]
    assert models.config.task_type is None
    assert models.config.output_dimensionality == EMBEDDING_DIMENSIONS
    assert len(vectors) == 2
    assert vectors[0][0] == 1.0
    assert len(vectors[0]) == EMBEDDING_DIMENSIONS


def test_embedding_text_and_hash_are_language_specific() -> None:
    text = embedding_text(" Title ", " Content ")

    assert text == "Title\n\nContent"
    assert content_hash("en", text) != content_hash("ar", text)
    assert content_hash("en", text) != content_hash("en", text, "different-model")


@pytest.mark.parametrize(
    "question",
    [
        "By what time is the central front desk staffed each day?",
        "إلى أي ساعة يبقى مكتب الاستقبال الرئيسي مفتوحًا؟",
    ],
)
def test_gemini_query_uses_search_query_instruction(question: str) -> None:
    models = FakeModels()
    provider = GeminiEmbeddingProvider(SimpleNamespace(models=models))

    vector = provider.embed_query(question)

    assert models.model == "gemini-embedding-2"
    assert models.contents[0].parts[0].text == f"task: search_query | query: {question}"
    assert len(vector) == 1536


def test_gemini_rejects_wrong_vector_dimensions() -> None:
    models = SimpleNamespace(
        embed_content=lambda **_: SimpleNamespace(embeddings=[SimpleNamespace(values=[1.0, 2.0])])
    )
    provider = GeminiEmbeddingProvider(SimpleNamespace(models=models))

    with pytest.raises(ValueError, match="1536 values"):
        provider.embed_documents(["short vector"])
