from typing import Dict, Optional
from core.config import settings
import replicate
import asyncio
from concurrent.futures import ThreadPoolExecutor

import os

# replicate needs token accessible from command line
if settings.REPLICATE_API_TOKEN:
    os.environ['REPLICATE_API_TOKEN'] = settings.REPLICATE_API_TOKEN

# Thread pool for blocking Replicate API calls
_executor = ThreadPoolExecutor(max_workers=2)

async def generate_music(theme_prompt: str, duration: int = 30, temp_dir: str = "/tmp") -> Dict[str, str]:
    """
    Generate music using Replicate's MusicGen model based on a theme prompt.
    
    Args:
        theme_prompt: Text description of the desired music (e.g., "upbeat summer vacation music")
        duration: Duration of the music in seconds (default: 30)
        temp_dir: Directory to save temporary audio file (default: /tmp)
    
    Returns:
        Dictionary containing:
        - file_path: Path to the temporary audio file (for FFmpeg)
        - format: Audio format (e.g., "wav")
        - duration: Duration in seconds
        - prompt: The prompt used
    
    Raises:
        ValueError: If REPLICATE_API_TOKEN is not set
        RuntimeError: If the API request fails
    
    Note:
        The caller is responsible for deleting the temporary file after use.
    """
    
    if not settings.REPLICATE_API_TOKEN:
        raise ValueError("REPLICATE_API_TOKEN is not set in environment variables")

    enhanced_prompt = f"music that embodies this feeling or idea: {theme_prompt}"
    input = {
        "prompt": enhanced_prompt,
        "model_version": "stereo-large",
        "duration": duration
    }
    
    # Run blocking Replicate API call in thread pool
    loop = asyncio.get_event_loop()
    output = await loop.run_in_executor(
        _executor,
        lambda: replicate.run(
            "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
            input=input
        )
    )

    # Save to temporary file with unique name
    import uuid
    temp_filename = f"music_{uuid.uuid4().hex[:8]}.wav"
    temp_path = os.path.join(temp_dir, temp_filename)
    
    with open(temp_path, "wb") as file:
        file.write(output.read())
    
    return {
        "file_path": temp_path,
        "format": "wav",
        "duration": duration,
        "prompt": enhanced_prompt
    }