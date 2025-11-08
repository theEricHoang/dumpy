from fastapi import APIRouter, HTTPException, Header, UploadFile, File
from typing import Optional
import os
import httpx

from .schemas import SlideshowRequest, SlideshowResponse, CaptionRequest, CaptionResponse
from services.caption_service import generate_caption
from ..services import face_embedding_service as emb

router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

@router.post("/slideshow/generate", response_model=SlideshowResponse)
async def generate_slideshow(
    request: SlideshowRequest,
    authorization: Optional[str] = Header(None)
):
    """
    Generate a slideshow video from event images with AI-powered captions and music.
    """
    # Extract event details from request
    event_id = request.event_id
    music_choice = request.music_choice
    theme_prompt = request.theme_prompt

    # Placeholder user extraction
    user_id = "placeholder_user_id"

    # Placeholder image URLs (replace with actual storage fetching)
    image_urls = [
        f"https://placeholder.blob.core.windows.net/event-{event_id}/image1.jpg",
        f"https://placeholder.blob.core.windows.net/event-{event_id}/image2.jpg",
        f"https://placeholder.blob.core.windows.net/event-{event_id}/image3.jpg",
    ]

    # Placeholder face detection/captions/music pipeline
    captions = [
        {"image_url": image_urls[0], "caption": f"A wonderful moment - {theme_prompt}"},
        {"image_url": image_urls[1], "caption": f"Beautiful memories - {theme_prompt}"},
        {"image_url": image_urls[2], "caption": f"Peaceful scenery - {theme_prompt}"}
    ]

    music_url = music_choice or f"https://placeholder-music.com/generated/{event_id}.mp3"
    slideshow_url = f"https://placeholder-videos.com/slideshow/{event_id}.mp4"

    return SlideshowResponse(
        status="success",
        message="Slideshow generation completed successfully",
        slideshow_url=slideshow_url,
        job_id=f"job_{event_id}"
    )

@router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "slideshow-api"}

@router.post("/face/detect_local")
async def detect_local(file: UploadFile = File(...)):
    """Detect faces locally (MTCNN) returning boxes + probabilities."""
    content = await file.read()
    try:
        return await emb.detect_faces_local(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/face/enroll_local")
async def enroll_local(user_id: str, file: UploadFile = File(...)):
    """Enroll a local embedding for a user (no Azure PersonGroup required)."""
    content = await file.read()
    try:
        result = await emb.enroll_local(user_id=user_id, image_bytes=content)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/face/identify_local")
async def identify_local(file: UploadFile = File(...), top_k: int = 3, threshold: float = 0.6):
    """Identify a face against locally stored embeddings using cosine similarity."""
    content = await file.read()
    try:
        result = await emb.identify_local(image_bytes=content, top_k=top_k, threshold=threshold)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

