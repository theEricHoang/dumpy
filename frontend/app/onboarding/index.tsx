import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Swiper from 'react-native-swiper';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function OnboardingSwiper() {
    const router = useRouter();

    const handleComplete = async () => {
        await AsyncStorage.setItem('hasSeenOnboarding', 'true');
        router.replace('/onboarding/SignUp');
    };

    return (
        <Swiper
            loop={false}
            showsPagination={true}
            dotStyle={{ backgroundColor: 'rgba(0,0,0,.2)', width: 10, height: 10, borderRadius: 5 }}
            activeDotStyle={{ backgroundColor: '#000', width: 10, height: 10, borderRadius: 5 }}
        >
            {/* Screen 1 */}
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#E1E4E8' }}>
                <Image 
                    source={require('@/assets/images/welcome.png')} 
                    style={{ width: 200, height: 200 }}
                    resizeMode="contain"
                />
                <Text style={{ fontFamily: 'Poppins', fontSize: 32, color: 'black', fontWeight: 'bold', textAlign: 'center' }}>
                    welcome to dumpy
                </Text>
            </View>

            {/* Screen 2 */}
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#E1E4E8' }}>
                <Image 
                    source={require('@/assets/images/user_plus.png')} 
                    style={{ width: 150, height: 150, marginBottom: 20 }}
                    resizeMode="contain"
                />
                <Text style={{ fontFamily: 'Poppins', fontSize: 32, color: 'black', fontWeight: 'bold', textAlign: 'center' }}>
                    invite friends to your dump
                </Text>
            </View>

            {/* Screen 3 */}
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#E1E4E8' }}>
                <Image 
                    source={require('@/assets/images/image1.png')} 
                    style={{ width: 150, height: 150, marginBottom: 20 }}
                    resizeMode="contain"
                />
                <Text style={{ fontFamily: 'Poppins', fontSize: 32, color: 'black', fontWeight: 'bold', textAlign: 'center' }}>
                    everybody dumps their photos and videos
                </Text>
            </View>

            {/* Screen 4 */}
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#E1E4E8', paddingHorizontal: 30 }}>
                <Image 
                    source={require('@/assets/images/image2.png')} 
                    style={{ width: 150, height: 150, marginBottom: 20 }}
                    resizeMode="contain"
                />
                <Text style={{ fontFamily: 'Poppins', fontSize: 32, color: 'black', fontWeight: 'bold', textAlign: 'center', marginBottom: 10 }}>
                    generate a video to remember, with:
                </Text>
                {['perfect captions', 'automatic friend tagging', 'music of your choice'].map((feature, index) => (
                    <Text key={index} style={{ fontFamily: 'Poppins', fontSize: 24, color: 'black', marginTop: 8, textAlign: 'center' }}>
                        • {feature}
                    </Text>
                ))}
            </View>

            {/* Screen 5 */}
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#E1E4E8' }}>
                <Image 
                    source={require('@/assets/images/share.png')} 
                    style={{ width: 150, height: 150, marginBottom: 20 }}
                    resizeMode="contain"
                />
                <Text style={{ fontFamily: 'Poppins', fontSize: 32, color: 'black', fontWeight: 'bold', textAlign: 'center', paddingHorizontal: 30 }}>
                    share and watch everyone else&apos;s dumps
                </Text>
                <TouchableOpacity 
                    onPress={handleComplete}
                    style={{ marginTop: 40, backgroundColor: '#000', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 25 }}
                >
                    <Text style={{ fontFamily: 'Poppins', fontSize: 18, color: '#fff', fontWeight: 'bold' }}>
                        Get Started
                    </Text>
                </TouchableOpacity>
            </View>
        </Swiper>
    );
}
