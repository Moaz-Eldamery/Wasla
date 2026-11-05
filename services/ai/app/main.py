from fastapi import FastAPI

app = FastAPI(title="Wasla AI service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
