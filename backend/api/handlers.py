from fastapi import APIRouter, HTTPException, Header, UploadFile, File
from typing import Optional
from supabase import create_client, Client
import os
import httpx

from api.schemas import SlideshowRequest, SlideshowResponse

# TODO: Import services once implemented
from core.config import settings
from services import face_embedding_service as emb
from services.caption_service import generate_caption
from services.music_service import generate_music
# from services.slideshow_service import create_slideshow

router = APIRouter()
supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SERVICE_ROLE_KEY
)

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
    ]  # PLACEHOLDER
    print(f"[PLACEHOLDER] Generated {len(captions)} captions with theme: {theme_prompt}")
    
    # Handle music selection or generation
    music_data = None
    if music_choice:
        # Music was pre-selected by user
        music_data = {"url": music_choice}
        print(f"Using pre-selected music: {music_choice}")
    else:
        # Generate music based on theme_prompt
        try:
            music_data = await generate_music(theme_prompt, duration=30)
            print(f"Generated music based on theme: {theme_prompt}")
        except Exception as e:
            print(f"[ERROR] Failed to generate music: {str(e)}")
            # Continue without music rather than failing the entire request
            music_data = None
    
    # TODO: Call slideshow_service to compile everything into a video
    # Example:
    # slideshow_result = await create_slideshow(
    #     images=image_urls,
    #     captions=captions,
    #     music_data=music_data,
    #     theme_prompt=theme_prompt
    # )
    # Returns: {"video_url": "https://...", "duration": 45.3}
    slideshow_url = f"https://placeholder-videos.com/slideshow/{event_id}.mp4"  # PLACEHOLDER
    print(f"[PLACEHOLDER] Slideshow compilation started")
    print(f"[PLACEHOLDER] Images: {len(image_urls)}, Captions: {len(captions)}, Music: {music_data is not None}")
    
    # TODO: Store slideshow metadata in Supabase
    # Example:
    # supabase.table("slideshows").insert({
    #     "event_id": event_id,
    #     "user_id": user_id,
    #     "video_url": slideshow_url,
    #     "theme_prompt": theme_prompt,
    #     "created_at": datetime.now().isoformat()
    # }).execute()
    
    return SlideshowResponse(
        status="success",
        message="Slideshow generation completed successfully",
        slideshow_url=slideshow_url,
        job_id=f"job_{event_id}"
    )

@router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "slideshow-api"}

@router.get("/event/{event_id}/media-mapping")
async def get_event_media_mapping(event_id: int):
    """
    Fetch all media and tagged users for an event for caption generation.
    """
    try:
        response = supabase.rpc("get_event_media_mapping", {"event_id_input": event_id}).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Event not found or no media available.")
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch media mapping: {str(e)}")
    
@router.post("/event/{event_id}/generate-captions")
async def generate_event_captions(event_id: int):
    """
    Generate captions for all media in an event using tagged user names and metadata.
    """
    try:
        # Fetch all media + tagged users
        response = supabase.rpc("get_event_media_mapping", {"event_id_input": event_id}).execute()
        media_items = response.data or []

        if not media_items:
            raise HTTPException(status_code=404, detail="Event not found or no media available.")
        
        generated_captions = []
        for media in media_items:
            tagged_users = [u["username"] for u in (media.get("tagged_users") or [])]
            file_url = media["file_url"]
            location = media.get("location", "unknown location")

            # Generate caption using Azure OpenAI service
            caption = generate_caption(
                image_url=file_url,
                tagged_names=tagged_users,
                location=location
            )

            # Update caption in Supabase
            supabase.table("media").update({"ai_caption": caption}).eq("media_id", media["media_id"]).execute()

            generated_captions.append({
                "media_id": media["media_id"],
                "file_url": file_url,
                "ai_caption": caption,
                "tagged_users": tagged_users
            })
        
        return {"status": "success", "event_id": event_id, "captions_generated": len(generated_captions), "captions": generated_captions}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate captions: {str(e)}")

@router.post("/face/detect_local")
async def detect_local(file: UploadFile = File(...)):
    """Detect faces locally (MTCNN) returning boxes + probabilities."""
    content = await file.read()
    try:
        return await emb.detect_faces_local(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/face/enroll_local")
async def enroll_local(user_id: int, file: UploadFile = File(...)):
    """Enroll a local embedding for a user using integer user_id (no Azure PersonGroup required)."""
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


@router.post("/face/identify_multi_local")
async def identify_multi_local(file: UploadFile = File(...), top_k_per_face: int = 3, threshold: float = 0.6):
    """Identify all faces in an image against locally stored embeddings; returns results per face."""
    content = await file.read()
    try:
        result = await emb.identify_multi_local(image_bytes=content, top_k_per_face=top_k_per_face, threshold=threshold)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

