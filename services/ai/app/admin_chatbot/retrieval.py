"""Question-based retrieval from the persisted bilingual knowledge base."""

from dataclasses import dataclass
from typing import Protocol

from app.admin_chatbot.embeddings import EMBEDDING_MODEL
from app.admin_chatbot.knowledge_base_store import _vector_literal


class QueryEmbeddingProvider(Protocol):
    def embed_query(self, text: str) -> list[float]: ...


@dataclass(frozen=True)
class KnowledgeBaseMatch:
    source_id: str
    slug: str
    category: str
    title_en: str
    title_ar: str
    content: str
    language: str
    similarity: float


def search_knowledge_base(
    connection: object,
    question: str,
    language: str,
    provider: QueryEmbeddingProvider,
    limit: int = 5,
) -> list[KnowledgeBaseMatch]:
    """Return the nearest active entries for a question in ``en`` or ``ar``.

    User-provided values are bound parameters. The embedding model and vector
    dimension are fixed by the configured Gemini adapter and database schema.
    """
    if not isinstance(question, str) or not question.strip():
        raise ValueError("Question must not be empty")
    if language not in {"en", "ar"}:
        raise ValueError("Language must be 'en' or 'ar'")
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 20:
        raise ValueError("Limit must be an integer between 1 and 20")

    vector = _vector_literal(provider.embed_query(question.strip()))
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT entry."source_id", entry."slug", entry."category",
              entry."title_en", entry."title_ar",
              CASE embedding."language"
                WHEN 'ar' THEN entry."content_ar" ELSE entry."content_en"
              END AS "content",
              embedding."language",
              1 - (embedding."embedding" <=> %s::vector) AS "similarity"
            FROM "public"."knowledge_base_embeddings" AS embedding
            JOIN "public"."knowledge_base_entries" AS entry
              ON entry."id" = embedding."entry_id"
            WHERE entry."is_active" = true
              AND embedding."language" = %s
              AND embedding."model" = %s
            ORDER BY embedding."embedding" <=> %s::vector
            LIMIT %s
            """,
            (vector, language, EMBEDDING_MODEL, vector, limit),
        )
        rows = cursor.fetchall()

    return [KnowledgeBaseMatch(*row) for row in rows]
