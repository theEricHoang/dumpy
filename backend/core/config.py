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
    # Azure Storage (for profile pictures)
    AZURE_STORAGE_CONNECTION_STRING: Optional[str] = None
    AZURE_STORAGE_ACCOUNT: Optional[str] = None  # Optional if using connection string only
    AZURE_STORAGE_PROFILE_PICS_CONTAINER: str = "profile-pics"
    AZURE_STORAGE_ACCOUNT_KEY: Optional[str] = None  # If not using connection string, provide account key
    # Compatibility / overrides with other modules
    AZURE_STORAGE_CONTAINER: Optional[str] = None  # fallback container name used elsewhere
    PROFILE_PIC_URL_COLUMN: Optional[str] = None  # override column name if not 'profile_pic_url'
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