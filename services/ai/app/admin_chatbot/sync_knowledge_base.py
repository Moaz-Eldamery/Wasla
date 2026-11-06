"""Synchronize bundled knowledge-base records and embeddings into wasla_ai."""

import logging
import os

import psycopg
from google import genai

from app.admin_chatbot.embeddings import GeminiEmbeddingProvider
from app.admin_chatbot.knowledge_base import load_knowledge_base
from app.admin_chatbot.knowledge_base_store import sync_knowledge_base

logger = logging.getLogger(__name__)


def main() -> None:
    entries = load_knowledge_base()
    provider = GeminiEmbeddingProvider(genai.Client())
    with psycopg.connect(os.environ["DATABASE_URL"]) as connection:
        result = sync_knowledge_base(connection, entries, provider)
    logger.info(
        "Synchronized %d entries; refreshed %d embeddings; kept %d unchanged",
        result.entry_count,
        result.embeddings_created_or_refreshed,
        result.embeddings_unchanged,
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
