import { apiClient } from './apiClient';
import * as ImageManipulator from 'expo-image-manipulator';
import { uploadToAzureBlob } from './azureStorage';
import Constants from 'expo-constants';
import { getSupabase } from './supabaseClient';

export interface UploadPhotoResult {
  mediaId: string;
  fileUrl: string;
  taggedUsers: number[];
  faceCount: number;
}

export interface UploadPhotoOptions {
  eventId: number;
  userId: number;
  location?: string;
  exifData?: Record<string, any>;
  faceRecognitionOptions?: {
    threshold?: number;
    autoEnroll?: boolean;
    autoEnrollMinSimilarity?: number;
    exclusiveAssignment?: boolean;
    minProb?: number; // Minimum face probability for detection filter
    filterMatches?: boolean; // Allow disabling match filtering for debugging
    disableCompression?: boolean; // Skip client-side resize/compression
  };
}

/**
 * Complete photo upload workflow:
 * 1. Upload image to Azure Blob Storage
 * 2. Create media record in database
 * 3. Run face recognition to tag people
 * 4. Update media record with tagged users
 */
export async function uploadAndTagPhoto(
  imageUri: string,
  options: UploadPhotoOptions
): Promise<UploadPhotoResult> {
  const {
    eventId,
    userId,
    location,
    exifData,
    faceRecognitionOptions = {},
  } = options;

    try {
    // Optional compression: downscale very large images to max 1600px dimension
    let workingUri = imageUri;
    if (!faceRecognitionOptions.disableCompression) {
      try {
        console.time('[Upload Service] Image inspect');
        const info = await ImageManipulator.manipulateAsync(imageUri, []); // forces metadata read
        console.timeEnd('[Upload Service] Image inspect');
        if ((info.width && info.width > 1600) || (info.height && info.height > 1600)) {
          const scaleFactor = 1600 / Math.max(info.width, info.height);
          const targetWidth = Math.round(info.width * scaleFactor);
          const targetHeight = Math.round(info.height * scaleFactor);
          console.log(`[Upload Service] Compressing image from ${info.width}x${info.height} -> ${targetWidth}x${targetHeight}`);
          console.time('[Upload Service] Image resize');
          const resized = await ImageManipulator.manipulateAsync(imageUri, [
            { resize: { width: targetWidth, height: targetHeight } }
          ], { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
          console.timeEnd('[Upload Service] Image resize');
          workingUri = resized.uri;
        }
      } catch (e) {
        console.warn('[Upload Service] Image compression skipped (error or unsupported):', e);
      }
    } else {
      console.log('[Upload Service] Compression disabled by option');
    }

    // Step 1: Upload to Azure via backend proxy (authoritative path to avoid client PUT hangs)
    console.log('[Upload Service] Uploading to Azure...');
    console.time('[Upload Service] Total Azure Upload');
    let fileUrl: string;
    const base = (process.env.EXPO_PUBLIC_API_BASE || process.env.EXPO_PUBLIC_API_BASE_URL || (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_API_BASE || '').replace(/\/+$/, '');
    const formData = new FormData();
    formData.append('file', { uri: workingUri, type: 'image/jpeg', name: 'photo.jpg' } as any);
    let resp = await fetch(`${base}/api/upload/media`, { method: 'POST', body: formData });
    if (!resp.ok) {
      console.warn('[Upload Service] Backend proxy upload failed with status', resp.status, '- attempting direct blob upload...');
      const direct = await uploadToAzureBlob(workingUri);
      fileUrl = direct.url;
      console.log('[Upload Service] Direct blob upload succeeded');
    } else {
      const json = await resp.json();
      fileUrl = json.url;
      console.log('[Upload Service] Backend proxy upload succeeded');
    }
    console.timeEnd('[Upload Service] Total Azure Upload');
    console.log('[Upload Service] Upload successful:', fileUrl);

    // Step 2: Create media record in Supabase
    console.log('[Upload Service] Creating media record in Supabase...');
    const supabase = getSupabase();
    const { data: mediaData, error: mediaError } = await supabase
      .from('media')
      .insert({
        event_id: eventId,
        file_url: fileUrl,
        file_type: 'image',
        location: location || '',
        uploaded_by: userId,
        tagged_users: [],
      })
      .select()
      .single();

    if (mediaError || !mediaData) {
      console.error('[Upload Service] Supabase error:', mediaError);
      throw new Error(`Failed to create media record: ${mediaError?.message || 'Unknown error'}`);
    }

    console.log('[Upload Service] Media record created:', mediaData.media_id);

    // Step 3: Run face recognition
    console.log('[Upload Service] Running face recognition...');
    let taggedUsers: number[] = [];
    let faceCount = 0;

    try {
      const faceResult = await apiClient.identifyMultiFacesGrouped(workingUri, {
        top_k_per_face: 3,
        threshold: faceRecognitionOptions.threshold ?? 0.6,
        filter_matches: faceRecognitionOptions.filterMatches ?? true,
        min_prob: faceRecognitionOptions.minProb ?? 0.6,
        auto_enroll_on_identify: faceRecognitionOptions.autoEnroll ?? false,
        auto_enroll_min_similarity: faceRecognitionOptions.autoEnrollMinSimilarity ?? 0.85,
        exclusive_assignment: faceRecognitionOptions.exclusiveAssignment ?? true,
      });
      console.log('[Upload Service] Face result:', JSON.stringify(faceResult));
      // Be robust to older shapes: compute faceCount even if total_faces missing
      if (typeof (faceResult as any).total_faces === 'number') {
        faceCount = (faceResult as any).total_faces as number;
      } else if (Array.isArray((faceResult as any).faces)) {
        faceCount = ((faceResult as any).faces as any[]).length;
      } else {
        faceCount = 0;
      }
      console.log(`[Upload Service] Detected ${faceCount} face(s)`);

      // Extract unique user IDs from matches (guard for older/unexpected shapes)
      const userIdSet = new Set<number>();
      const facesArr = Array.isArray((faceResult as any).faces) ? (faceResult as any).faces as any[] : [];
      facesArr.forEach((face: any) => {
        const matchesArr: any[] = Array.isArray(face?.matches) ? face.matches : [];
        matchesArr.forEach((match: any) => {
          if (match.similarity >= (faceRecognitionOptions.threshold ?? 0.6)) {
            userIdSet.add(match.user_id);
          }
        });
      });

      taggedUsers = Array.from(userIdSet);
      console.log('[Upload Service] Tagged users:', taggedUsers);

      // Step 4: Update media record with tagged users in Supabase
      if (taggedUsers.length > 0) {
        console.log('[Upload Service] Updating media tags in Supabase...');
        const { error: updateError } = await supabase
          .from('media')
          .update({ tagged_users: taggedUsers })
          .eq('media_id', mediaData.media_id);

        if (updateError) {
          console.error('[Upload Service] Failed to update tags:', updateError);
        } else {
          console.log('[Upload Service] Tags updated successfully');
        }
      }
    } catch (faceError) {
      // Log face recognition errors but don't fail the entire upload
      console.warn('[Upload Service] Face recognition failed:', faceError);
      console.log('[Upload Service] Photo uploaded without tags');
    }

    return {
      mediaId: mediaData.media_id,
      fileUrl,
      taggedUsers,
      faceCount,
    };
  } catch (error) {
    console.error('[Upload Service] Upload failed:', error);
    throw error;
  }
}

/**
 * Batch upload multiple photos
 */
export async function uploadAndTagPhotoBatch(
  imageUris: string[],
  options: UploadPhotoOptions
): Promise<UploadPhotoResult[]> {
  const results: UploadPhotoResult[] = [];
  
  for (const uri of imageUris) {
    try {
      const result = await uploadAndTagPhoto(uri, options);
      results.push(result);
    } catch (error) {
      console.error('[Upload Service] Failed to upload image:', uri, error);
      // Continue with other images even if one fails
    }
  }
  
  return results;
}
