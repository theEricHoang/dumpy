import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

export default function Onboarding1() {
    const router = useRouter();

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#E1E4E8' }}>
            <Text style={{ fontFamily: 'Inter', fontSize: 32, color: 'black', fontWeight: 'bold', textAlign: 'center' }}>
                coming soon
            </Text>
        </View>
    );
}