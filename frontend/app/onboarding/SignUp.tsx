import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabaseClient';

// Basic phone pattern (very lenient, adjust as needed)
const PHONE_REGEX = /^[+]?[0-9]{7,15}$/;

export default function SignUp() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    const passwordsMatch = password && confirmPassword && password === confirmPassword;
    const phoneValid = PHONE_REGEX.test(phone.trim());
    const passwordStrongEnough = password.length >= 6;
    const canSubmit = !loading && username && phoneValid && passwordStrongEnough && passwordsMatch;

    const handleSignUp = async () => {
        setError(null);
        setInfo(null);
        if (!canSubmit) return;
        setLoading(true);
        // Phone + password sign up (requires phone auth enabled in Supabase project)
        const { data, error: signUpError } = await supabase.auth.signUp({
            phone: phone.trim(),
            password,
        });
        if (signUpError) {
            setLoading(false);
            setError(signUpError.message);
            return;
        }
        // Save username in user metadata (will work after user object exists; session may be null until OTP confirm).
        if (data.user) {
            const { error: metaError } = await supabase.auth.updateUser({ data: { username } });
            if (metaError) {
                setError(metaError.message);
            }
        }
        setLoading(false);
        // For phone sign-up, Supabase typically sends an OTP; user must verify before full session.
        setInfo('Account created. Check SMS for verification code to complete sign-up.');
        Alert.alert('Verify your phone', 'An OTP may have been sent to your phone. After verifying, continue.', [
            { text: 'OK', onPress: () => router.replace('/') }
        ]);
    };

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 70, backgroundColor: '#E1E4E8' }}>
                <Text style={{ fontFamily: 'Poppins', fontSize: 34, fontWeight: '700', marginBottom: 6 }}>create an account</Text>
                <View style={{ gap: 20 }}>
                    <View>
                        <Text style={{ fontFamily: 'Poppins', fontSize: 14, marginBottom: 6 }}>Username</Text>
                        <TextInput
                            value={username}
                            onChangeText={setUsername}
                            placeholder="yourusername"
                            autoCapitalize="none"
                            style={{ backgroundColor: '#afa8a8ff', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, fontSize: 16 }}
                        />
                    </View>
                    <View>
                        <Text style={{ fontFamily: 'Poppins', fontSize: 14, marginBottom: 6 }}>Phone</Text>
                        <TextInput
                            value={phone}
                            onChangeText={setPhone}
                            placeholder="+15551234567"
                            keyboardType="phone-pad"
                            style={{ backgroundColor: '#afa8a8ff', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, fontSize: 16 }}
                        />
                        {!phoneValid && phone.length > 0 && (
                            <Text style={{ color: '#b00020', fontFamily: 'Poppins', fontSize: 12, marginTop: 4 }}>invalid phone format</Text>
                        )}
                    </View>
                    <View>
                        <Text style={{ fontFamily: 'Poppins', fontSize: 14, marginBottom: 6 }}>Password</Text>
                        <TextInput
                            value={password}
                            onChangeText={setPassword}
                            placeholder="••••••"
                            secureTextEntry
                            style={{ backgroundColor: '#afa8a8ff', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, fontSize: 16 }}
                        />
                        {!passwordStrongEnough && password.length > 0 && (
                            <Text style={{ color: '#b00020', fontFamily: 'Poppins', fontSize: 12, marginTop: 4 }}>minimum 6 characters</Text>
                        )}
                    </View>
                    <View>
                        <Text style={{ fontFamily: 'Poppins', fontSize: 14, marginBottom: 6 }}>Confirm Password</Text>
                        <TextInput
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            placeholder="••••••"
                            secureTextEntry
                            style={{ backgroundColor: '#afa8a8ff', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, fontSize: 16 }}
                        />
                        {confirmPassword.length > 0 && !passwordsMatch && (
                            <Text style={{ color: '#b00020', fontFamily: 'Poppins', fontSize: 12, marginTop: 4 }}>passwords do not match</Text>
                        )}
                    </View>

                    {error && (
                        <Text style={{ color: '#b00020', fontFamily: 'Poppins', fontSize: 13 }}>{error}</Text>
                    )}
                    {info && !error && (
                        <Text style={{ color: '#064e3b', fontFamily: 'Poppins', fontSize: 13 }}>{info}</Text>
                    )}

                    <TouchableOpacity
                        disabled={!canSubmit}
                        onPress={handleSignUp}
                        style={{ backgroundColor: canSubmit ? '#000' : '#666', paddingVertical: 16, borderRadius: 18, alignItems: 'center' }}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={{ color: '#fff', fontFamily: 'Poppins', fontSize: 16, fontWeight: '600' }}>Create account</Text>
                        )}
                    </TouchableOpacity>

                    {/* Already a member? Log in */}
                    <Text style={{ textAlign: 'center', marginTop: 12, fontFamily: 'Poppins', color: '#222' }}>
                        already a member?{' '}
                        <Text
                            style={{ color: '#6D9C91' }}
                            onPress={() => router.replace('/onboarding/Login')}
                        >
                            log in
                        </Text>
                    </Text>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}