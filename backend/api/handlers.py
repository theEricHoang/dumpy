from fastapi import APIRouter, HTTPException, Header, UploadFile, File
from pydantic import BaseModel
from typing import Optional, Dict
from supabase import create_client, Client
import os
import httpx
import uuid
import asyncio
from datetime import datetime

from api.schemas import SlideshowRequest, SlideshowResponse, SlideshowStatusResponse

# TODO: Import services once implemented
from core.config import settings
from services import face_embedding_service as emb
from services.slideshow_service import job_status_store, process_slideshow
from services.caption_service import (
    generate_caption,
    fetch_event_media_mapping,
    generate_event_captions_batch
)
from services.caption_service import generate_caption
from services.azure_blob_service import upload_profile_image
from services.music_service import generate_music
# from services.slideshow_service import create_slideshow

router = APIRouter()
supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SERVICE_ROLE_KEY
)


SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


from azure.storage.blob import generate_blob_sas, BlobSasPermissions
from datetime import datetime, timedelta

@router.post("/getUploadUrl")
async def get_upload_url(file_name: str):
    """
    Generate a temporary SAS URL for uploading media directly to Azure Blob Storage.
    """
    try:
        account_name = os.getenv("AZURE_STORAGE_ACCOUNT")
        account_key = os.getenv("AZURE_STORAGE_KEY")
        container_name = os.getenv("CONTAINER_NAME", "event-media")

        sas_token = generate_blob_sas(
            account_name=account_name,
            container_name=container_name,
            blob_name=file_name,
            account_key=account_key,
            permission=BlobSasPermissions(write=True),
            expiry=datetime.utcnow() + timedelta(hours=1)
        )

        upload_url = f"https://{account_name}.blob.core.windows.net/{container_name}/{file_name}?{sas_token}"

        return {"upload_url": upload_url}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




@router.post("/slideshow/generate", response_model=SlideshowResponse)
async def generate_slideshow(
    request: SlideshowRequest,
    authorization: Optional[str] = Header(None)
):
    """
    Generate a slideshow video from event images with AI-powered captions and music.
    Returns immediately with a job_id for tracking progress.
    """
    # Generate unique job ID
    job_id = f"job_{uuid.uuid4().hex[:12]}"
    
    # TODO: Extract user ID from authorization header (Supabase JWT)
    user_id = 1  # PLACEHOLDER - should be extracted from JWT token
    
    # Initialize job status
    job_status_store[job_id] = {
        "status": "processing",
        "message": "Starting slideshow generation...",
        "slideshow_url": None,
        "error": None
    }
    
    # Start background processing using asyncio.create_task for true non-blocking execution
    asyncio.create_task(process_slideshow(job_id, request, user_id))
    
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


@router.post("/upload/profile-picture")
async def upload_profile_picture(file: UploadFile = File(...)):
    """Accept a single image, upload to Azure Blob, and return its URL.

    Frontend should then update Supabase users.profile_pic_url using anon key (subject to RLS).
    """
    try:
        content = await file.read()
        content_type = file.content_type or "image/jpeg"
        url = upload_profile_image(content, content_type)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"upload_failed: {str(e)}")


def _sanitize_username(base: str) -> str:
    import re
    cleaned = re.sub(r"[^a-zA-Z0-9._-]", "", base)
    return cleaned or "user"


@router.post("/users/profile-picture")
async def set_profile_picture(body: ProfilePicUpdate):
    """Service-role write: set profile_pic_url for a user (create row if needed).

    This bypasses client-side RLS by using the service role key. If the row doesn't
    exist, we'll insert with a safe username (adding a short suffix if the username
    is already taken).
    """
    try:
        email = body.email.strip().lower()
        url = body.url
        desired_username = _sanitize_username(body.username or email.split("@")[0])

        # Use the explicitly configured column or default to 'profile_pic_url'
        pic_col = getattr(settings, "PROFILE_PIC_URL_COLUMN", None) or "profile_pic_url"
        print(f"[profile-picture] Using column '{pic_col}' for profile picture update")

        # 1) Find existing row by email (prefer latest)
        sel = supabase.table("users").select(f"user_id, email, username, {pic_col}").eq("email", email).order("user_id", desc=True).limit(1).execute()
        print(f"[profile-picture] BEFORE rows for email={email}: {sel.data}")
        rows = sel.data or []
        if rows:
            user_id = rows[0]["user_id"]
            upd = supabase.table("users").update({pic_col: url}, returning="representation").eq("user_id", user_id).execute()
            print(f"[profile-picture] UPDATE error={getattr(upd,'error',None)} data={getattr(upd,'data',None)}")
            if getattr(upd, "error", None):
                raise HTTPException(status_code=400, detail=str(upd.error))
            data = (getattr(upd, "data", None) or [])
            if not data:
                # Likely RLS blocked or no rows matched; attempt upsert fallback
                print("[profile-picture] UPDATE returned empty data; attempting UPSERT fallback")
                payload = {"email": email, "username": rows[0].get("username") or desired_username, "password": "***", pic_col: url}
                up = supabase.table("users").upsert(payload, on_conflict="email", returning="representation").execute()
                print(f"[profile-picture] UPSERT fallback error={getattr(up,'error',None)} data={getattr(up,'data',None)}")
                if getattr(up, "error", None):
                    raise HTTPException(status_code=400, detail=str(up.error))
                data = (getattr(up, "data", None) or [])
            if not data:
                raise HTTPException(status_code=400, detail="update_failed_empty_result (check RLS policies and service role key)")
            out = data[0]
            out["profile_pic_url"] = out.get(pic_col)
            return out

        # 2) Insert new row; handle username unique collisions by appending suffix
        def _try_upsert(name: str):
            payload = {"email": email, "username": name, "password": "***", pic_col: url}
            print(f"[profile-picture] UPSERT attempt payload={payload}")
            res = supabase.table("users").upsert(payload, on_conflict="email", returning="representation").execute()
            print(f"[profile-picture] UPSERT response error={getattr(res,'error',None)} data={getattr(res,'data',None)}")
            return res

        ins = _try_upsert(desired_username)
        if getattr(ins, "error", None):
            msg = str(ins.error)
            if "duplicate key" in msg or "unique constraint" in msg:
                import hashlib
                suffix = hashlib.sha1(email.encode("utf-8")).hexdigest()[:8]
                ins = _try_upsert(f"{desired_username}_{suffix}")
                if getattr(ins, "error", None):
                    raise HTTPException(status_code=400, detail=str(ins.error))
            else:
                raise HTTPException(status_code=400, detail=msg)

        # Re-select to get user_id
        # final verify: include all potential columns
        sel2 = supabase.table("users").select(f"user_id, email, username, {pic_col}").eq("email", email).order("user_id", desc=True).limit(1).execute()
        print(f"[profile-picture] POST-INSERT verify email={email}: {sel2.data}")
        rows2 = sel2.data or []
        if not rows2:
            raise HTTPException(status_code=500, detail="user_insert_verify_failed")
        final = rows2[0]
        final["profile_pic_url"] = final.get(pic_col)
        return final
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"set_profile_picture_failed: {str(e)}")

@router.get("/event/{event_id}/media-mapping")
async def get_event_media_mapping_endpoint(event_id: int):
    """
    Fetch all media and tagged users for an event for caption generation.
    """
    try:
        media_items = await fetch_event_media_mapping(event_id)
        return media_items
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.post("/event/{event_id}/generate-captions")
async def generate_event_captions_endpoint(event_id: int, theme: str = "playful"):
    """
    Generate captions for all media in an event using tagged user names and metadata.
    """
    try:
        # Use the caption service function
        captions = await generate_event_captions_batch(
            event_id=event_id,
            theme=theme,
            update_database=True
        )
        
        # Fetch media items again to get media_ids for response
        media_items = await fetch_event_media_mapping(event_id)
        
        # Build detailed response matching original format
        generated_captions = []
        for media, caption_data in zip(media_items, captions):
            tagged_users = [u["username"] for u in (media.get("tagged_users") or [])]
            generated_captions.append({
                "media_id": media["media_id"],
                "file_url": caption_data["image_url"],
                "ai_caption": caption_data["caption"],
                "tagged_users": tagged_users
            })
        
        return {
            "status": "success",
            "event_id": event_id,
            "captions_generated": len(generated_captions),
            "captions": generated_captions
        }
    
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

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


