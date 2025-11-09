from core.config import settings
from typing import Optional
from azure.storage.blob import (
    BlobServiceClient,
    ContentSettings,
    generate_blob_sas,
    BlobSasPermissions,
)
from supabase import create_client, Client
from datetime import datetime, timedelta
import uuid
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Initialize Supabase client
supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SERVICE_ROLE_KEY,
)

# Thread pool for blocking Azure operations
_executor = ThreadPoolExecutor(max_workers=2)

# --- Unified Azure Blob helper state (merged from azure_blob_service) ---
_blob_client: Optional[BlobServiceClient] = None


def get_blob_service() -> BlobServiceClient:
    """Return a cached BlobServiceClient.

    Prefers connection string; falls back to account name + key.
    Raises RuntimeError if configuration is insufficient.
    """
    global _blob_client
    if _blob_client is not None:
        return _blob_client
    if settings.AZURE_STORAGE_CONNECTION_STRING:
        _blob_client = BlobServiceClient.from_connection_string(
            settings.AZURE_STORAGE_CONNECTION_STRING
        )
    else:
        if not settings.AZURE_STORAGE_ACCOUNT or not settings.AZURE_STORAGE_ACCOUNT_KEY:
            raise RuntimeError(
                "Provide either AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT + AZURE_STORAGE_ACCOUNT_KEY"
            )
        _blob_client = BlobServiceClient(
            account_url=f"https://{settings.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net",
            credential=settings.AZURE_STORAGE_ACCOUNT_KEY,
        )
    return _blob_client


def ensure_container(container_name: str) -> None:
    """Create container if it doesn't exist (ignore exists errors)."""
    svc = get_blob_service()
    try:
        svc.create_container(container_name)
    except Exception:
        pass  # already exists


def upload_profile_image(content: bytes, content_type: str = "image/jpeg") -> str:
    """Upload raw image bytes to a profile pics container and return a URL (with SAS if private)."""
    container = (
        settings.AZURE_STORAGE_PROFILE_PICS_CONTAINER
        or settings.AZURE_STORAGE_CONTAINER
        or "profile-pics"
    )
    ensure_container(container)

    svc = get_blob_service()
    container_client = svc.get_container_client(container)

    ts = datetime.utcnow().strftime("%Y%m%dT%H%M%S")
    blob_name = f"{ts}-{uuid.uuid4().hex}.jpg"
    blob_client = container_client.get_blob_client(blob_name)
    blob_client.upload_blob(
        content,
        overwrite=False,
        content_settings=ContentSettings(content_type=content_type),
    )

    base_url = blob_client.url

    # Attempt to obtain account key for SAS generation
    account_key = settings.AZURE_STORAGE_ACCOUNT_KEY
    account_name = get_blob_service().account_name
    if not account_key and settings.AZURE_STORAGE_CONNECTION_STRING:
        try:
            parts = dict(
                p.split("=", 1)
                for p in settings.AZURE_STORAGE_CONNECTION_STRING.split(";")
                if "=" in p
            )
            account_key = parts.get("AccountKey")
        except Exception:
            account_key = None

    if account_key:
        try:
            sas = generate_blob_sas(
                account_name=account_name,
                container_name=container,
                blob_name=blob_name,
                account_key=account_key,
                permission=BlobSasPermissions(read=True),
                expiry=datetime.utcnow() + timedelta(days=7),
            )
            return f"{base_url}?{sas}"
        except Exception:
            return base_url
    return base_url

async def upload_video_to_blob_storage(video_path: str, event_id: int) -> str:
    """
    Upload video file to Azure Blob Storage.
    
    Args:
        video_path: Local path to the video file
        event_id: Event ID for organizing blobs
    
    Returns:
        Public URL to the uploaded blob
    
    Raises:
        RuntimeError: If upload fails
    """
    if not (settings.AZURE_STORAGE_CONNECTION_STRING or (settings.AZURE_STORAGE_ACCOUNT and settings.AZURE_STORAGE_ACCOUNT_KEY)):
        raise RuntimeError("Azure Storage configuration not provided")

    try:
        ensure_container(settings.AZURE_STORAGE_CONTAINER)
        container_client = get_blob_service().get_container_client(
            settings.AZURE_STORAGE_CONTAINER
        )
        blob_name = f"events/{event_id}/slideshow_{uuid.uuid4().hex[:8]}.mp4"
        blob_client = container_client.get_blob_client(blob_name)
        print(f"[AzureService] Uploading video to blob: {blob_name}")
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            _executor,
            lambda: blob_client.upload_blob(open(video_path, "rb"), overwrite=True),
        )
        blob_url = blob_client.url
        print(f"[AzureService] Successfully uploaded video to: {blob_url}")
        return blob_url
    except Exception as e:
        raise RuntimeError(
            f"Failed to upload video to Azure Blob Storage: {str(e)}"
        )


async def save_slideshow_to_database(
    event_id: int,
    user_id: int,
    slideshow_url: str,
    theme_prompt: str,
    music_choice: Optional[str],
    duration_seconds: int
) -> str:
    """
    Save slideshow metadata to Supabase.
    
    Args:
        event_id: The event this slideshow belongs to (integer)
        user_id: The user who created the slideshow (integer)
        slideshow_url: Azure Blob Storage URL to the video
        theme_prompt: The theme used for caption generation
        music_choice: Pre-selected music or None if AI-generated
        duration_seconds: Video duration in seconds
    
    Returns:
        The slideshow ID from the database
    
    Raises:
        RuntimeError: If database insert fails
    """
    try:
        print(f"[AzureService] Saving slideshow metadata to database...")
        
        result = supabase.table("slideshows").insert({
            "event_id": event_id,
            "slideshow_url": slideshow_url,
            "theme_prompt": theme_prompt,
            "duration_seconds": duration_seconds,
            "status": "completed",
            "created_at": datetime.now().isoformat()
        }).execute()
        
        if not result.data or len(result.data) == 0:
            raise RuntimeError("Database insert returned no data")
        
        slideshow_id = result.data[0]["id"]
        print(f"[AzureService] Successfully saved slideshow to database:")
        print(f"  - Slideshow ID: {slideshow_id}")
        print(f"  - Event ID: {event_id}")
        print(f"  - Duration: {duration_seconds}s")
        
        return slideshow_id
    
    except Exception as e:
        raise RuntimeError(f"Failed to save slideshow to database: {str(e)}")
