import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { getSupabase, hasSupabaseEnv } from '../../lib/supabaseClient';

// Lightweight email shape check (let Supabase do final validation)
const EMAIL_REGEX = /\S+@\S+\.\S+/;

export default function SignUp() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    const passwordsMatch = password && confirmPassword && password === confirmPassword;
    const emailTrim = email.trim();
    const emailValid = EMAIL_REGEX.test(emailTrim);
    const passwordStrongEnough = password.length >= 6;
    const envOk = hasSupabaseEnv();
    // Do not block submit purely on our regex; allow backend to validate too.
    const canSubmit = !loading && username && emailTrim.length > 3 && passwordStrongEnough && passwordsMatch;
    // Debug logs removed

    const handleSignUp = async () => {
        setError(null);
        setInfo(null);
        if (!canSubmit) return;
        setLoading(true);
        if (!hasSupabaseEnv()) {
            setLoading(false);
            setError('Supabase environment variables missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.');
            return;
        }
        // Email + password sign up
        const supabase = getSupabase();
        const { data, error: signUpError } = await supabase.auth.signUp({
            email: emailTrim.toLowerCase(),
            password,
            options: {
                data: { username }
            }
        });
        if (signUpError) {
            setLoading(false);
            setError(signUpError.message);
            return;
        }
        // If no session is returned, RLS will likely block inserts into public tables.
        if (!data.session) {
            setLoading(false);
            setError('Signup succeeded but no session is active. Enable Email provider and disable email confirmation in Supabase Auth, or write via a backend service role.');
            return;
        }
        // Immediately record username/email in custom "users" table.
        // Your table uses an INTEGER PK named user_id. We should NOT attempt to write to user_id (serial/identity fills it).
        // We'll insert only the known fields (email, username) and let the DB assign user_id.
        // If you later want to link to auth.users, add a uuid column (e.g. auth_user_id uuid references auth.users(id))
        // and switch this insert to include that column.
        if (data.user) {
            // Your users.password column is NOT NULL; since Auth stores the real password securely
            // and this table is not used for authentication, we store a neutral placeholder.
            // Recommended: drop the NOT NULL constraint or remove this column entirely.
            const { error: usersError } = await supabase
                .from('users')
                .insert({ email: emailTrim.toLowerCase(), username, password: '***' });
            if (usersError) {
                setLoading(false);
                setError(`User record save failed: ${usersError.message}`);
                return;
            }
        }

        setLoading(false);
        setInfo('Account created.');
        router.replace('/');
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
                        <Text style={{ fontFamily: 'Poppins', fontSize: 14, marginBottom: 6 }}>Email</Text>
                        <TextInput
                            value={email}
                            onChangeText={setEmail}
                            placeholder="you@example.com"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            textContentType="emailAddress"
                            autoComplete="email"
                            style={{ backgroundColor: '#afa8a8ff', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, fontSize: 16 }}
                        />
                        {/* Email format hint removed; server will validate */}
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
                        disabled={!canSubmit || !envOk}
                        onPress={handleSignUp}
                        style={{ backgroundColor: (canSubmit && envOk) ? '#000' : '#666', paddingVertical: 16, borderRadius: 18, alignItems: 'center' }}
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
                    {!envOk && (
                        <Text style={{ textAlign: 'center', marginTop: 8, fontFamily: 'Poppins', color: '#b00020', fontSize: 12 }}>
                            Supabase env vars are not set. Create a .env.development with EXPO_PUBLIC_SUPABASE_URL & EXPO_PUBLIC_SUPABASE_ANON_KEY then restart Expo.
                        </Text>
                    )}
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}