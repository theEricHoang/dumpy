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
from services.caption_service import generate_caption
from services.music_service import generate_music
from services.azure_service import upload_video_to_blob_storage, save_slideshow_to_database
# from services.slideshow_service import create_slideshow

router = APIRouter()
supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SERVICE_ROLE_KEY
)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# In-memory job status storage (will be replaced with Supabase later)
job_status_store: Dict[str, dict] = {}

async def process_slideshow(job_id: str, request: SlideshowRequest, user_id: str):
    """
    Background task to process slideshow generation with stage-based status updates.
    """
    try:
        event_id = request.event_id
        music_choice = request.music_choice
        theme_prompt = request.theme_prompt
        
        # Stage 1: Fetching images
        job_status_store[job_id] = {
            "status": "processing",
            "message": "Fetching images from event...",
            "slideshow_url": None,
            "error": None
        }
        print(f"[JOB {job_id}] Stage 1: Fetching images")
        
        # TODO: Replace with actual image fetching logic from your teammate
        # Example:
        # images = await fetch_images_from_event(event_id)
        image_urls = [
            f"https://placeholder.blob.core.windows.net/event-{event_id}/image1.jpg",
            f"https://placeholder.blob.core.windows.net/event-{event_id}/image2.jpg",
            f"https://placeholder.blob.core.windows.net/event-{event_id}/image3.jpg",
        ]  # PLACEHOLDER
        print(f"[JOB {job_id}] Fetched {len(image_urls)} images")
        
        # Stage 2: Generating captions
        job_status_store[job_id]["message"] = "Generating captions for images..."
        print(f"[JOB {job_id}] Stage 2: Generating captions")
        
        # TODO: Replace with actual caption generation logic from your teammate
        # This should take the images with their tagged users and generate captions
        # Example:
        # captions = await generate_captions(event_id, theme_prompt)
        captions = [
            {"image_url": image_urls[0], "caption": f"A wonderful moment - {theme_prompt}"},
            {"image_url": image_urls[1], "caption": f"Beautiful memories - {theme_prompt}"},
            {"image_url": image_urls[2], "caption": f"Peaceful scenery - {theme_prompt}"}
        ]  # PLACEHOLDER
        print(f"[JOB {job_id}] Generated {len(captions)} captions")
        
        # Stage 3: Generating music
        job_status_store[job_id]["message"] = "Generating music..."
        print(f"[JOB {job_id}] Stage 3: Generating music")
        
        music_data = None
        if music_choice:
            # Music was pre-selected by user
            music_data = {"file_path": music_choice}  # Assuming music_choice is a URL/path
            print(f"[JOB {job_id}] Using pre-selected music: {music_choice}")
        else:
            # Generate music based on theme_prompt
            try:
                music_data = await generate_music(theme_prompt, duration=30)
                print(f"[JOB {job_id}] Generated music: {music_data.get('file_path')}")
            except Exception as e:
                print(f"[JOB {job_id}] WARNING: Failed to generate music: {str(e)}")
                # Continue without music rather than failing the entire request
                music_data = None
        
        # Stage 4: Creating video
        job_status_store[job_id]["message"] = "Creating slideshow video..."
        print(f"[JOB {job_id}] Stage 4: Creating video")
        
        # TODO: Replace with actual slideshow creation logic
        # Example:
        # slideshow_result = await create_slideshow(
        #     images=image_urls,
        #     captions=captions,
        #     music_data=music_data,
        #     theme_prompt=theme_prompt
        # )
        # local_video_path = slideshow_result["video_path"]
        # duration_seconds = slideshow_result["duration"]
        
        local_video_path = "/tmp/slideshow_temp.mp4"  # PLACEHOLDER
        duration_seconds = 30  # PLACEHOLDER
        print(f"[JOB {job_id}] Video created locally: {local_video_path}")
        
        # Cleanup temporary music file if generated
        if music_data and "file_path" in music_data and music_data["file_path"].startswith("/tmp"):
            try:
                os.remove(music_data["file_path"])
                print(f"[JOB {job_id}] Cleaned up temporary music file")
            except Exception as e:
                print(f"[JOB {job_id}] WARNING: Failed to cleanup music file: {str(e)}")
        
        # Stage 5: Uploading to blob storage
        job_status_store[job_id]["message"] = "Uploading slideshow to storage..."
        print(f"[JOB {job_id}] Stage 5: Uploading to blob storage")
        
        slideshow_url = await upload_video_to_blob_storage(local_video_path, event_id)
        print(f"[JOB {job_id}] Uploaded to: {slideshow_url}")
        
        # Cleanup local video file
        # TODO: Uncomment when actual video is being generated
        # try:
        #     os.remove(local_video_path)
        #     print(f"[JOB {job_id}] Cleaned up temporary video file")
        # except Exception as e:
        #     print(f"[JOB {job_id}] WARNING: Failed to cleanup video file: {str(e)}")
        
        # Stage 6: Saving to database
        job_status_store[job_id]["message"] = "Saving slideshow metadata..."
        print(f"[JOB {job_id}] Stage 6: Saving to database")
        
        slideshow_id = await save_slideshow_to_database(
            event_id=event_id,
            user_id=user_id,
            slideshow_url=slideshow_url,
            theme_prompt=theme_prompt,
            music_choice=music_choice,
            duration_seconds=duration_seconds
        )
        print(f"[JOB {job_id}] Saved to database with ID: {slideshow_id}")
        
        # Mark as completed
        job_status_store[job_id] = {
            "status": "completed",
            "message": "Slideshow ready!",
            "slideshow_url": slideshow_url,
            "error": None
        }
        print(f"[JOB {job_id}] Completed successfully")
        
    except Exception as e:
        # Mark as failed
        job_status_store[job_id] = {
            "status": "failed",
            "message": "Failed to generate slideshow",
            "slideshow_url": None,
            "error": str(e)
        }
        print(f"[JOB {job_id}] Failed with error: {str(e)}")


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


