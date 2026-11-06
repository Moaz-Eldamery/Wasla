"""FastAPI dependencies for chatbot service construction."""

from functools import lru_cache

from app.admin_chatbot.service import ChatbotService, configured_chatbot_service


@lru_cache(maxsize=1)
def get_chatbot_service() -> ChatbotService:
    return configured_chatbot_service()
