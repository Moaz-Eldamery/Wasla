from fastapi import FastAPI

from app.admin_chatbot.router import router as admin_chatbot_router

app = FastAPI(title="Wasla AI service")
app.include_router(admin_chatbot_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
