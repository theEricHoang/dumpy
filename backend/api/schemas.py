from pydantic import BaseModel
from typing import Optional


class SlideshowRequest(BaseModel):
    event_id: str
    music_choice: Optional[str] = None  # URL or ID of pre-selected music, if any
    theme_prompt: str  # e.g., "A nostalgic summer vacation"


class SlideshowResponse(BaseModel):
    status: str # "processing", "completed", "failed"
    message: str
    job_id: str  # Job ID for tracking


class SlideshowStatusResponse(BaseModel):
    status: str  # "processing", "completed", "failed"
    message: str  # Current stage message
    slideshow_url: Optional[str] = None  # Only present when completed
    error: Optional[str] = None  # Only present when failed

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