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
    SUPABASE_API_KEY: Optional[str] = None  # alternative naming
    REPLICATE_API_TOKEN: Optional[str] = None
    AZURE_STORAGE_CONNECTION_STRING: Optional[str] = None
    AZURE_STORAGE_CONTAINER: str = "slideshows"

    class Config:
        env_file = ".env"
        extra = "ignore"  # Ignore extra fields in .env

settings = Settings()

# Backwards compatibility: prioritize keys in this order
if not settings.SUPABASE_SERVICE_ROLE_KEY:
    if settings.SUPABASE_API_KEY:
        settings.SUPABASE_SERVICE_ROLE_KEY = settings.SUPABASE_API_KEY  # type: ignore
    elif settings.SUPABASE_KEY:
        settings.SUPABASE_SERVICE_ROLE_KEY = settings.SUPABASE_KEY  # type: ignore