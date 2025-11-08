import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

export default function Onboarding1() {
    const router = useRouter();

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#E1E4E8' }}>
            <Text style={{ fontFamily: 'Inter', fontSize: 32, color: 'black', fontWeight: 'bold', textAlign: 'center' }}>
                welcome to dumpy
            </Text>
            <TouchableOpacity onPress={() => router.push('/onboarding/Onboarding2')}>
                <Text style={{ fontFamily: 'Inter', fontSize: 18, color: 'blue', marginTop: 20 }}>
                    Next
                </Text>
            </TouchableOpacity>
        </View>
    );
}