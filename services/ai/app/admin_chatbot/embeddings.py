"""Gemini embedding generation for bilingual knowledge-base search."""

import os
from math import isclose, isfinite, sqrt
from typing import Any

from google import genai
from google.genai import types

SUPPORTED_EMBEDDING_MODEL = "gemini-embedding-2"
SUPPORTED_EMBEDDING_DIMENSIONS = 1536
EMBEDDING_MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", SUPPORTED_EMBEDDING_MODEL)
try:
    EMBEDDING_DIMENSIONS = int(
        os.getenv("GEMINI_EMBEDDING_DIMENSIONS", str(SUPPORTED_EMBEDDING_DIMENSIONS))
    )
except ValueError as error:
    raise RuntimeError("GEMINI_EMBEDDING_DIMENSIONS must be 1536") from error

if EMBEDDING_MODEL != SUPPORTED_EMBEDDING_MODEL:
    raise RuntimeError(f"Unsupported Gemini embedding model: {EMBEDDING_MODEL}")
if EMBEDDING_DIMENSIONS != SUPPORTED_EMBEDDING_DIMENSIONS:
    raise RuntimeError("GEMINI_EMBEDDING_DIMENSIONS must be 1536")


class GeminiEmbeddingProvider:
    """Create and validate normalized Gemini document and query embeddings."""

    def __init__(self, client: Any | None = None) -> None:
        self.client = client or genai.Client()

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._embed(texts, "search_document")

    def embed_query(self, text: str) -> list[float]:
        return self._embed([text], "search_query")[0]

    def _embed(self, texts: list[str], task: str) -> list[list[float]]:
        if not texts:
            return []
        # Embedding 2 uses prompt instructions instead of task_type. Separate
        # Content items make the API return one vector for each source text.
        contents = [
            types.Content(parts=[types.Part.from_text(text=f"task: {task} | query: {text}")])
            for text in texts
        ]
        response = self.client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=contents,
            config=types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIMENSIONS),
        )
        embeddings = response.embeddings or []
        if len(embeddings) != len(texts):
            raise ValueError("Gemini returned an unexpected number of embeddings")
        return [_validate_embedding(item.values) for item in embeddings]


def _validate_embedding(values: list[float]) -> list[float]:
    if len(values) != EMBEDDING_DIMENSIONS:
        raise ValueError(f"Embedding must contain {EMBEDDING_DIMENSIONS} values")
    vector = [float(value) for value in values]
    if not all(isfinite(value) for value in vector):
        raise ValueError("Embedding contains a non-finite value")
    magnitude = sqrt(sum(value * value for value in vector))
    if magnitude == 0:
        raise ValueError("Embedding has zero magnitude")
    if not isclose(magnitude, 1.0, rel_tol=1e-3, abs_tol=1e-3):
        raise ValueError("Gemini returned a non-normalized embedding")
    return vector
