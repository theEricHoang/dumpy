# 🚀 REQUIRED SETUP - Please Provide These Values

## 📋 Checklist of Information Needed

### 1. Azure Blob Storage Configuration

**Storage Account Name:**
```
EXPO_PUBLIC_AZURE_STORAGE_ACCOUNT=_______________
```
Example: `dumpystorageaccount` (without .blob.core.windows.net)

**Container Name:**
```
EXPO_PUBLIC_AZURE_STORAGE_CONTAINER=_______________
```
Recommended: `dumps` or `photos`

**SAS Token:**
```
EXPO_PUBLIC_AZURE_STORAGE_SAS_TOKEN=_______________
```
Should start with `?sv=2021-06-08...` and include permissions: Read, Write, Create, Delete, List

---

### 2. Backend API Configuration

**API Base URL:**
```
EXPO_PUBLIC_API_BASE_URL=_______________
```
Examples:
- Local development: `http://localhost:8000`
- Production: `https://api.dumpy.app`

---

### 3. Backend API Endpoints Required

Please confirm these endpoints exist or provide the correct paths:

#### ✅ Create Media Record
```
POST /media
```
**Request Body:**
```json
{
  "event_id": 123,
  "file_url": "https://storage.blob.core.windows.net/dumps/photo.jpg",
  "file_type": "image",
  "location": "37.7749,-122.4194",
  "uploaded_by": 1,
  "exif_data": {}
}
```
**Response:**
```json
{
  "media_id": "uuid-here",
  "event_id": 123,
  "file_url": "...",
  "tagged_users": []
}
```

**Your endpoint path:** _______________

---

#### ✅ Update Media Tags
```
PATCH /media/{media_id}/tags
```
**Request Body:**
```json
{
  "tagged_users": [1, 2, 3]
}
```

**Your endpoint path:** _______________

---

#### ✅ Face Recognition Endpoints

The following endpoints are already referenced in your code. Please confirm:

- `POST /face/detect_local` ✅
- `POST /face/identify_multi_local_grouped` ✅
- `POST /face/enroll_local` ✅
- `POST /face/enroll_local_batch` ✅

---

## 🔧 Setup Instructions

### Step 1: Install Dependencies
```bash
cd /Users/erichoang/dev/dumpy/frontend
npx expo install expo-file-system
```
✅ **DONE** - Already installed

### Step 2: Create Environment File

1. Copy the example file:
```bash
cp .env.example .env.development
```

2. Fill in your values in `.env.development`:
```bash
# Azure Blob Storage
EXPO_PUBLIC_AZURE_STORAGE_ACCOUNT=your-account-name
EXPO_PUBLIC_AZURE_STORAGE_CONTAINER=dumps
EXPO_PUBLIC_AZURE_STORAGE_SAS_TOKEN=?sv=2021-06-08&ss=b&srt=sco&sp=rwdlac&se=...

# Backend API
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000

# Supabase (already configured)
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Step 3: Generate Azure SAS Token

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to your Storage Account
3. Click **Shared access signature** (left menu)
4. Configure:
   - **Allowed services:** ✅ Blob
   - **Allowed resource types:** ✅ Container, ✅ Object
   - **Allowed permissions:** ✅ Read, ✅ Write, ✅ Delete, ✅ List, ✅ Add, ✅ Create
   - **Start time:** Today
   - **End time:** 1 year from now
5. Click **Generate SAS and connection string**
6. Copy the **SAS token** (the part that starts with `?sv=...`)

### Step 4: Create Azure Container

1. In your Storage Account, go to **Containers**
2. Click **+ Container**
3. Name: `dumps`
4. Public access level: **Private** (recommended)
5. Click **Create**

### Step 5: Test the Setup

```bash
# Start the Expo dev server
npm start
```

Then in the app:
1. Navigate to a dump workspace (`/dumps/[id]`)
2. Tap the **+** button
3. Select a photo
4. Watch the console for:
   - ✅ Azure upload success
   - ✅ Media record created
   - ✅ Face recognition results
   - ✅ Tags updated

---

## 🏗️ What Was Built

### New Files Created:

1. **`lib/azureStorage.ts`** - Azure Blob Storage upload utility
2. **`lib/apiClient.ts`** - Backend API wrapper with typed endpoints
3. **`lib/uploadService.ts`** - Orchestrates upload → tag flow
4. **`.env.example`** - Environment variables template

### Modified Files:

1. **`app/(tabs)/upload.tsx`** - Integrated upload service with progress UI
2. **`app/(tabs)/_layout.tsx`** - Pass eventId to upload screen
3. **`app/(tabs)/dumps/[id].tsx`** - Auto-refresh media after upload

---

## 🔄 Upload Flow

```
User taps + button
    ↓
Select photo from library
    ↓
Upload to Azure Blob Storage
    ↓
Create media record in database (with Azure URL)
    ↓
Run face recognition on image
    ↓
Match faces to enrolled users
    ↓
Update media record with tagged user IDs
    ↓
Show success message with tag count
    ↓
Navigate back to dump workspace
    ↓
Media list auto-refreshes
```

---

## 📝 Code Quality Features

✅ **Type Safety** - Full TypeScript types for all API responses
✅ **Error Handling** - Graceful failures with user-friendly messages
✅ **Retry Logic** - Option to retry failed uploads
✅ **Progress Feedback** - Loading states and status messages
✅ **Separation of Concerns** - Dedicated services for Azure, API, and upload orchestration
✅ **Environment Validation** - Checks for required env vars before operations
✅ **Clean Architecture** - Services are testable and maintainable

---

## 🐛 Troubleshooting

### "Missing EXPO_PUBLIC_AZURE_STORAGE_ACCOUNT"
- Ensure `.env.development` exists with all Azure variables
- Restart Expo dev server after adding env vars

### "Azure upload failed with status 403"
- SAS token expired or invalid
- Check permissions (need Read, Write, Create)
- Verify storage account name is correct

### "API Error (404)"
- Backend API URL is wrong
- Endpoint path doesn't match your backend
- Backend server not running

### "Face recognition failed"
- Backend face recognition service down
- No enrolled faces in database
- Photo quality too low for face detection

---

## 📧 Next Steps

Please provide:
1. ✅ Azure Storage Account Name
2. ✅ Azure Container Name
3. ✅ Azure SAS Token
4. ✅ Backend API Base URL
5. ✅ Confirm media creation endpoint path
6. ✅ Confirm media tags update endpoint path

Once you provide these, I'll help you create the `.env.development` file with the correct values.
