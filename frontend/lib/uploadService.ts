import { apiClient } from './apiClient';
import { uploadToAzureBlob } from './azureStorage';
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
    // Step 1: Upload to Azure Blob Storage
    console.log('[Upload Service] Uploading to Azure...');
    const { url: fileUrl, fileName } = await uploadToAzureBlob(imageUri);
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
      const faceResult = await apiClient.identifyMultiFacesGrouped(imageUri, {
        top_k_per_face: 3,
        threshold: faceRecognitionOptions.threshold ?? 0.6,
        filter_matches: true,
        min_prob: 0.9, // High confidence for face detection
        auto_enroll_on_identify: faceRecognitionOptions.autoEnroll ?? false,
        auto_enroll_min_similarity: faceRecognitionOptions.autoEnrollMinSimilarity ?? 0.85,
        exclusive_assignment: faceRecognitionOptions.exclusiveAssignment ?? true,
      });

      faceCount = faceResult.total_faces;
      console.log(`[Upload Service] Detected ${faceCount} face(s)`);

      // Extract unique user IDs from matches
      const userIdSet = new Set<number>();
      faceResult.faces.forEach((face) => {
        face.matches.forEach((match) => {
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
