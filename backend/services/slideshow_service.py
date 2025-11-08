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


async def preprocess_image(image_path: str, output_path: str, target_width: int = 1080, target_height: int = 1920) -> str:
    """
    Preprocess image to handle different resolutions and aspect ratios.
    Resizes and pads image to target resolution while maintaining aspect ratio.
    TikTok/mobile vertical format: 1080x1920 (9:16).
    
    Args:
        image_path: Path to source image
        output_path: Path to save processed image
        target_width: Target width (default: 1080 for mobile)
        target_height: Target height (default: 1920 for mobile)
    
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
    Get Ken Burns effect parameters with subtle zoom and pan.
    
    Args:
        duration: Duration of the effect in seconds
    
    Returns:
        Dictionary with zoom and pan parameters
    """
    zoom_in = random.choice([True, False])
    
    # More subtle zoom for better effect
    return {
        "zoom_in": zoom_in,
        "zoom_start": 1.0 if zoom_in else 1.2,
        "zoom_end": 1.2 if zoom_in else 1.0,
        "duration": duration,
        "fps": 30,
        "width": 1080,
        "height": 1920
    }


def wrap_text(text: str, max_chars_per_line: int = 35) -> str:
    """
    Wrap text to fit within a certain character width.
    Breaks at word boundaries when possible.
    """
    words = text.split()
    lines = []
    current_line = []
    current_length = 0
    
    for word in words:
        word_length = len(word)
        # +1 for space before word
        if current_length + word_length + (1 if current_line else 0) <= max_chars_per_line:
            current_line.append(word)
            current_length += word_length + (1 if len(current_line) > 1 else 0)
        else:
            if current_line:
                lines.append(' '.join(current_line))
            current_line = [word]
            current_length = word_length
    
    if current_line:
        lines.append(' '.join(current_line))
    
    return '\n'.join(lines)


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
            width = kb_params["width"]
            height = kb_params["height"]
            
            # Wrap text for better display on mobile
            wrapped_caption = wrap_text(caption_text, max_chars_per_line=35)
            
            # Escape special characters in caption for FFmpeg
            safe_caption = wrapped_caption.replace("'", "'\\\\\\''").replace(":", "\\:")
            
            try:
                # Create segment using ffmpeg-python with Ken Burns effect
                stream = ffmpeg.input(img_path, loop=1, framerate=fps)
                
                # Apply Ken Burns zoom effect with correct initial zoom
                # Use linear interpolation from zoom_start to zoom_end
                zoom_formula = f'{zoom_start}+({zoom_end}-{zoom_start})*(on/{total_frames})'
                stream = stream.filter(
                    'zoompan',
                    z=zoom_formula,
                    d=total_frames,
                    s=f'{width}x{height}',
                    fps=fps
                )
                
                # Add caption with text wrapping using max_glyph_w for wrapping
                stream = stream.drawtext(
                    text=safe_caption,
                    fontcolor='white',
                    fontsize=40,
                    borderw=3,
                    bordercolor='black@0.8',
                    x='(w-text_w)/2',
                    y='h-th-80',  # 80px from bottom
                    box=1,
                    boxcolor='black@0.5',
                    boxborderw=20,
                    line_spacing=8,
                    fontfile='/System/Library/Fonts/Supplemental/Arial.ttf'
                )
                
                stream = stream.output(
                    segment_path,
                    vcodec='libx264',
                    pix_fmt='yuv420p',
                    frames=total_frames,  # Explicit frame count for exact duration
                    **{'b:v': '3M'}  # Set bitrate for quality
                )
                
                stream = stream.overwrite_output()
                
                await run_ffmpeg_async(stream)
                segment_files.append(segment_path)
                
            except ffmpeg.Error as e:
                error_msg = e.stderr.decode() if e.stderr else str(e)
                raise RuntimeError(f"FFmpeg failed for segment {idx}: {error_msg}")
        
        # Step 4: Concatenate all segments with crossfade transitions
        print(f"[SLIDESHOW] Concatenating {len(segment_files)} segments with crossfade transitions...")
        
        temp_video_no_audio = os.path.join(temp_dir, "video_no_audio.mp4")
        
        try:
            if len(segment_files) == 1:
                # Single segment - just copy it
                import shutil
                shutil.copy(segment_files[0], temp_video_no_audio)
            else:
                # Multiple segments - apply crossfade between them
                crossfade_duration = 0.5  # 0.5 second crossfade
                
                # Build complex filter for crossfading
                inputs = [ffmpeg.input(seg) for seg in segment_files]
                
                # Start with first video
                video = inputs[0].video
                
                # Apply crossfade between consecutive videos
                for i in range(1, len(inputs)):
                    # Calculate offset (duration of previous segment minus crossfade)
                    offset = duration_per_image - crossfade_duration
                    
                    video = ffmpeg.filter(
                        [video, inputs[i].video],
                        'xfade',
                        transition='fade',
                        duration=crossfade_duration,
                        offset=offset * i
                    )
                
                stream = ffmpeg.output(
                    video,
                    temp_video_no_audio,
                    vcodec='libx264',
                    pix_fmt='yuv420p',
                    **{'b:v': '3M'}
                ).overwrite_output()
                
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
        
        # Calculate total duration accounting for crossfades
        # Each crossfade overlaps 0.5s, so subtract that from total
        crossfade_duration = 0.5
        num_transitions = max(0, len(images) - 1)
        total_duration = (len(images) * duration_per_image) - (num_transitions * crossfade_duration)
        
        print(f"[SLIDESHOW] Successfully created slideshow: {output_path}")
        print(f"[SLIDESHOW] Duration: {total_duration}s, Images: {len(images)}, Format: 1080x1920 (9:16)")
        
        return {
            "video_path": output_path,
            "duration": total_duration,
            "width": 1080,
            "height": 1920
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

