import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;
const AZURE_STORAGE_ACCOUNT = (process.env.EXPO_PUBLIC_AZURE_STORAGE_ACCOUNT || extra.EXPO_PUBLIC_AZURE_STORAGE_ACCOUNT) as string | undefined;
const AZURE_STORAGE_SAS_TOKEN = (process.env.EXPO_PUBLIC_AZURE_STORAGE_SAS_TOKEN || extra.EXPO_PUBLIC_AZURE_STORAGE_SAS_TOKEN) as string | undefined;
const AZURE_STORAGE_CONTAINER = (process.env.EXPO_PUBLIC_AZURE_STORAGE_CONTAINER || extra.EXPO_PUBLIC_AZURE_STORAGE_CONTAINER) as string | undefined;

interface UploadResult {
  url: string;
  fileName: string;
}

/**
 * Upload an image to Azure Blob Storage using SAS token
 * @param uri - Local file URI from expo-image-picker
 * @param fileName - Optional custom filename (will generate UUID if not provided)
 * @returns Promise with the blob URL and filename
 */
export async function uploadToAzureBlob(
  uri: string,
  fileName?: string
): Promise<UploadResult> {
  if (!AZURE_STORAGE_ACCOUNT || !AZURE_STORAGE_SAS_TOKEN || !AZURE_STORAGE_CONTAINER) {
    throw new Error(
      '[Azure Storage] Missing required environment variables: EXPO_PUBLIC_AZURE_STORAGE_ACCOUNT, EXPO_PUBLIC_AZURE_STORAGE_SAS_TOKEN, or EXPO_PUBLIC_AZURE_STORAGE_CONTAINER'
    );
  }

  // Generate unique filename if not provided
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const extension = uri.split('.').pop() || 'jpg';
  const blobName = fileName || `dump_${timestamp}_${randomString}.${extension}`;

  // Construct the blob URL
  const blobUrl = `https://${AZURE_STORAGE_ACCOUNT}.blob.core.windows.net/${AZURE_STORAGE_CONTAINER}/${blobName}`;
  const uploadUrl = `${blobUrl}?${AZURE_STORAGE_SAS_TOKEN}`;

  try {
    // Read file info to get size and type
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) {
      throw new Error('File does not exist at URI: ' + uri);
    }

    // Upload using PUT request with blob storage headers
    const uploadResponse = await FileSystem.uploadAsync(uploadUrl, uri, {
      httpMethod: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'Content-Type': 'image/jpeg', // Adjust based on your needs
      },
    });

    if (uploadResponse.status !== 201) {
      throw new Error(
        `Azure upload failed with status ${uploadResponse.status}: ${uploadResponse.body}`
      );
    }

    console.log('[Azure Storage] Successfully uploaded:', blobName);
    
    return {
      url: blobUrl,
      fileName: blobName,
    };
  } catch (error) {
    console.error('[Azure Storage] Upload error:', error);
    throw error;
  }
}

/**
 * Check if Azure Storage environment variables are configured
 */
export function hasAzureStorageEnv(): boolean {
  return Boolean(AZURE_STORAGE_ACCOUNT && AZURE_STORAGE_SAS_TOKEN && AZURE_STORAGE_CONTAINER);
}
