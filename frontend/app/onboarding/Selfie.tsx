import React, { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, Image, Alert, Platform, Linking } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImageManipulator from 'expo-image-manipulator'
import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import { getSupabase } from '../../lib/supabaseClient'

const API_BASE: string | undefined = (process.env.EXPO_PUBLIC_API_BASE || (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_API_BASE) as string | undefined

export default function Selfie() {
  const router = useRouter()
  const [permission, requestPermission] = useCameraPermissions()
  const camRef = useRef<CameraView | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission()
    }
  }, [permission, requestPermission])

  const takePhoto = async () => {
    if (!camRef.current) return
    setError(null)
    try {
      // Ensure permission is granted
      if (!permission?.granted) {
        const { granted, canAskAgain } = await requestPermission()
        if (!granted) {
          if (!canAskAgain) {
            Alert.alert(
              'Camera permission required',
              'Please enable Camera in Settings for Expo Go to take a selfie.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings?.() }
              ]
            )
          }
          return
        }
      }

      if (!cameraReady) {
        // Avoid calling before the camera is ready; helps on some devices
        setError('Camera is starting… please try again in a moment.')
        return
      }

      setCapturing(true)
      // capture
      const photo = await camRef.current.takePictureAsync({ quality: 0.9, skipProcessing: true })
      // compress to reasonable size (max 1080p)
      const manip = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 1080 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      )
      setPhotoUri(manip.uri)
    } catch (e: any) {
      setError(e?.message || 'Failed to capture photo')
    } finally {
      setCapturing(false)
    }
  }

  const uploadAndSave = async () => {
    if (!photoUri) return
    if (!API_BASE) {
      Alert.alert('Missing API', 'Set EXPO_PUBLIC_API_BASE in .env to your backend URL')
      return
    }
    try {
      setUploading(true)
      // Build FormData for both native and web
      const form = new FormData()
      if (Platform.OS === 'web') {
        const resp = await fetch(photoUri)
        const blob = await resp.blob()
        form.append('file', blob as any, 'selfie.jpg')
      } else {
        form.append('file', {
          uri: photoUri,
          name: 'selfie.jpg',
          type: 'image/jpeg'
        } as any)
      }

      const profileUploadUrl = `${API_BASE.replace(/\/$/, '')}/api/upload/profile-picture`
      const upload = await fetch(profileUploadUrl, {
        method: 'POST',
        body: form,
        headers: { 'Accept': 'application/json' }
      })
      if (!upload.ok) {
        const txt = await upload.text()
        throw new Error(`Upload failed: ${upload.status} ${txt}`)
      }
      const { url } = await upload.json() as { url?: string }
      if (!url) {
        throw new Error('Upload succeeded but no URL was returned by the server.')
      }

      // Ask the backend (service role) to set the user's profile_pic_url reliably
      const supabase = getSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      const email = user?.email
      if (!email) throw new Error('No authenticated user to update')

      const desiredUsername = (
        (user?.user_metadata as any)?.username ||
        (email.split('@')[0] || '').replace(/[^a-zA-Z0-9._-]/g, '') ||
        `user_${user?.id?.slice(0, 8) || Math.floor(Math.random() * 1e6).toString(36)}`
      )

      const serverSetUrl = `${API_BASE.replace(/\/$/, '')}/api/users/profile-picture`
      const setResp = await fetch(serverSetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, url, username: desiredUsername })
      })
      if (!setResp.ok) {
        const txt = await setResp.text()
        throw new Error(`Server profile picture set failed: ${setResp.status} ${txt}`)
      }
      const saved = await setResp.json() as { user_id?: number; email?: string; profile_pic_url?: string }
      console.log('Server confirmed profile pic:', saved?.profile_pic_url)

      // Use the server-returned user_id for enrollment
      let userId: number | undefined = saved?.user_id

      if (userId) {
        const enrollUrl = `${API_BASE.replace(/\/$/, '')}/api/face/enroll_local?user_id=${userId}`
        const enrollForm = new FormData()
        if (Platform.OS === 'web') {
          const resp2 = await fetch(photoUri)
          const blob2 = await resp2.blob()
          enrollForm.append('file', blob2 as any, 'selfie.jpg')
        } else {
          enrollForm.append('file', {
            uri: photoUri,
            name: 'selfie.jpg',
            type: 'image/jpeg'
          } as any)
        }
        const enrollResp = await fetch(enrollUrl, { method: 'POST', body: enrollForm })
        if (!enrollResp.ok) {
          console.warn('Embedding enrollment failed', await enrollResp.text())
        }
      }

      Alert.alert('All set', 'Your profile picture was saved.')
      router.replace('/')
    } catch (e: any) {
      setError(e?.message || 'Failed to upload and save')
    } finally {
      setUploading(false)
    }
  }

  if (!permission) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    )
  }
  if (!permission.granted) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>Camera access needed</Text>
        <Text style={{ textAlign: 'center', marginBottom: 16 }}>We need your permission to take a quick selfie for your profile.</Text>
        <TouchableOpacity onPress={requestPermission} style={{ backgroundColor: '#000', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 }}>
          <Text style={{ color: '#fff' }}>Grant permission</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {photoUri ? (
        <View style={{ flex: 1 }}>
          <Image source={{ uri: photoUri }} style={{ flex: 1 }} resizeMode="cover" />
          {error && <Text style={{ color: '#ffb4ab', textAlign: 'center', padding: 8 }}>{error}</Text>}
          <View style={{ padding: 16, gap: 12, flexDirection: 'row', justifyContent: 'center' }}>
            <TouchableOpacity disabled={uploading} onPress={() => setPhotoUri(null)} style={{ backgroundColor: '#444', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 }}>
              <Text style={{ color: '#fff' }}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={uploading} onPress={uploadAndSave} style={{ backgroundColor: '#0ea5e9', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 }}>
              {uploading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff' }}>Use this selfie</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {Platform.OS === 'web' && (
            <View style={{ padding: 12, backgroundColor: '#111' }}>
              <Text style={{ color: '#bbb', textAlign: 'center' }}>
                On the web, camera requires https or localhost. If this doesn’t show your camera, try native Expo Go.
              </Text>
            </View>
          )}
          <CameraView
            ref={(ref: CameraView | null) => {
              camRef.current = ref
            }}
            facing="front"
            style={{ flex: 1 }}
            onCameraReady={() => setCameraReady(true)}
          />
          {error && <Text style={{ color: '#ffb4ab', textAlign: 'center', padding: 8 }}>{error}</Text>}
          <View style={{ padding: 16, alignItems: 'center' }}>
            <TouchableOpacity disabled={capturing} onPress={takePhoto} style={{ backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999 }}>
              {capturing ? <ActivityIndicator /> : (
                <Text style={{ fontWeight: '600' }}>{cameraReady ? 'Take selfie' : 'Starting camera…'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  )
}
