export interface UploadResponse {
  uploadUrl: string;
  blobUrl: string;
}

export async function uploadImageToAzure(file: File): Promise<string> {
  try {
    const response = await fetch(
      `http://127.0.0.1:8000/getUploadUrl?file_name=${encodeURIComponent(file.name)}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      throw new Error(`Failed to get SAS URL: ${response.statusText}`);
    }

    const { uploadUrl, blobUrl }: UploadResponse = await response.json();

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error('Azure upload failed');
    }

    console.log('✅ Upload successful:', blobUrl);
    return blobUrl;
  } catch (err) {
    console.error('❌ Upload error:', err);
    throw err;
  }
}