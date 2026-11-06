from contextlib import contextmanager

from app.admin_chatbot.embeddings import EMBEDDING_DIMENSIONS
from app.admin_chatbot.privacy import redact_direct_identifiers
from app.admin_chatbot.retrieval import KnowledgeBaseMatch
from app.admin_chatbot.schemas import ClaudeDecision
from app.admin_chatbot.service import ChatbotService, detect_language

ENTRY = KnowledgeBaseMatch(
    "KB-001",
    "main-reception-hours",
    "opening-hours",
    "Main Reception Hours",
    "ساعات الاستقبال الرئيسي",
    "Open daily from 8 AM to 8 PM.",
    "en",
    0.9,
)


class FakeCursor:
    def __init__(self, rows: list[tuple]) -> None:
        self.rows = rows

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, _query: str, _params: tuple) -> None:
        return None

    def fetchall(self) -> list[tuple]:
        return self.rows


class FakeConnection:
    def __init__(self, rows: list[tuple]) -> None:
        self.rows = rows

    def __enter__(self) -> "FakeConnection":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def cursor(self) -> FakeCursor:
        return FakeCursor(self.rows)


def entry_row(entry: KnowledgeBaseMatch = ENTRY) -> tuple:
    return (
        entry.source_id,
        entry.slug,
        entry.category,
        entry.title_en,
        entry.title_ar,
        entry.content,
        entry.language,
        entry.similarity,
    )


class FakeEmbeddings:
    def __init__(self) -> None:
        self.questions: list[str] = []

    def embed_query(self, text: str) -> list[float]:
        self.questions.append(text)
        return [1.0] + [0.0] * (EMBEDDING_DIMENSIONS - 1)


class FakeClaude:
    def __init__(self, decision: ClaudeDecision) -> None:
        self.decision = decision
        self.calls: list[tuple[str, str, list[KnowledgeBaseMatch]]] = []

    def generate(
        self, question: str, language: str, entries: list[KnowledgeBaseMatch]
    ) -> ClaudeDecision:
        self.calls.append((question, language, entries))
        return self.decision


def make_service(
    decision: ClaudeDecision,
    rows: list[tuple] | None = None,
    minimum_relevance: float = 0.65,
) -> tuple[ChatbotService, FakeEmbeddings, FakeClaude]:
    embeddings = FakeEmbeddings()
    claude = FakeClaude(decision)

    @contextmanager
    def connection_factory(*_args: object, **_kwargs: object):
        yield FakeConnection(rows if rows is not None else [entry_row()])

    service = ChatbotService(
        "postgresql://not-used",
        embeddings,
        claude,
        connection_factory=connection_factory,
        minimum_relevance=minimum_relevance,
    )
    return service, embeddings, claude


def test_answer_returns_same_language_and_bilingual_source_attribution() -> None:
    service, _, claude = make_service(
        ClaudeDecision(
            status="ANSWERED", answer="Open daily from 8 AM to 8 PM.", source_ids=["KB-001"]
        )
    )

    answer = service.answer("What are the main reception hours?")

    assert answer.status == "ANSWERED"
    assert answer.language == "en"
    assert answer.sources[0].entryId == "KB-001"
    assert answer.sources[0].title.en == "Main Reception Hours"
    assert answer.sources[0].title.ar == "ساعات الاستقبال الرئيسي"
    assert claude.calls[0][2] == [ENTRY]


def test_arabic_question_requires_arabic_answer() -> None:
    arabic_entry = ENTRY.__class__(
        **{**ENTRY.__dict__, "content": "مفتوح يوميًا.", "language": "ar"}
    )
    service, _, _ = make_service(
        ClaudeDecision(status="ANSWERED", answer="مفتوح يوميًا.", source_ids=["KB-001"]),
        [entry_row(arabic_entry)],
    )

    answer = service.answer("ما مواعيد الاستقبال الرئيسي؟")

    assert answer.status == "ANSWERED"
    assert answer.language == "ar"
    assert answer.answer == "مفتوح يوميًا."


def test_no_relevant_entry_returns_exact_fallback_without_calling_claude() -> None:
    service, _, claude = make_service(
        ClaudeDecision(status="ANSWERED", answer="Unsupported", source_ids=["KB-001"]),
        minimum_relevance=0.95,
    )

    answer = service.answer("What is the weather today?")

    assert answer.status == "NO_INFORMATION"
    assert answer.answer == "I don't have that information"
    assert answer.sources == []
    assert claude.calls == []


def test_arabic_no_information_response_is_localized() -> None:
    service, _, _ = make_service(
        ClaudeDecision(status="NO_INFORMATION", answer="", source_ids=[]), rows=[]
    )

    answer = service.answer("ما حالة الطقس اليوم؟")

    assert answer.status == "NO_INFORMATION"
    assert answer.answer == "ليست لدي هذه المعلومات"
    assert answer.language == "ar"
    assert answer.sources == []


def test_unknown_source_or_wrong_answer_language_fails_closed() -> None:
    bad_source_service, _, _ = make_service(
        ClaudeDecision(status="ANSWERED", answer="Open daily.", source_ids=["NOT-A-SOURCE"])
    )
    wrong_language_service, _, _ = make_service(
        ClaudeDecision(status="ANSWERED", answer="مفتوح يوميًا.", source_ids=["KB-001"])
    )

    assert bad_source_service.answer("What are the hours?").status == "NO_INFORMATION"
    assert wrong_language_service.answer("What are the hours?").status == "NO_INFORMATION"


def test_sensitive_markers_are_redacted_before_embedding_and_claude() -> None:
    question = "Patient Ahmed Hassan: call +201001234567 or ahmed@example.org about reception hours"
    service, embeddings, claude = make_service(
        ClaudeDecision(status="ANSWERED", answer="Open daily.", source_ids=["KB-001"])
    )

    service.answer(question)

    assert "Ahmed" not in embeddings.questions[0]
    assert "201001234567" not in embeddings.questions[0]
    assert "ahmed@example.org" not in embeddings.questions[0]
    assert embeddings.questions[0] == claude.calls[0][0]


def test_identifier_redaction_and_language_detection() -> None:
    cleaned = redact_direct_identifiers("اسم المريض: أحمد علي، الرقم 12345678901234")

    assert "أحمد" not in cleaned
    assert "12345678901234" not in cleaned
    assert detect_language("مواعيد الاستقبال") == "ar"
    assert detect_language("Reception opening hours") == "en"
