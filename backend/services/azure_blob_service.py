from datetime import datetime, timedelta
import uuid
from typing import Optional

from azure.storage.blob import BlobServiceClient, ContentSettings, generate_blob_sas, BlobSasPermissions

from core.config import settings


_blob_client: Optional[BlobServiceClient] = None


def get_blob_service() -> BlobServiceClient:
    global _blob_client
    if _blob_client is not None:
        return _blob_client
    # Prefer connection string if provided
    if settings.AZURE_STORAGE_CONNECTION_STRING:
        _blob_client = BlobServiceClient.from_connection_string(settings.AZURE_STORAGE_CONNECTION_STRING)
    else:
        # Fallback to account+key
        if not settings.AZURE_STORAGE_ACCOUNT or not settings.AZURE_STORAGE_ACCOUNT_KEY:
            raise RuntimeError("Provide either AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT + AZURE_STORAGE_ACCOUNT_KEY")
        _blob_client = BlobServiceClient(
            account_url=f"https://{settings.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net",
            credential=settings.AZURE_STORAGE_ACCOUNT_KEY,
        )
    return _blob_client


def ensure_container(container_name: str) -> None:
    svc = get_blob_service()
    try:
        svc.create_container(container_name)
    except Exception:
        # Likely exists already; ignore
        pass


def upload_profile_image(content: bytes, content_type: str = "image/jpeg") -> str:
    """Uploads bytes to the profile pics container and returns the blob URL.

    The blob is named with a time-based prefix + random UUID to avoid collisions.
    Container access should be configured for blob-level public read if you want
    an anonymous https URL; otherwise, you'd generate SAS here.
    """
    container = settings.AZURE_STORAGE_PROFILE_PICS_CONTAINER or settings.AZURE_STORAGE_CONTAINER or "profile-pics"
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

    # Construct URL; using primary endpoint. If the container is private,
    # append a read-only SAS token so the client can access it.
    base_url = blob_client.url

    # Try to obtain an account key for SAS generation
    account_key = settings.AZURE_STORAGE_ACCOUNT_KEY
    account_name = get_blob_service().account_name

    if not account_key and settings.AZURE_STORAGE_CONNECTION_STRING:
        # Parse AccountKey from connection string if available
        try:
            parts = dict(
                p.split("=", 1) for p in settings.AZURE_STORAGE_CONNECTION_STRING.split(";") if "=" in p
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
            # Fall back to base url if SAS generation fails
            return base_url
    else:
        # No key available; return base URL (works if container has public read)
        return base_url
