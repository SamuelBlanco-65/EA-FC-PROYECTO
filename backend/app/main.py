from fastapi import FastAPI

from app.api import health

app = FastAPI(title="EA FC Tournament API")
app.include_router(health.router)
