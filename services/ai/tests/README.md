# AI service tests

Tests for the AI service, including the chatbot's 100-question test set and the AI release gates. Run with `uv run pytest` from `services/ai`.

## Files

- `test_health.py`: `GET /health` answers ok.
- Planned: the chatbot test set and release gates (KAN-33, KAN-48, KAN-50).
