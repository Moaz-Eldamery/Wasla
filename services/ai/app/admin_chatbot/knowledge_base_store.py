"""Persist validated knowledge-base entries and their bilingual embeddings."""

import hashlib
from dataclasses import dataclass
from math import isfinite
from typing import Protocol
from uuid import uuid4

from app.admin_chatbot.embeddings import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL
from app.admin_chatbot.knowledge_base import KnowledgeBaseEntry, validate_entries


class EmbeddingProvider(Protocol):
    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...


@dataclass(frozen=True)
class SyncResult:
    entry_count: int
    embeddings_created_or_refreshed: int
    embeddings_unchanged: int


def embedding_text(title: str, content: str) -> str:
    return f"{title.strip()}\n\n{content.strip()}"


def content_hash(language: str, text: str, model: str = EMBEDDING_MODEL) -> str:
    value = f"{model}\0{language}\0{text}".encode()
    return hashlib.sha256(value).hexdigest()


def sync_knowledge_base(
    connection: object, entries: list[KnowledgeBaseEntry], provider: EmbeddingProvider
) -> SyncResult:
    """Upsert entries and refresh only embeddings whose content has changed.

    The supplied connection is expected to be a psycopg connection. This
    function does not open connections, so callers control credentials and
    transaction lifetime.
    """
    validate_entries(entries)
    existing_hashes = _read_embedding_hashes(connection)
    tasks: list[tuple[KnowledgeBaseEntry, str, str, str]] = []
    unchanged = 0
    for entry in entries:
        for language, title, content in (
            ("en", entry.title_en, entry.content_en),
            ("ar", entry.title_ar, entry.content_ar),
        ):
            text = embedding_text(title, content)
            digest = content_hash(language, text)
            if existing_hashes.get((entry.id, language)) == (EMBEDDING_MODEL, digest):
                unchanged += 1
            else:
                tasks.append((entry, language, text, digest))

    vectors = provider.embed_documents([task[2] for task in tasks]) if tasks else []
    if len(vectors) != len(tasks):
        raise ValueError("Embedding provider returned an unexpected number of vectors")

    with connection.transaction():
        with connection.cursor() as cursor:
            cursor.execute('UPDATE "public"."knowledge_base_entries" SET "is_active" = false')
            entry_ids: dict[str, str] = {}
            for entry in entries:
                cursor.execute(
                    """
                    INSERT INTO "public"."knowledge_base_entries"
                      ("id", "source_id", "slug", "category", "title_en", "title_ar",
                       "content_en", "content_ar", "data_type", "is_active", "updated_at")
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, true, CURRENT_TIMESTAMP)
                    ON CONFLICT ("source_id") DO UPDATE SET
                      "slug" = EXCLUDED."slug",
                      "category" = EXCLUDED."category",
                      "title_en" = EXCLUDED."title_en",
                      "title_ar" = EXCLUDED."title_ar",
                      "content_en" = EXCLUDED."content_en",
                      "content_ar" = EXCLUDED."content_ar",
                      "data_type" = EXCLUDED."data_type",
                      "is_active" = true,
                      "updated_at" = CURRENT_TIMESTAMP
                    RETURNING "id"
                    """,
                    (
                        str(uuid4()),
                        entry.id,
                        entry.slug,
                        entry.category,
                        entry.title_en,
                        entry.title_ar,
                        entry.content_en,
                        entry.content_ar,
                        entry.data_type,
                    ),
                )
                entry_ids[entry.id] = str(cursor.fetchone()[0])

            for task, vector in zip(tasks, vectors, strict=True):
                entry, language, _, digest = task
                literal = _vector_literal(vector)
                cursor.execute(
                    """
                    INSERT INTO "public"."knowledge_base_embeddings"
                      ("entry_id", "language", "model", "content_hash", "embedding", "updated_at")
                    VALUES (%s, %s, %s, %s, %s::vector, CURRENT_TIMESTAMP)
                    ON CONFLICT ("entry_id", "language") DO UPDATE SET
                      "model" = EXCLUDED."model",
                      "content_hash" = EXCLUDED."content_hash",
                      "embedding" = EXCLUDED."embedding",
                      "updated_at" = CURRENT_TIMESTAMP
                    """,
                    (entry_ids[entry.id], language, EMBEDDING_MODEL, digest, literal),
                )

    return SyncResult(len(entries), len(tasks), unchanged)


def _read_embedding_hashes(connection: object) -> dict[tuple[str, str], tuple[str, str]]:
    with connection.transaction():
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT entry."source_id", embedding."language", embedding."model",
                  embedding."content_hash"
                FROM "public"."knowledge_base_entries" AS entry
                JOIN "public"."knowledge_base_embeddings" AS embedding
                  ON embedding."entry_id" = entry."id"
                WHERE entry."is_active" = true
                """
            )
            return {(row[0], row[1]): (row[2], row[3]) for row in cursor.fetchall()}


def _vector_literal(values: list[float]) -> str:
    if len(values) != EMBEDDING_DIMENSIONS:
        raise ValueError(f"Embedding must contain {EMBEDDING_DIMENSIONS} values")
    if not all(isfinite(value) for value in values):
        raise ValueError("Embedding contains a non-finite value")
    return "[" + ",".join(str(float(value)) for value in values) + "]"
