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

class CaptionRequest(BaseModel):
    image_url: str
    album: str
    captured_at: str
    people_present: Optional[list[str]] = []
    tags: Optional[list[str]] = []
    recent_story: Optional[list[str]] = []
    style: Optional[str] = "playful"

class CaptionResponse(BaseModel):
    caption: str