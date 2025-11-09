# Photo Upload & Face Recognition Setup

## Overview
The photo upload system integrates three main components:
1. **Azure Blob Storage** - Stores uploaded images
2. **Backend API** - Manages media records and face recognition
3. **Face Recognition** - Automatically tags people in photos

## Installation

### 1. Install Required Dependencies
```bash
npx expo install expo-file-system
```

### 2. Environment Configuration

Create a `.env` file in the frontend directory (copy from `.env.example`):

```bash
# Azure Blob Storage
EXPO_PUBLIC_AZURE_STORAGE_ACCOUNT=your-storage-account-name
EXPO_PUBLIC_AZURE_STORAGE_CONTAINER=dumps
EXPO_PUBLIC_AZURE_STORAGE_SAS_TOKEN=?sv=2021-06-08&ss=b&srt=sco&sp=rwdlac&se=...

# Backend API
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000
```

### 3. Azure Blob Storage Setup

#### Generate SAS Token:
1. Go to Azure Portal → Your Storage Account
2. Navigate to **Shared access signature**
3. Configure permissions:
   - Allowed services: **Blob**
   - Allowed resource types: **Container, Object**
   - Allowed permissions: **Read, Write, Delete, List, Add, Create**
   - Set expiry date (recommend 1 year)
4. Click **Generate SAS and connection string**
5. Copy the **SAS token** (starts with `?sv=...`)

#### Create Container:
1. Go to **Containers** in your storage account
2. Create new container named `dumps`
3. Set **Public access level**: Private (recommended) or Blob

### 4. Backend API Endpoints

Your backend should implement these endpoints:

#### Create Media Record
```
POST /media
Content-Type: application/json

{
  "event_id": 123,
  "file_url": "https://account.blob.core.windows.net/dumps/photo.jpg",
  "file_type": "image",
  "location": "37.7749,-122.4194",
  "uploaded_by": 1,
  "exif_data": {}
}

Response:
{
  "media_id": "uuid",
  "event_id": 123,
  "file_url": "...",
  "tagged_users": []
}
```

#### Update Media Tags
```
PATCH /media/{media_id}/tags
Content-Type: application/json

{
  "tagged_users": [1, 2, 3]
}
```

## Upload Flow

When a user uploads a photo from a dump workspace:

1. **Image Selection** - User taps + button, selects photo from library
2. **Azure Upload** - Image uploaded to Azure Blob Storage
3. **Create Record** - Media record created in database with Azure URL
4. **Face Detection** - Backend detects all faces in the photo
5. **Face Recognition** - Each face is matched against enrolled users
6. **Auto-Tagging** - Users with similarity > threshold are tagged
7. **Database Update** - Tagged user IDs saved to media record

## Face Recognition Configuration

The upload uses these default settings (configurable in `upload.tsx`):

```typescript
faceRecognitionOptions: {
  threshold: 0.6,              // Minimum similarity for a match
  autoEnroll: false,           // Don't auto-enroll new faces
  autoEnrollMinSimilarity: 0.85, // Threshold for auto-enrollment
  exclusiveAssignment: true,   // Each face matched to only one user
}
```

### Face Recognition API Endpoints Used

- **`POST /face/identify_multi_local_grouped`** - Main endpoint for tagging
  - Detects all faces in image
  - Matches each face against enrolled users
  - Uses grouped embeddings for better accuracy
  - Returns top matches per face with similarity scores

## Architecture

### File Structure
```
lib/
  ├── azureStorage.ts      # Azure Blob Storage upload
  ├── apiClient.ts         # Backend API wrapper
  ├── uploadService.ts     # Orchestrates upload flow
  └── supabaseClient.ts    # Supabase client (existing)

app/(tabs)/
  └── upload.tsx           # Upload screen with progress UI
```

### Upload Service (`lib/uploadService.ts`)

Main function: `uploadAndTagPhoto(imageUri, options)`

**Steps:**
1. Upload image to Azure Blob Storage
2. Create media record with Azure URL
3. Run face recognition on original image URI
4. Extract user IDs from face matches
5. Update media record with tagged users

**Error Handling:**
- Azure upload failure → Abort and show error
- Database record failure → Abort and show error
- Face recognition failure → Continue, log warning (photo saved without tags)

## User Authentication

**TODO:** Replace hardcoded user ID with actual auth:

```typescript
// In upload.tsx, line ~78
const currentUserId = 1; // Replace with actual user ID from auth
```

Implement user context/authentication and pass the authenticated user's ID.

## Testing

### 1. Test Azure Upload
```bash
# Check if environment variables are set
console.log(process.env.EXPO_PUBLIC_AZURE_STORAGE_ACCOUNT)
console.log(process.env.EXPO_PUBLIC_AZURE_STORAGE_SAS_TOKEN)
```

### 2. Test Backend API
```bash
# Test media creation
curl -X POST http://localhost:8000/media \
  -H "Content-Type: application/json" \
  -d '{"event_id": 1, "file_url": "test.jpg", "file_type": "image", "uploaded_by": 1}'
```

### 3. Test Face Recognition
```bash
# Test face detection
curl -X POST http://localhost:8000/face/detect_local \
  -F "file=@photo.jpg"

# Test multi-face identification
curl -X POST "http://localhost:8000/face/identify_multi_local_grouped?threshold=0.6" \
  -F "file=@photo.jpg"
```

## Troubleshooting

### Azure Upload Fails
- Verify SAS token is valid and not expired
- Check container name matches environment variable
- Ensure SAS token has correct permissions (Read, Write, Create)
- Check storage account name is correct

### Face Recognition Not Working
- Verify backend API URL is accessible
- Check if users have enrolled faces (use `/face/enroll_local`)
- Lower threshold if no matches (default 0.6)
- Check backend logs for face detection errors

### Photos Not Appearing in Dump
- Verify media record was created (check database)
- Ensure `fetchEventData()` in dump workspace is called after upload
- Add pull-to-refresh to manually reload media list

## Future Enhancements

1. **Batch Upload** - Allow selecting multiple photos at once
2. **Upload Progress** - Show progress bar during Azure upload
3. **Manual Tagging** - UI for users to manually tag people
4. **Face Bounding Boxes** - Show detected faces on image
5. **Auto-Refresh** - Automatically refresh dump workspace after upload
6. **Offline Queue** - Queue uploads when offline, retry when online
