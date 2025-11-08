from fastapi import APIRouter, HTTPException
from azure.storage.blob import generate_blob_sas, BlobSasPermissions
from datetime import datetime, timedelta
import os

router = APIRouter()


@router.post("/getUploadUrl")
async def get_upload_url(file_name: str):
    try:
        account_name = 'dumpymediauploads'                                                                              #os.getenv("AZURE_STORAGE_ACCOUNT")
        account_key = 'pRd2nUaAmxbfssWVLbTBp9POFZ8lwE5qfsAgilph+jRuJrXK0fLBgBIMx38toHy2/XbG3c6V3pLH+ASts87K5g=='        #os.getenv("AZURE_STORAGE_KEY")
        container_name = 'event-media'                                                                                  #os.getenv("CONTAINER_NAME", "event-media")

        if not account_name or not account_key:
            raise HTTPException(status_code=500, detail="Azure credentials not configured")

        sas_token = generate_blob_sas(
            account_name=account_name,
            container_name=container_name,
            blob_name=file_name,
            account_key=account_key,
            permission=BlobSasPermissions(write=True, create=True),
            expiry=datetime.utcnow() + timedelta(minutes=10)
        )

        blob_url = f"https://{account_name}.blob.core.windows.net/{container_name}/{file_name}"
        upload_url = f"{blob_url}?{sas_token}"

        return {"uploadUrl": upload_url, "blobUrl": blob_url}

    except Exception as e:
        print("Error generating SAS URL:", e)
        raise HTTPException(status_code=500, detail=str(e))