import Constants from 'expo-constants';

// Resolve API base URL from multiple sources/names and normalize
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;
const RAW_API_BASE = (
  process.env.EXPO_PUBLIC_API_BASE ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (extra.EXPO_PUBLIC_API_BASE as string | undefined) ||
  (extra.EXPO_PUBLIC_API_BASE_URL as string | undefined)
) as string | undefined;
const API_BASE_URL = RAW_API_BASE ? RAW_API_BASE.replace(/\/+$/, '') : undefined;

if (!API_BASE_URL) {
  console.warn('[API Client] Missing EXPO_PUBLIC_API_BASE (or EXPO_PUBLIC_API_BASE_URL). Set it in your .env.* file.');
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

export interface SlideshowRequest {
  event_id: number;
  theme_prompt: string;
  music_choice?: string;
}

export interface SlideshowResponse {
  status: string; // "processing", "completed", "failed"
  message: string;
  job_id: string;
}

export interface SlideshowStatusResponse {
  status: string; // "processing", "completed", "failed"
  message: string;
  slideshow_url?: string;
  error?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    // Don't throw on construction to avoid breaking route discovery/imports.
    // We'll validate right before making a request.
    this.baseUrl = (baseUrl || API_BASE_URL || '').replace(/\/+$/, '');
  }

  private ensureConfigured() {
    if (!this.baseUrl) {
      throw new Error('[API Client] No API base URL configured. Define EXPO_PUBLIC_API_BASE in .env and restart the dev server.');
    }
  }

  private makeUrl(endpoint: string): string {
    this.ensureConfigured();
    return `${this.baseUrl}${endpoint}`;
  }

  /**
   * Generic fetch wrapper with error handling
   */
  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = this.makeUrl(endpoint);
    
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
    this.ensureConfigured();
    const formData = new FormData();
    formData.append('file', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'photo.jpg',
    } as any);

    const response = await fetch(this.makeUrl('/api/face/detect_local'), {
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
    this.ensureConfigured();
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
  const url = this.makeUrl(`/api/face/identify_multi_local_grouped${queryString ? `?${queryString}` : ''}`);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Face identification failed: ${response.status}`);
    }

    const raw = await response.json();
    // Normalize backend shape → IdentifyMultiResponse
    // Backend returns: { ok: true, faces: [{ box, prob, results: [{user_id, similarity, match}] }], ... }
    // Frontend expects: { faces: [{ face_index, box, probability, matches: [...] }], total_faces }
    try {
      const rawFaces = Array.isArray(raw?.faces) ? raw.faces : [];
      const faces: MultiFaceResult[] = rawFaces.map((f: any, idx: number) => ({
        face_index: idx,
        box: Array.isArray(f?.box) ? f.box : [],
        probability: typeof f?.prob === 'number' ? f.prob : (typeof f?.probability === 'number' ? f.probability : 0),
        matches: Array.isArray(f?.results) ? f.results.map((m: any) => ({
          user_id: m?.user_id,
          similarity: m?.similarity,
          embedding_id: m?.embedding_id,
        })) : (Array.isArray(f?.matches) ? f.matches : []),
      }));
      return { faces, total_faces: faces.length } as IdentifyMultiResponse;
    } catch (e) {
      // Fallback: if backend signaled no faces
      if (raw && raw.ok === false && raw.reason === 'no_face_detected') {
        return { faces: [], total_faces: 0 } as IdentifyMultiResponse;
      }
      // Otherwise return as-is (may help during debugging)
      return raw as IdentifyMultiResponse;
    }
  }

  /**
   * Enroll a user with a single image
   */
  async enrollUser(userId: number, imageUri: string): Promise<any> {
    this.ensureConfigured();
    const formData = new FormData();
    formData.append('file', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'photo.jpg',
    } as any);

    const response = await fetch(this.makeUrl(`/api/face/enroll_local?user_id=${userId}`), {
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
    this.ensureConfigured();
    const formData = new FormData();
    imageUris.forEach((uri, index) => {
      formData.append('files', {
        uri,
        type: 'image/jpeg',
        name: `photo_${index}.jpg`,
      } as any);
    });

    const response = await fetch(this.makeUrl(`/api/face/enroll_local_batch?user_id=${userId}`), {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Batch enrollment failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Generate a slideshow for an event
   */
  async generateSlideshow(request: SlideshowRequest): Promise<SlideshowResponse> {
    return this.fetch<SlideshowResponse>('/api/slideshow/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
  }

  /**
   * Get the status of a slideshow generation job
   */
  async getSlideshowStatus(jobId: string): Promise<SlideshowStatusResponse> {
    return this.fetch<SlideshowStatusResponse>(`/api/slideshow/status/${jobId}`, {
      method: 'GET',
    });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export function to check if API is configured
export function hasApiEnv(): boolean {
  return Boolean(API_BASE_URL);
}
