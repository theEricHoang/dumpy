import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function UploadScreen() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

    // Check authentication
    useEffect(() => {
        if (!authLoading && !user) {
            router.replace('/onboarding/Login');
            return;
        }

        if (user) {
            // Show alert when accessed directly
            Alert.alert(
                'Upload Photo',
                'Navigate to a dump to upload photos',
                [{ text: 'OK', onPress: () => router.replace('/(tabs)/dumps') }]
            );
        }
    }, [user, authLoading]);

    if (authLoading) {
        return (
            <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#4A9B72" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <Text style={styles.text}>Upload</Text>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#DADCE0',
    },
    text: {
        fontSize: 24,
        fontWeight: 'bold',
        fontFamily: 'Poppins',
    },
});
