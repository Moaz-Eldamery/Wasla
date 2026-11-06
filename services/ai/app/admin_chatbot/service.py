"""Grounded orchestration for the admin chatbot."""

import os
import unicodedata
from collections.abc import Callable
from typing import Protocol

import psycopg

from app.admin_chatbot.privacy import redact_direct_identifiers
from app.admin_chatbot.retrieval import (
    KnowledgeBaseMatch,
    QueryEmbeddingProvider,
    search_knowledge_base,
)
from app.admin_chatbot.schemas import (
    AnswerSource,
    ChatbotAnswer,
    ChatLanguage,
    ClaudeDecision,
    LocalizedText,
)

NO_INFORMATION = {
    "en": "I don't have that information",
    "ar": "ليست لدي هذه المعلومات",
}
MINIMUM_RELEVANCE = 0.65
RETRIEVAL_LIMIT = 5


class AnswerGenerator(Protocol):
    def generate(
        self, question: str, language: ChatLanguage, entries: list[KnowledgeBaseMatch]
    ) -> ClaudeDecision: ...


def detect_language(text: str) -> ChatLanguage:
    """Choose Arabic or English based on the predominant script in a question."""
    arabic = sum("ARABIC" in unicodedata.name(char, "") for char in text)
    latin = sum(char.isascii() and char.isalpha() for char in text)
    return "ar" if arabic > latin else "en"


class ChatbotService:
    def __init__(
        self,
        database_url: str,
        embedding_provider: QueryEmbeddingProvider,
        answer_generator: AnswerGenerator,
        connection_factory: Callable[..., object] = psycopg.connect,
        minimum_relevance: float = MINIMUM_RELEVANCE,
    ) -> None:
        self.database_url = database_url
        self.embedding_provider = embedding_provider
        self.answer_generator = answer_generator
        self.connection_factory = connection_factory
        self.minimum_relevance = minimum_relevance

    def answer(self, question: str) -> ChatbotAnswer:
        language = detect_language(question)
        safe_question = redact_direct_identifiers(question)
        if not safe_question.strip():
            return self._no_information(language)

        with self.connection_factory(self.database_url, connect_timeout=5) as connection:
            matches = search_knowledge_base(
                connection,
                safe_question,
                language,
                self.embedding_provider,
                limit=RETRIEVAL_LIMIT,
            )

        relevant = [match for match in matches if match.similarity >= self.minimum_relevance]
        if not relevant:
            return self._no_information(language)

        decision = self.answer_generator.generate(safe_question, language, relevant)
        if decision.status == "NO_INFORMATION":
            return self._no_information(language)

        allowed = {entry.source_id: entry for entry in relevant}
        source_ids = list(dict.fromkeys(decision.source_ids))
        if (
            not decision.answer.strip()
            or not source_ids
            or any(source_id not in allowed for source_id in source_ids)
            or detect_language(decision.answer) != language
        ):
            return self._no_information(language)

        return ChatbotAnswer(
            status="ANSWERED",
            answer=decision.answer.strip(),
            language=language,
            sources=[
                AnswerSource(
                    entryId=source_id,
                    title=LocalizedText(
                        en=allowed[source_id].title_en, ar=allowed[source_id].title_ar
                    ),
                )
                for source_id in source_ids
            ],
        )

    @staticmethod
    def _no_information(language: ChatLanguage) -> ChatbotAnswer:
        return ChatbotAnswer(
            status="NO_INFORMATION",
            answer=NO_INFORMATION[language],
            language=language,
            sources=[],
        )


def configured_chatbot_service() -> ChatbotService:
    """Build providers lazily so importing the FastAPI app needs no API calls."""
    from app.admin_chatbot.claude import ClaudeAnswerGenerator
    from app.admin_chatbot.embeddings import GeminiEmbeddingProvider

    return ChatbotService(
        database_url=os.environ["DATABASE_URL"],
        embedding_provider=GeminiEmbeddingProvider(),
        answer_generator=ClaudeAnswerGenerator(),
    )
