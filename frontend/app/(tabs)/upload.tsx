import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, View } from 'react-native';

export default function UploadScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ returnTo?: string }>();

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
        
        // TODO: Upload image to backend/supabase
        console.log('Selected image:', selectedImage.uri);
        
        // Go back to the page we came from
        navigateBack();
    };

    return <View />;
}
