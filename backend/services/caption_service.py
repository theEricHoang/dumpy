from openai import AzureOpenAI
from backend.core.config import settings
import json

client = AzureOpenAI(
    api_key=settings.AZURE_OPENAI_API_KEY,
    azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
    api_version="2024-12-01-preview",
)

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