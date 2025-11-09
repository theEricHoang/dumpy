import { uploadAndTagPhoto } from '@/lib/uploadService';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

export default function UploadScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ returnTo?: string; eventId?: string }>();
    const [uploading, setUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<string>('');

    useFocusEffect(
        useCallback(() => {
            pickImage();
        }, [])
    );

    const navigateBack = () => {
        if (params.returnTo) {
            router.push(params.returnTo as any);
        } else {
            router.push('/dumps');
        }
    };

    const pickImage = async () => {
        // Debug: Log params to see what we're receiving
        console.log('[Upload] Received params:', params);
        
        // Check if we have eventId first
        if (!params.eventId) {
            console.error('[Upload] No eventId in params:', params);
            Alert.alert(
                'Error',
                'No event ID provided. Please navigate to a dump workspace first.',
                [{ text: 'OK', onPress: navigateBack }]
            );
            return;
        }

        // Request permissions
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        
        if (status !== 'granted') {
            Alert.alert(
                'Permission Required',
                'Please grant photo library access to upload photos',
                [{ text: 'OK', onPress: navigateBack }]
            );
            return;
        }

        // Launch image picker
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: false,
            quality: 0.8,
            exif: true,
        });

        if (result.canceled) {
            // User cancelled, go back
            navigateBack();
            return;
        }

        // Get the selected image
        const selectedImage = result.assets[0];
        
        // Upload the image
        await handleUpload(selectedImage);
    };

    const handleUpload = async (image: ImagePicker.ImagePickerAsset) => {
        setUploading(true);
        
        try {
            // Step 1: Uploading to Azure
            setUploadStatus('Uploading to cloud...');
            
            // TODO: Get current user ID from auth context
            const currentUserId = 1; // Replace with actual user ID from auth
            
            const result = await uploadAndTagPhoto(image.uri, {
                eventId: parseInt(params.eventId!),
                userId: currentUserId,
                location: image.exif?.GPSLatitude && image.exif?.GPSLongitude
                    ? `${image.exif.GPSLatitude},${image.exif.GPSLongitude}`
                    : undefined,
                exifData: image.exif ?? undefined,
                faceRecognitionOptions: {
                    threshold: 0.6,
                    autoEnroll: false,
                    autoEnrollMinSimilarity: 0.85,
                    exclusiveAssignment: true,
                },
            });

            // Show success message
            const tagMessage = result.taggedUsers.length > 0
                ? `Tagged ${result.taggedUsers.length} person${result.taggedUsers.length > 1 ? 's' : ''}`
                : result.faceCount > 0
                ? `Detected ${result.faceCount} face${result.faceCount > 1 ? 's' : ''} (no matches)`
                : 'No faces detected';

            Alert.alert(
                'Upload Successful',
                `Photo uploaded successfully!\n${tagMessage}`,
                [{ text: 'OK', onPress: navigateBack }]
            );
        } catch (error) {
            console.error('Upload error:', error);
            Alert.alert(
                'Upload Failed',
                error instanceof Error ? error.message : 'An error occurred while uploading',
                [
                    { text: 'Cancel', onPress: navigateBack, style: 'cancel' },
                    { text: 'Retry', onPress: () => handleUpload(image) },
                ]
            );
        } finally {
            setUploading(false);
            setUploadStatus('');
        }
    };

    if (uploading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#6D9C91" />
                <Text style={styles.statusText}>{uploadStatus}</Text>
            </View>
        );
    }

    return <View style={styles.container} />;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    statusText: {
        marginTop: 16,
        fontSize: 16,
        color: '#666',
        fontFamily: 'Poppins_400Regular',
    },
});
