from core.config import settings
from typing import Optional
from azure.storage.blob import BlobServiceClient
from supabase import create_client, Client
from datetime import datetime
import uuid

# Initialize Supabase client
supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SERVICE_ROLE_KEY
)

async def upload_video_to_blob_storage(video_path: str, event_id: str) -> str:
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
    if not settings.AZURE_STORAGE_CONNECTION_STRING:
        raise RuntimeError("AZURE_STORAGE_CONNECTION_STRING not configured")
    
    try:
        # Initialize blob service client
        blob_service_client = BlobServiceClient.from_connection_string(
            settings.AZURE_STORAGE_CONNECTION_STRING
        )
        
        # Get container client (create container if it doesn't exist)
        container_client = blob_service_client.get_container_client(settings.AZURE_STORAGE_CONTAINER)
        
        if not container_client.exists():
            print(f"[AzureService] Creating container: {settings.AZURE_STORAGE_CONTAINER}")
            container_client.create_container()
        
        # Generate unique blob name
        blob_name = f"events/{event_id}/slideshow_{uuid.uuid4().hex[:8]}.mp4"
        blob_client = container_client.get_blob_client(blob_name)
        
        print(f"[AzureService] Uploading video to blob: {blob_name}")
        
        # Upload video file
        with open(video_path, "rb") as video_file:
            blob_client.upload_blob(video_file, overwrite=True)
        
        blob_url = blob_client.url
        print(f"[AzureService] Successfully uploaded video to: {blob_url}")
        
        return blob_url
    
    except Exception as e:
        raise RuntimeError(f"Failed to upload video to Azure Blob Storage: {str(e)}")


async def save_slideshow_to_database(
    event_id: str,
    user_id: str,
    slideshow_url: str,
    theme_prompt: str,
    music_choice: Optional[str],
    duration_seconds: int
) -> str:
    """
    Save slideshow metadata to Supabase.
    
    Args:
        event_id: The event this slideshow belongs to
        user_id: The user who created the slideshow
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
            "user_id": user_id,
            "slideshow_url": slideshow_url,
            "theme_prompt": theme_prompt,
            "music_choice": music_choice,
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
