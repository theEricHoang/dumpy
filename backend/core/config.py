from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    AZURE_OPENAI_API_KEY: str
    AZURE_OPENAI_ENDPOINT: str
    AZURE_OPENAI_DEPLOYMENT: str
    SUPABASE_URL: Optional[str] = None
    SUPABASE_API_KEY: Optional[str] = None

    class Config:
        env_file = ".env"

settings = Settings()