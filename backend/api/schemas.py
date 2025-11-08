from pydantic import BaseModel
from typing import Optional


class SlideshowRequest(BaseModel):
    event_id: str
    music_choice: Optional[str] = None  # URL or ID of pre-selected music, if any
    theme_prompt: str  # e.g., "A nostalgic summer vacation"


class SlideshowResponse(BaseModel):
    status: str
    message: str
    slideshow_url: Optional[str] = None  # URL to the generated slideshow video
    job_id: Optional[str] = None  # For async processing
