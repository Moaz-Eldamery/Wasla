# AI service tests

Tests for the AI service. Run with `uv run pytest` from `services/ai`.

## Files

- `test_health.py`: `GET /health` answers ok.
- `test_chatbot_mock_integration.py`: the FastAPI chatbot route, retrieval orchestration,
  source attribution, language handling, and no-information fallback with test-only mocks.
- `mock_chatbot_http_app.py`: local-only FastAPI fixture used by the Core-to-AI integration
  test. It uses in-memory retrieval, Gemini, and Claude mocks and is not included in the
  runtime Docker image.
- Planned: the chatbot test set and release gates (KAN-33, KAN-48, KAN-50).
