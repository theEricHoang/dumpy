import { View, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function UploadScreen() {
    const router = useRouter();

    useEffect(() => {
        // Show alert when accessed directly
        Alert.alert(
            'Upload Photo',
            'Navigate to a dump to upload photos',
            [{ text: 'OK', onPress: () => router.replace('/(tabs)/dumps') }]
        );
    }, []);

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
