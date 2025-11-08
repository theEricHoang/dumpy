from typing import Union

from fastapi import FastAPI
from api.handlers import router as slideshow_router

app = FastAPI(
    title="Dumpy Backend API",
    description="AI-powered slideshow generation service",
    version="1.0.0"
)

# Include routers
app.include_router(slideshow_router, prefix="/api", tags=["slideshow"])


@app.get("/")
def read_root():
    return {"message": "Dumpy Backend API", "status": "running"}


@app.get("/items/{item_id}")
def read_item(item_id: int, q: Union[str, None] = None):
    return {"item_id": item_id, "q": q}