from typing import Union
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except Exception:  # pragma: no cover
    load_dotenv = None

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load local .env files if available (repo root and backend/.env) BEFORE importing routers/services
def _manual_load_env(env_path: Path) -> None:
    try:
        if not env_path.exists():
            return
        with env_path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    os.environ.setdefault(key, val)
    except Exception:
        # silent fallback
        pass

try:
    # Repo root .env
    _root_env = Path(__file__).resolve().parent.parent / ".env"
    # backend/.env
    _backend_env = Path(__file__).resolve().parent / ".env"

    if load_dotenv:
        if _root_env.exists():
            load_dotenv(_root_env)
        if _backend_env.exists():
            load_dotenv(_backend_env)
    else:
        # Fallback minimal parser if python-dotenv isn't installed
        _manual_load_env(_root_env)
        _manual_load_env(_backend_env)
except Exception:
    # Non-fatal if dotenv load fails
    pass

from api.handlers import router as api_router


app = FastAPI(
    title="Dumpy Backend API",
    description="AI-powered slideshow generation service",
    version="1.0.0",
)

# Configure CORS for frontend dev (Expo/web)
_cors_env = os.getenv("CORS_ORIGINS", os.getenv("CORS_ALLOW_ORIGINS", ""))
if _cors_env.strip() == "*":
    _allow_origins = ["*"]
else:
    _allow_origins = [
        "http://localhost:8081",  # Expo web
        "http://127.0.0.1:8081",
        "http://localhost:19006",  # Expo web (alt)
        "http://localhost:19000",  # Expo dev tools
    ]
    extra = [o.strip() for o in _cors_env.split(",") if o.strip()]
    _allow_origins.extend(extra)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# include the API router (enroll/identify)
app.include_router(api_router, prefix="/api")


@app.get("/")
def read_root():
    return {"message": "Dumpy Backend API", "status": "running"}


@app.get("/items/{item_id}")
def read_item(item_id: int, q: Union[str, None] = None):
    return {"item_id": item_id, "q": q}