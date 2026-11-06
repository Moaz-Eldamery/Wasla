from fastapi.testclient import TestClient

from app.admin_chatbot.dependencies import get_chatbot_service
from app.admin_chatbot.schemas import AnswerSource, ChatbotAnswer, LocalizedText
from app.main import app


class FakeChatbotService:
    def __init__(self, result: ChatbotAnswer | None = None, error: Exception | None = None) -> None:
        self.result = result
        self.error = error
        self.questions: list[str] = []

    def answer(self, question: str) -> ChatbotAnswer:
        self.questions.append(question)
        if self.error:
            raise self.error
        assert self.result is not None
        return self.result


def make_client(service: FakeChatbotService) -> TestClient:
    app.dependency_overrides[get_chatbot_service] = lambda: service
    return TestClient(app)


def test_chatbot_endpoint_validates_request_and_returns_contract_shape() -> None:
    service = FakeChatbotService(
        ChatbotAnswer(
            status="ANSWERED",
            answer="Open daily.",
            language="en",
            sources=[
                AnswerSource(
                    entryId="KB-001",
                    title=LocalizedText(ar="ساعات الاستقبال", en="Reception hours"),
                )
            ],
        )
    )
    try:
        response = make_client(service).post(
            "/internal/admin/chatbot/answer", json={"question": "  When is reception open?  "}
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["sources"][0]["entryId"] == "KB-001"
    assert service.questions == ["When is reception open?"]


def test_chatbot_endpoint_rejects_invalid_or_extra_request_fields() -> None:
    service = FakeChatbotService(
        ChatbotAnswer(
            status="NO_INFORMATION",
            answer="I don't have that information",
            language="en",
            sources=[],
        )
    )
    try:
        client = make_client(service)
        blank = client.post("/internal/admin/chatbot/answer", json={"question": "   "})
        extra = client.post(
            "/internal/admin/chatbot/answer", json={"question": "Hours?", "patient_id": "x"}
        )
    finally:
        app.dependency_overrides.clear()

    assert blank.status_code == 422
    assert extra.status_code == 422


def test_chatbot_endpoint_hides_provider_exception_details() -> None:
    service = FakeChatbotService(error=RuntimeError("private request content"))
    try:
        response = make_client(service).post(
            "/internal/admin/chatbot/answer", json={"question": "Where is reception?"}
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert "private request content" not in response.text
