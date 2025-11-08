from typing import Dict, List, Optional
from api.schemas import SlideshowRequest
from .music_service import generate_music
from .caption_service import fetch_event_media_mapping, generate_event_captions_batch
from .azure_service import upload_video_to_blob_storage, save_slideshow_to_database
import os
import ffmpeg
import uuid
import random
import httpx
from PIL import Image
import asyncio
from concurrent.futures import ThreadPoolExecutor

# in memory job status store
job_status_store: Dict[str, dict] = {}

# Thread pool for blocking operations (FFmpeg)
_executor = ThreadPoolExecutor(max_workers=2)


async def run_ffmpeg_async(stream) -> None:
    """Run FFmpeg command in thread pool to avoid blocking event loop."""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(_executor, lambda: ffmpeg.run(stream, capture_stdout=True, capture_stderr=True))


async def download_image(image_url: str, output_path: str) -> str:
    """Download image from URL to local file."""
    async with httpx.AsyncClient() as client:
        response = await client.get(image_url)
        response.raise_for_status()
        
        with open(output_path, 'wb') as f:
            f.write(response.content)
    
    return output_path


async def preprocess_image(image_path: str, output_path: str, target_width: int = 1920, target_height: int = 1080) -> str:
    """
    Preprocess image to handle different resolutions and aspect ratios.
    Resizes and pads image to target resolution while maintaining aspect ratio.
    
    Args:
        image_path: Path to source image
        output_path: Path to save processed image
        target_width: Target width
        target_height: Target height
    
    Returns:
        Path to processed image
    """
    with Image.open(image_path) as img:
        # Convert to RGB if necessary (handles RGBA, grayscale, etc.)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Calculate aspect ratios
        img_aspect = img.width / img.height
        target_aspect = target_width / target_height
        
        # Resize to fill the frame while maintaining aspect ratio
        if img_aspect > target_aspect:
            # Image is wider - fit to height
            new_height = target_height
            new_width = int(target_height * img_aspect)
        else:
            # Image is taller - fit to width
            new_width = target_width
            new_height = int(target_width / img_aspect)
        
        # Resize image
        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # Create new image with target size and black background
        processed = Image.new('RGB', (target_width, target_height), (0, 0, 0))
        
        # Paste resized image in center
        x_offset = (target_width - new_width) // 2
        y_offset = (target_height - new_height) // 2
        processed.paste(img, (x_offset, y_offset))
        
        # Save
        processed.save(output_path, 'JPEG', quality=95)
    
    return output_path


def get_ken_burns_params(duration: float) -> Dict[str, any]:
    """
    Get random Ken Burns effect parameters.
    
    Args:
        duration: Duration of the effect in seconds
    
    Returns:
        Dictionary with zoom and pan parameters
    """
    zoom_in = random.choice([True, False])
    
    return {
        "zoom_in": zoom_in,
        "zoom_start": 1.0 if zoom_in else 1.3,
        "zoom_end": 1.3 if zoom_in else 1.0,
        "duration": duration,
        "fps": 30
    }


async def create_slideshow(
    images: List[str],
    captions: List[Dict[str, str]],
    music_file_path: Optional[str] = None,
    duration_per_image: float = 4.0,
    output_path: Optional[str] = None
) -> Dict[str, any]:
    """
    Create a slideshow video with Ken Burns effects, captions, and music using ffmpeg-python.
    Handles different image resolutions and aspect ratios.
    
    Args:
        images: List of image URLs or local paths
        captions: List of dicts with 'image_url' and 'caption' keys
        music_file_path: Path to music audio file (optional)
        duration_per_image: Duration each image is shown (seconds)
        output_path: Where to save the output video (defaults to /tmp)
    
    Returns:
        Dictionary with:
        - video_path: Path to the generated video
        - duration: Total duration in seconds
        - width: Video width
        - height: Video height
    
    Raises:
        RuntimeError: If FFmpeg processing fails
    """
    
    if not images:
        raise ValueError("No images provided for slideshow")
    
    # Setup paths
    temp_dir = "/tmp/slideshow_" + uuid.uuid4().hex[:8]
    os.makedirs(temp_dir, exist_ok=True)
    
    if output_path is None:
        output_path = f"/tmp/slideshow_{uuid.uuid4().hex[:8]}.mp4"
    
    try:
        # Step 1: Download and preprocess all images
        print(f"[SLIDESHOW] Downloading and preprocessing {len(images)} images...")
        processed_images = []
        
        for idx, img_url in enumerate(images):
            # Download image
            downloaded_path = os.path.join(temp_dir, f"raw_{idx:03d}.jpg")
            if img_url.startswith("http"):
                await download_image(img_url, downloaded_path)
            else:
                # Local path - copy it
                import shutil
                shutil.copy(img_url, downloaded_path)
            
            # Preprocess to handle different resolutions/aspect ratios
            processed_path = os.path.join(temp_dir, f"processed_{idx:03d}.jpg")
            await preprocess_image(downloaded_path, processed_path)
            processed_images.append(processed_path)
        
        # Step 2: Create caption mapping
        caption_map = {c["image_url"]: c["caption"] for c in captions}
        
        # Step 3: Create video segments with Ken Burns effect and captions
        print(f"[SLIDESHOW] Creating {len(processed_images)} video segments with Ken Burns effect...")
        segment_files = []
        
        for idx, (img_path, img_url) in enumerate(zip(processed_images, images)):
            segment_path = os.path.join(temp_dir, f"segment_{idx:03d}.mp4")
            caption_text = caption_map.get(img_url, "")
            
            # Get Ken Burns parameters
            kb_params = get_ken_burns_params(duration_per_image)
            fps = kb_params["fps"]
            total_frames = int(duration_per_image * fps)
            zoom_start = kb_params["zoom_start"]
            zoom_end = kb_params["zoom_end"]
            
            # Build zoompan filter
            zoompan_filter = (
                f"zoompan=z='if(lte(zoom,1.0),{zoom_start},{zoom_start}+"
                f"(on/{total_frames})*({zoom_end}-{zoom_start}))'"
                f":d={total_frames}:s=1920x1080:fps={fps}"
            )
            
            # Escape single quotes in caption
            safe_caption = caption_text.replace("'", "\\'").replace(":", "\\:")
            
            # Build drawtext filter for caption
            drawtext_filter = (
                f"drawtext=text='{safe_caption}'"
                f":fontcolor=white:fontsize=48:borderw=2:bordercolor=black"
                f":x=(w-text_w)/2:y=h-100"
            )
            
            try:
                # Create segment using ffmpeg-python
                # Note: We use frames parameter in output to ensure exact duration
                stream = (
                    ffmpeg
                    .input(img_path, loop=1, framerate=fps)
                    .filter('zoompan', z=f'if(lte(zoom,1.0),{zoom_start},{zoom_start}+(on/{total_frames})*({zoom_end}-{zoom_start}))', d=total_frames, s='1920x1080', fps=fps)
                    .drawtext(text=safe_caption, fontcolor='white', fontsize=48, borderw=2, bordercolor='black', x='(w-text_w)/2', y='h-100')
                    .output(segment_path, vcodec='libx264', pix_fmt='yuv420p', frames=total_frames)
                    .overwrite_output()
                )
                
                await run_ffmpeg_async(stream)
                segment_files.append(segment_path)
                
            except ffmpeg.Error as e:
                error_msg = e.stderr.decode() if e.stderr else str(e)
                raise RuntimeError(f"FFmpeg failed for segment {idx}: {error_msg}")
        
        # Step 4: Concatenate all segments
        print(f"[SLIDESHOW] Concatenating {len(segment_files)} segments...")
        
        # Create concat demuxer file
        concat_file = os.path.join(temp_dir, "concat.txt")
        with open(concat_file, 'w') as f:
            for seg in segment_files:
                f.write(f"file '{seg}'\n")
        
        temp_video_no_audio = os.path.join(temp_dir, "video_no_audio.mp4")
        
        try:
            stream = (
                ffmpeg
                .input(concat_file, format='concat', safe=0)
                .output(temp_video_no_audio, c='copy')
                .overwrite_output()
            )
            await run_ffmpeg_async(stream)
            
        except ffmpeg.Error as e:
            error_msg = e.stderr.decode() if e.stderr else str(e)
            raise RuntimeError(f"FFmpeg concat failed: {error_msg}")
        
        # Step 5: Add music if provided
        if music_file_path and os.path.exists(music_file_path):
            print(f"[SLIDESHOW] Adding music track...")
            
            try:
                video_stream = ffmpeg.input(temp_video_no_audio)
                audio_stream = ffmpeg.input(music_file_path)
                
                stream = (
                    ffmpeg
                    .output(video_stream, audio_stream, output_path, 
                           vcodec='copy', acodec='aac', audio_bitrate='192k', 
                           shortest=None)
                    .overwrite_output()
                )
                
                await run_ffmpeg_async(stream)
                
            except ffmpeg.Error as e:
                error_msg = e.stderr.decode() if e.stderr else str(e)
                raise RuntimeError(f"FFmpeg audio merge failed: {error_msg}")
        else:
            # No music, just copy the video
            import shutil
            shutil.copy(temp_video_no_audio, output_path)
        
        # Calculate total duration
        total_duration = len(images) * duration_per_image
        
        print(f"[SLIDESHOW] Successfully created slideshow: {output_path}")
        print(f"[SLIDESHOW] Duration: {total_duration}s, Images: {len(images)}")
        
        return {
            "video_path": output_path,
            "duration": total_duration,
            "width": 1920,
            "height": 1080
        }
        
    except Exception as e:
        raise RuntimeError(f"Failed to create slideshow: {str(e)}")
    
    finally:
        # Cleanup temporary files
        try:
            import shutil
            shutil.rmtree(temp_dir)
            print(f"[SLIDESHOW] Cleaned up temporary directory: {temp_dir}")
        except Exception as e:
            print(f"[SLIDESHOW] WARNING: Failed to cleanup temp dir: {str(e)}")

async def process_slideshow(job_id: str, request: SlideshowRequest, user_id: int):
    """
    Background task to process slideshow generation with stage-based status updates.
    """
    try:
        event_id = request.event_id
        music_choice = request.music_choice
        theme_prompt = request.theme_prompt
        
        # Stage 1: Fetching images and generating captions
        job_status_store[job_id] = {
            "status": "processing",
            "message": "Fetching images and generating captions...",
            "slideshow_url": None,
            "error": None
        }
        print(f"[JOB {job_id}] Stage 1 & 2: Fetching images and generating captions")
        
        # Fetch media mapping and generate captions in one call
        # This returns [{"image_url": "...", "caption": "..."}, ...]
        captions = await generate_event_captions_batch(
            event_id=event_id,
            theme=theme_prompt or "playful",
            update_database=True  # Save captions to Supabase
        )
        
        # Extract image URLs for video generation
        image_urls = [c["image_url"] for c in captions]
        
        print(f"[JOB {job_id}] Fetched {len(image_urls)} images and generated {len(captions)} captions")
        
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
        
        # Create slideshow with Ken Burns effects and captions
        music_file = music_data.get("file_path") if music_data else None
        slideshow_result = await create_slideshow(
            images=image_urls,
            captions=captions,
            music_file_path=music_file,
            duration_per_image=4.0
        )
        
        local_video_path = slideshow_result["video_path"]
        duration_seconds = int(slideshow_result["duration"])
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
        try:
            os.remove(local_video_path)
            print(f"[JOB {job_id}] Cleaned up temporary video file")
        except Exception as e:
            print(f"[JOB {job_id}] WARNING: Failed to cleanup video file: {str(e)}")
        
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

