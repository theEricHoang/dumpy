from fastapi import APIRouter, HTTPException, Header, UploadFile, File, BackgroundTasks
from typing import Optional, Dict
from supabase import create_client, Client
import os
import httpx
import uuid
from datetime import datetime

from api.schemas import SlideshowRequest, SlideshowResponse, SlideshowStatusResponse

# TODO: Import services once implemented
from core.config import settings
from services import face_embedding_service as emb
from services.slideshow_service import job_status_store, process_slideshow
from services.caption_service import generate_caption

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
    background_tasks: BackgroundTasks,
    authorization: Optional[str] = Header(None)
):
    """
    Generate a slideshow video from event images with AI-powered captions and music.
    Returns immediately with a job_id for tracking progress.
    """
    # Generate unique job ID
    job_id = f"job_{uuid.uuid4().hex[:12]}"
    
    # TODO: Extract user ID from authorization header (Supabase JWT)
    user_id = "placeholder_user_id"  # PLACEHOLDER
    
    # Initialize job status
    job_status_store[job_id] = {
        "status": "processing",
        "message": "Starting slideshow generation...",
        "slideshow_url": None,
        "error": None
    }
    
    # Start background processing
    background_tasks.add_task(process_slideshow, job_id, request, user_id)
    
    print(f"[JOB {job_id}] Started for event {request.event_id}")
    
    return SlideshowResponse(
        status="processing",
        message="Slideshow generation started! Use the job_id to check status.",
        job_id=job_id
    )


@router.get("/slideshow/status/{job_id}", response_model=SlideshowStatusResponse)
async def get_slideshow_status(job_id: str):
    """
    Get the current status of a slideshow generation job.
    Frontend should poll this endpoint every 5 seconds.
    """
    if job_id not in job_status_store:
        raise HTTPException(status_code=404, detail="Job not found")
    
    status = job_status_store[job_id]
    return SlideshowStatusResponse(**status)

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

@router.post("/face/enroll_local_batch")
async def enroll_local_batch(user_id: int, files: list[UploadFile] = File(...)):
    """Enroll multiple images for a user; skips images with no detectable face."""
    contents: list[bytes] = []
    for f in files:
        contents.append(await f.read())
    try:
        result = await emb.enroll_local_batch(user_id=user_id, images=contents)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/face/identify_local")
async def identify_local(file: UploadFile = File(...), top_k: int = 3, threshold: float = 0.6, filter_matches: bool = False, auto_enroll_on_identify: bool = False, auto_enroll_min_similarity: float = 0.85):
    """Identify a face against locally stored embeddings using cosine similarity."""
    content = await file.read()
    try:
        result = await emb.identify_local(
            image_bytes=content,
            top_k=top_k,
            threshold=threshold,
            filter_matches=filter_matches,
            auto_enroll_on_identify=auto_enroll_on_identify,
            auto_enroll_min_similarity=auto_enroll_min_similarity,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/face/identify_multi_local")
async def identify_multi_local(file: UploadFile = File(...), top_k_per_face: int = 3, threshold: float = 0.6, filter_matches: bool = False, min_prob: float = 0.0, auto_enroll_on_identify: bool = False, auto_enroll_min_similarity: float = 0.85, exclusive_assignment: bool = False):
    """Identify all faces in an image against locally stored embeddings; returns results per face."""
    content = await file.read()
    try:
        result = await emb.identify_multi_local(
            image_bytes=content,
            top_k_per_face=top_k_per_face,
            threshold=threshold,
            filter_matches=filter_matches,
            min_prob=min_prob,
            auto_enroll_on_identify=auto_enroll_on_identify,
            auto_enroll_min_similarity=auto_enroll_min_similarity,
            exclusive_assignment=exclusive_assignment,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/face/identify_local_grouped")
async def identify_local_grouped(file: UploadFile = File(...), top_k: int = 3, threshold: float = 0.6, filter_matches: bool = False, auto_enroll_on_identify: bool = False, auto_enroll_min_similarity: float = 0.85):
    """Identify using grouped embeddings (max similarity per user)."""
    content = await file.read()
    try:
        result = await emb.identify_local_grouped(
            image_bytes=content,
            top_k=top_k,
            threshold=threshold,
            filter_matches=filter_matches,
            auto_enroll_on_identify=auto_enroll_on_identify,
            auto_enroll_min_similarity=auto_enroll_min_similarity,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/face/identify_multi_local_grouped")
async def identify_multi_local_grouped(file: UploadFile = File(...), top_k_per_face: int = 3, threshold: float = 0.6, filter_matches: bool = False, min_prob: float = 0.0, auto_enroll_on_identify: bool = False, auto_enroll_min_similarity: float = 0.85, exclusive_assignment: bool = False):
    """Multi-face identification with per-user grouped similarity aggregation."""
    content = await file.read()
    try:
        result = await emb.identify_multi_local_grouped(
            image_bytes=content,
            top_k_per_face=top_k_per_face,
            threshold=threshold,
            filter_matches=filter_matches,
            min_prob=min_prob,
            auto_enroll_on_identify=auto_enroll_on_identify,
            auto_enroll_min_similarity=auto_enroll_min_similarity,
            exclusive_assignment=exclusive_assignment,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/face/auto_enroll")
async def auto_enroll(file: UploadFile = File(...), min_similarity: float = 0.8, min_prob: float = 0.0):
    """Automatically enroll a face if exactly one face and similarity is confident."""
    content = await file.read()
    try:
        result = await emb.auto_enroll_if_confident(image_bytes=content, min_similarity=min_similarity, min_prob=min_prob)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


