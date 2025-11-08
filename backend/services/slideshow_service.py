from typing import Dict
from api.schemas import SlideshowRequest
from .music_service import generate_music
from .azure_service import upload_video_to_blob_storage, save_slideshow_to_database
import os

# in memory job status store
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
