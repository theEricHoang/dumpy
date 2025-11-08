from openai import AzureOpenAI
from core.config import settings
from supabase import create_client, Client
from typing import List, Dict, Optional
import json

client = AzureOpenAI(
    api_key=settings.AZURE_OPENAI_API_KEY,
    azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
    api_version="2024-12-01-preview",
)

# Initialize Supabase client
supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SERVICE_ROLE_KEY
)

def generate_caption(image_url: str,
                     tagged_names: list[str] | None = None,
                     location: str | None = None,
                     theme: str = "playful"):
    """
    Generate a short caption for an image using Azure OpenAI.
    This version integrates with the /event/{id}/generate-captions endpoint.
    """
    tagged_names = tagged_names or []

    # Compact payload used in the system prompt context
    user_payload = {
        "image_url": image_url,
        "location": location or "unknown",
        "people_present": tagged_names,
        "theme": theme,
    }

    SYSTEM_PROMPT = (
        f"You create short, witty (<=25 words) captions for group stories with a {theme} tone.\n"
        "Use provided names exactly as given; do NOT guess or invent names.\n"
        "Include people if relevant, reference the location naturally, "
        f"and capture the {theme} vibe in your writing style.\n"
        "Avoid filler like 'in this photo'.\n"
        "Return ONLY JSON: {\"caption\": \"...\"}."
    )

    try:
        resp = client.chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": json.dumps(user_payload)},
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                },
            ],
            temperature=0.6,
            top_p=0.9,
            max_tokens=120,
            response_format={"type": "json_object"},
        )

        data = json.loads(resp.choices[0].message.content)
        return data.get("caption", "Moment captured.")
    except Exception as e:
        print(f"[CaptionService Error] {e}")
        return "Moment captured."


async def fetch_event_media_mapping(event_id: int) -> List[Dict]:
    """
    Fetch all media and tagged users for an event from Supabase.
    
    Args:
        event_id: The event ID to fetch media for
    
    Returns:
        List of media items with file_url, tagged_users, location, media_id
    
    Raises:
        ValueError: If event not found or no media available
        RuntimeError: If database query fails
    """
    try:
        response = supabase.rpc("get_event_media_mapping", {"event_id_input": event_id}).execute()
        
        if not response.data:
            raise ValueError(f"Event {event_id} not found or no media available")
        
        return response.data
    
    except ValueError:
        raise
    except Exception as e:
        raise RuntimeError(f"Failed to fetch media mapping for event {event_id}: {str(e)}")


async def generate_event_captions_batch(
    event_id: int,
    theme: str = "playful",
    update_database: bool = True
) -> List[Dict[str, str]]:
    """
    Generate captions for all media in an event using tagged users and metadata.
    Returns a list suitable for slideshow generation.
    
    Args:
        event_id: The event ID to generate captions for
        theme: Theme prompt for caption generation (e.g., "playful", "nostalgic", "adventurous")
        update_database: Whether to update the ai_caption field in Supabase (default: True)
    
    Returns:
        List of dicts with 'image_url' and 'caption' keys, suitable for create_slideshow()
        Example: [{"image_url": "https://...", "caption": "Beautiful moment with friends"}]
    
    Raises:
        ValueError: If event not found or no media available
        RuntimeError: If caption generation or database update fails
    """
    try:
        # Fetch all media + tagged users
        media_items = await fetch_event_media_mapping(event_id)
        
        print(f"[CaptionService] Generating captions for {len(media_items)} media items from event {event_id}")
        
        captions_for_slideshow = []
        
        for media in media_items:
            tagged_users = [u["username"] for u in (media.get("tagged_users") or [])]
            file_url = media["file_url"]
            location = media.get("location", "unknown location")
            media_id = media["media_id"]
            
            # Generate caption using Azure OpenAI
            caption = generate_caption(
                image_url=file_url,
                tagged_names=tagged_users,
                location=location,
                theme=theme
            )
            
            print(f"[CaptionService] Generated caption for media {media_id}: {caption[:50]}...")
            
            # Update caption in Supabase if requested
            if update_database:
                try:
                    supabase.table("media").update({"ai_caption": caption}).eq("media_id", media_id).execute()
                except Exception as e:
                    print(f"[CaptionService] WARNING: Failed to update caption in database for media {media_id}: {str(e)}")
                    # Continue even if database update fails
            
            # Add to slideshow-ready format
            captions_for_slideshow.append({
                "image_url": file_url,
                "caption": caption
            })
        
        print(f"[CaptionService] Successfully generated {len(captions_for_slideshow)} captions for event {event_id}")
        
        return captions_for_slideshow
    
    except ValueError:
        raise
    except Exception as e:
        raise RuntimeError(f"Failed to generate captions for event {event_id}: {str(e)}")


# Original function with more arguments
"""
def generate_caption(image_url: str, album: str, captured_at: str, people_present=None, tags=None, recent_story=None, theme="playful"):
    people_present = people_present or []
    tags = tags or []
    recent_story = recent_story or []

    user_payload = {
        "image_url": image_url,
        "album": album,
        "captured_at": captured_at,
        "people_present": people_present,
        "tags": tags,
        "recent_story": recent_story,
        "theme": theme
    }

    SYSTEM_PROMPT = (
        "You create short, witty (<= 25 words) captions for a group story timeline.\n"
        "Use provided names as-is; do NOT guess identities or make up names.\n"
        "When multiple people are present and relevant to the moment, try to include them.\n"
        "Maintain continuity with the 'recent_story' context.\n"
        "Avoid filler such as 'in this photo'.\n"
        "Return ONLY JSON in the format: {\"caption\": \"...\"}."
    )

    try:
        resp = client.chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": f"Context:\n{json.dumps(user_payload)}"},
                        {"type": "image_url", "image_url": {"url": image_url}}
                    ]
                }
            ],
            temperature=0.6,
            top_p=0.9,
            max_tokens=120,
            response_format={"type": "json_object"}
        )

        data = json.loads(resp.choices[0].message.content)
        return data["caption"]
    except Exception as e:
        print(f"[CaptionService Error] {e}")
        return "Moment captured."
"""