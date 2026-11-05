# Build context: the repo root (see docker-compose.yml).
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.12.3 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY services/ai/pyproject.toml services/ai/uv.lock services/ai/.python-version ./
RUN uv sync --locked --no-dev --no-install-project
COPY services/ai/app ./app
RUN useradd --create-home --uid 1000 wasla
USER wasla
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
