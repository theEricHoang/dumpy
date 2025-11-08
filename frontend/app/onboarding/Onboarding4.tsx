import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

export default function Onboarding1() {
    const router = useRouter();
    const features = [
        'perfect captions',
        'automatic friend tagging',
        'music of your choice'
    ];

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#E1E4E8', paddingHorizontal: 30 }}>
            <Text style={{ fontFamily: 'Inter', fontSize: 32, color: 'black', fontWeight: 'bold', textAlign: 'center', marginBottom: 10 }}>
                generate a video to remember, with:
            </Text>
            {features.map((feature, index) => (
                <Text key={index} style={{ fontFamily: 'Inter', fontSize: 24, color: 'black', marginTop: 8 }}>
                    • {feature}
                </Text>
            ))}
            <TouchableOpacity onPress={() => router.push('/onboarding/Onboarding5')}>
                <Text style={{ fontFamily: 'Inter', fontSize: 18, color: 'blue', marginTop: 20 }}>
                    Next
                </Text>
            </TouchableOpacity>
        </View>
    );
}