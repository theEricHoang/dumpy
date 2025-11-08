import React, { useState } from 'react';
import { uploadImageToAzure } from '@/lib/azureUpload';

export default function ImageUploader() {
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const blobUrl = await uploadImageToAzure(file);
      setUploadedUrl(blobUrl);
    } catch (err) {
      console.error(err);
      alert('Upload failed!');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <input type="file" accept="image/*" onChange={handleFileChange} />
      {uploading && <p>Uploading...</p>}
      {uploadedUrl && (
        <div>
          <p>✅ Uploaded successfully!</p>
          <img src={uploadedUrl} alt="Uploaded" width={200} />
        </div>
      )}
    </div>
  );
}