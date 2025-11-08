from pydantic_settings import BaseSettings
from typing import Optional
import os

class Settings(BaseSettings):
    AZURE_OPENAI_API_KEY: str = ''
    AZURE_OPENAI_ENDPOINT: str = ''
    AZURE_OPENAI_DEPLOYMENT: str = ''

    AZURE_STORAGE_ACCOUNT: str = os.getenv("AZURE_STORAGE_ACCOUNT", "")
    AZURE_STORAGE_KEY: str = os.getenv("AZURE_STORAGE_KEY", "")
    CONTAINER_NAME: str = os.getenv("CONTAINER_NAME", "event-media")

    SUPABASE_URL: Optional[str] = None
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None
    SUPABASE_KEY: Optional[str] = None  # legacy / anon key (read-mostly)
    SUPABASE_API_KEY: Optional[str] = None  # alternative naming
    REPLICATE_API_TOKEN: Optional[str] = None

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