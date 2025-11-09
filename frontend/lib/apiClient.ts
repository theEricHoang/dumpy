import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || extra.EXPO_PUBLIC_API_BASE_URL) as string | undefined;

if (!API_BASE_URL) {
  console.warn('[API Client] Missing EXPO_PUBLIC_API_BASE_URL');
}

// Type definitions
export interface FaceDetection {
  box: number[];
  probability: number;
}

export interface FaceMatch {
  user_id: number;
  similarity: number;
  embedding_id?: string;
}

export interface MultiFaceResult {
  face_index: number;
  box: number[];
  probability: number;
  matches: FaceMatch[];
}

export interface IdentifyMultiResponse {
  faces: MultiFaceResult[];
  total_faces: number;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || API_BASE_URL || '';
    if (!this.baseUrl) {
      throw new Error('[API Client] No API base URL configured');
    }
  }

  /**
   * Generic fetch wrapper with error handling
   */
  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API Error (${response.status}): ${error}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[API Client] Request failed for ${endpoint}:`, error);
      throw error;
    }
  }

  /**
   * Detect faces in an image (local MTCNN)
   */
  async detectFaces(imageUri: string): Promise<FaceDetection[]> {
    const formData = new FormData();
    formData.append('file', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'photo.jpg',
    } as any);

    const response = await fetch(`${this.baseUrl}/api/face/detect_local`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Face detection failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Identify multiple faces in an image with grouped embeddings
   * This is the recommended endpoint for tagging photos
   */
  async identifyMultiFacesGrouped(
    imageUri: string,
    options: {
      top_k_per_face?: number;
      threshold?: number;
      filter_matches?: boolean;
      min_prob?: number;
      auto_enroll_on_identify?: boolean;
      auto_enroll_min_similarity?: number;
      exclusive_assignment?: boolean;
    } = {}
  ): Promise<IdentifyMultiResponse> {
    const formData = new FormData();
    formData.append('file', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'photo.jpg',
    } as any);

    // Build query params
    const params = new URLSearchParams();
    if (options.top_k_per_face) params.append('top_k_per_face', options.top_k_per_face.toString());
    if (options.threshold !== undefined) params.append('threshold', options.threshold.toString());
    if (options.filter_matches !== undefined) params.append('filter_matches', options.filter_matches.toString());
    if (options.min_prob !== undefined) params.append('min_prob', options.min_prob.toString());
    if (options.auto_enroll_on_identify !== undefined) params.append('auto_enroll_on_identify', options.auto_enroll_on_identify.toString());
    if (options.auto_enroll_min_similarity !== undefined) params.append('auto_enroll_min_similarity', options.auto_enroll_min_similarity.toString());
    if (options.exclusive_assignment !== undefined) params.append('exclusive_assignment', options.exclusive_assignment.toString());

    const queryString = params.toString();
    const url = `${this.baseUrl}/api/face/identify_multi_local_grouped${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Face identification failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Enroll a user with a single image
   */
  async enrollUser(userId: number, imageUri: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'photo.jpg',
    } as any);

    const response = await fetch(`${this.baseUrl}/api/face/enroll_local?user_id=${userId}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`User enrollment failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Enroll a user with multiple images (batch)
   */
  async enrollUserBatch(userId: number, imageUris: string[]): Promise<any> {
    const formData = new FormData();
    imageUris.forEach((uri, index) => {
      formData.append('files', {
        uri,
        type: 'image/jpeg',
        name: `photo_${index}.jpg`,
      } as any);
    });

    const response = await fetch(`${this.baseUrl}/api/face/enroll_local_batch?user_id=${userId}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Batch enrollment failed: ${response.status}`);
    }

    return response.json();
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export function to check if API is configured
export function hasApiEnv(): boolean {
  return Boolean(API_BASE_URL);
}
