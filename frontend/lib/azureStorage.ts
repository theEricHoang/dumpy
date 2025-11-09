import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { apiClient, hasApiEnv } from './apiClient';
import { Platform } from 'react-native';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;
// Support both direct process.env and expo extra, allow alternate alias names
const AZURE_STORAGE_ACCOUNT = (
  process.env.EXPO_PUBLIC_AZURE_STORAGE_ACCOUNT ||
  extra.EXPO_PUBLIC_AZURE_STORAGE_ACCOUNT ||
  process.env.EXPO_PUBLIC_AZURE_STORAGE_NAME ||
  extra.EXPO_PUBLIC_AZURE_STORAGE_NAME
) as string | undefined;
const AZURE_STORAGE_SAS_TOKEN = (
  process.env.EXPO_PUBLIC_AZURE_STORAGE_SAS_TOKEN ||
  extra.EXPO_PUBLIC_AZURE_STORAGE_SAS_TOKEN ||
  process.env.EXPO_PUBLIC_AZURE_SAS ||
  extra.EXPO_PUBLIC_AZURE_SAS
) as string | undefined;
const AZURE_STORAGE_CONTAINER = (
  process.env.EXPO_PUBLIC_AZURE_STORAGE_CONTAINER ||
  extra.EXPO_PUBLIC_AZURE_STORAGE_CONTAINER ||
  process.env.EXPO_PUBLIC_AZURE_CONTAINER ||
  extra.EXPO_PUBLIC_AZURE_CONTAINER
) as string | undefined;

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
  let account = AZURE_STORAGE_ACCOUNT;
  let container = AZURE_STORAGE_CONTAINER;
  let sas = AZURE_STORAGE_SAS_TOKEN;

  // If env vars are missing, attempt dynamic SAS retrieval from backend
  if (!account || !container || !sas) {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 10);
    const extension = uri.split('.').pop() || 'jpg';
    const provisionalName = fileName || `dump_${ts}_${rand}.${extension}`;
    if (hasApiEnv()) {
      const backendBase = (process.env.EXPO_PUBLIC_API_BASE || process.env.EXPO_PUBLIC_API_BASE_URL || (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_API_BASE || '').replace(/\/+$/, '');
      try {
        console.time('[Azure Storage] SAS fetch');
        const res = await fetch(`${backendBase}/api/getUploadUrl?file_name=${encodeURIComponent(provisionalName)}`, {
          method: 'POST'
        });
        console.timeEnd('[Azure Storage] SAS fetch');
        if (res.ok) {
          const json = await res.json();
          const uploadUrl: string = json.upload_url; // backend returns upload_url
          const blobUrl: string = json.blob_url || uploadUrl.split('?')[0];

          // Quick HEAD preflight to surface 403/404 quickly
          try {
            console.time('[Azure Storage] HEAD preflight');
            const head = await fetch(uploadUrl, { method: 'HEAD' });
            console.timeEnd('[Azure Storage] HEAD preflight');
            console.log('[Azure Storage] HEAD preflight status:', head.status);
          } catch (e) {
            console.warn('[Azure Storage] HEAD preflight failed:', e);
          }

          // Fallback to fetch-based PUT when uploadAsync hangs
          return await timedPutBlob(uploadUrl, blobUrl, provisionalName, uri);
        } else {
          console.warn('[Azure Storage] Backend SAS retrieval failed, status:', res.status);
        }
      } catch (e) {
        console.warn('[Azure Storage] Backend SAS retrieval error:', e);
      }
    } else {
      console.warn('[Azure Storage] API base not configured; cannot request dynamic SAS.');
    }
  }

  if (!account || !container || !sas) {
    throw new Error('[Azure Storage] Missing Azure configuration and fallback SAS generation failed.');
  }

  // Generate unique filename if not provided
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const extension = uri.split('.').pop() || 'jpg';
  const blobName = fileName || `dump_${timestamp}_${randomString}.${extension}`;

  // Construct the blob URL
  const blobUrl = `https://${account}.blob.core.windows.net/${container}/${blobName}`;
  const uploadUrl = `${blobUrl}?${sas}`;

  return timedPutBlob(uploadUrl, blobUrl, blobName, uri);
}

/**
 * Check if Azure Storage environment variables are configured
 */
export function hasAzureStorageEnv(): boolean {
  return Boolean(AZURE_STORAGE_ACCOUNT && AZURE_STORAGE_SAS_TOKEN && AZURE_STORAGE_CONTAINER);
}

async function timedPutBlob(uploadUrl: string, blobUrl: string, blobName: string, localUri: string): Promise<UploadResult> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (!fileInfo.exists) {
      throw new Error('File does not exist at URI: ' + localUri);
    }

    console.log(`[Azure Storage] Uploading '${blobName}' size=${fileInfo.size ?? 'unknown'} bytes to Azure...`);
    console.time('[Azure Storage] PUT upload');
    // Some Android devices require reading the file into a temp copy; attempt graceful fallback
    let sourceUri = localUri;
    // Simplified Android URI handling: ensure file:// prefix
    if (Platform.OS === 'android' && !localUri.startsWith('file://')) {
      // Some pickers may return content:// URIs; expo-file-system uploadAsync expects a local file path
      console.warn('[Azure Storage] Non-file URI detected; upload may fail:', localUri);
    }

    const uploadResponse = await FileSystem.uploadAsync(uploadUrl, sourceUri, {
      httpMethod: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'Content-Type': 'image/jpeg',
        'x-ms-version': '2020-10-02',
        ...(fileInfo.size ? { 'Content-Length': String(fileInfo.size) } : {}),
      },
    });
    console.timeEnd('[Azure Storage] PUT upload');

    if (uploadResponse.status !== 201) {
      throw new Error(`Azure upload failed with status ${uploadResponse.status}: ${uploadResponse.body}`);
    }

    console.log('[Azure Storage] Successfully uploaded:', blobName);
    return { url: blobUrl, fileName: blobName };
  } catch (error) {
    console.error('[Azure Storage] Upload error:', error);
    throw error;
  }
}

// Note: fetch-based PUT fallback removed to avoid base64 decoding issues in RN environments.
