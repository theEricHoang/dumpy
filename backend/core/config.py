from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    AZURE_OPENAI_API_KEY: str
    AZURE_OPENAI_ENDPOINT: str
    AZURE_OPENAI_DEPLOYMENT: str
    SUPABASE_URL: Optional[str] = None
    # Prefer explicit service role key name (write privileges). Keep legacy SUPABASE_KEY fallback.
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None
    SUPABASE_KEY: Optional[str] = None  # legacy / anon key (read-mostly)

    class Config:
        env_file = ".env"

settings = Settings()

# Backwards compatibility: if only SUPABASE_KEY provided, surface it via SUPABASE_SERVICE_ROLE_KEY
if not settings.SUPABASE_SERVICE_ROLE_KEY and settings.SUPABASE_KEY:
    # Avoid mutating BaseSettings internals; expose helper attribute
    settings.SUPABASE_SERVICE_ROLE_KEY = settings.SUPABASE_KEY  # type: ignore