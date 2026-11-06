"""Internal FastAPI routes for the admin chatbot."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.admin_chatbot.dependencies import get_chatbot_service
from app.admin_chatbot.schemas import AskQuestion, ChatbotAnswer
from app.admin_chatbot.service import ChatbotService

router = APIRouter(prefix="/internal/admin/chatbot", tags=["admin-chatbot"])


@router.post("/answer", response_model=ChatbotAnswer)
def answer_question(
    request: AskQuestion,
    service: Annotated[ChatbotService, Depends(get_chatbot_service)],
) -> ChatbotAnswer:
    try:
        return service.answer(request.question)
    except Exception:
        # Do not log the question, retrieved content, provider response, or SDK error.
        raise HTTPException(
            status_code=503,
            detail="The AI answer service is temporarily unavailable.",
        ) from None
