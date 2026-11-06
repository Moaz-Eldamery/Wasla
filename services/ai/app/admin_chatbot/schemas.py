"""Validated request and response models for the admin chatbot."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ChatLanguage = Literal["ar", "en"]
AnswerStatus = Literal["ANSWERED", "NO_INFORMATION"]


class AskQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=1000)

    @field_validator("question", mode="before")
    @classmethod
    def trim_question(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class LocalizedText(BaseModel):
    ar: str
    en: str


class AnswerSource(BaseModel):
    entryId: str
    title: LocalizedText


class ChatbotAnswer(BaseModel):
    status: AnswerStatus
    answer: str = Field(min_length=1, max_length=4000)
    language: ChatLanguage
    sources: list[AnswerSource]


class ClaudeDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: AnswerStatus
    answer: str = Field(max_length=4000)
    source_ids: list[str] = Field(max_length=5)
