import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { getSupabase, hasSupabaseEnv } from '../../lib/supabaseClient';
import { useFonts, Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";

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

    const [fontsLoaded] = useFonts({
        Poppins_400Regular,
        Poppins_600SemiBold,
        Poppins_700Bold
    });

    if (!fontsLoaded) return null;

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
    setInfo('Account created. Next, take a quick selfie.');
    router.replace('/onboarding/Selfie');
    };

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.innerContainer}>
                <Text style={styles.header}>create an account</Text>
                <View style={styles.formContainer}>
                    <View>
                        <Text style={styles.label}>username</Text>
                        <TextInput
                            value={username}
                            onChangeText={setUsername}
                            placeholder="username"
                            placeholderTextColor="#555"
                            autoCapitalize="none"
                            style={styles.input}
                        />
                    </View>
                    <View>
                        <Text style={styles.label}>email</Text>
                        <TextInput
                            value={email}
                            onChangeText={setEmail}
                            placeholder="you@example.com"
                            placeholderTextColor="#555"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            textContentType="emailAddress"
                            autoComplete="email"
                            style={styles.input}
                        />
                    </View>
                    <View>
                        <Text style={styles.label}>password</Text>
                        <TextInput
                            value={password}
                            onChangeText={setPassword}
                            placeholder="password"
                            placeholderTextColor="#555"
                            secureTextEntry
                            style={styles.input}
                        />
                        {!passwordStrongEnough && password.length > 0 && (
                            <Text style={styles.errorText}>minimum 6 characters</Text>
                        )}
                    </View>
                    <View>
                        <Text style={styles.label}>confirm password</Text>
                        <TextInput
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            placeholder="password"
                            placeholderTextColor="#555"
                            secureTextEntry
                            style={styles.input}
                        />
                        {confirmPassword.length > 0 && !passwordsMatch && (
                            <Text style={styles.errorText}>passwords do not match</Text>
                        )}
                    </View>

                    {error && (
                        <Text style={styles.errorText}>{error}</Text>
                    )}
                    {info && !error && (
                        <Text style={styles.successText}>{info}</Text>
                    )}

                    <TouchableOpacity
                        disabled={!canSubmit || !envOk}
                        onPress={handleSignUp}
                        style={[styles.button, (!canSubmit || !envOk) && styles.buttonDisabled]}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>create account</Text>
                        )}
                    </TouchableOpacity>

                    {/* Already a member? Log in */}
                    <Text style={styles.footer}>
                        already a member?{' '}
                        <Text
                            style={styles.signupLink}
                            onPress={() => router.replace('/onboarding/Login')}
                        >
                            log in
                        </Text>
                    </Text>
                    {!envOk && (
                        <Text style={styles.envWarning}>
                            Supabase env vars are not set. Create a .env.development with EXPO_PUBLIC_SUPABASE_URL & EXPO_PUBLIC_SUPABASE_ANON_KEY then restart Expo.
                        </Text>
                    )}
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    innerContainer: {
        flex: 1,
        backgroundColor: "#DADCE0",
        paddingHorizontal: 32,
        justifyContent: "center",
    },
    formContainer: {
        width: 253,
        maxWidth: "80%",
        alignSelf: "center",
        justifyContent: "space-between",
        paddingVertical: 10,
    },
    header: {
        fontFamily: "Poppins_700Bold",
        fontSize: 32,
        textAlign: "center",
        color: "black",
        marginBottom: 36,
    },
    label: {
        fontFamily: "Poppins_400Regular",
        fontSize: 14,
        color: "#222",
        marginBottom: 6,
        marginLeft: 10,
    },
    input: {
        backgroundColor: "white",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#BCE0D3",
        paddingVertical: 10,
        paddingHorizontal: 16,
        fontSize: 16,
        marginBottom: 16,
        fontFamily: "Poppins_400Regular",
    },
    button: {
        backgroundColor: "#4A9B72",
        paddingVertical: 14,
        borderRadius: 16,
        marginTop: 8,
        width: 253,
        alignSelf: "center",
    },
    buttonDisabled: {
        backgroundColor: "#C7D9CF",
    },
    buttonText: {
        color: "white",
        fontFamily: "Poppins_600SemiBold",
        fontSize: 16,
        textAlign: "center",
    },
    footer: {
        textAlign: "center",
        marginTop: 20,
        fontFamily: "Poppins_400Regular",
        color: "#222",
    },
    signupLink: {
        color: "#6D9C91",
    },
    errorText: {
        color: "#b00020",
        fontFamily: "Poppins_400Regular",
        fontSize: 12,
        marginTop: 4,
        textAlign: "center",
    },
    successText: {
        color: "#064e3b",
        fontFamily: "Poppins_400Regular",
        fontSize: 13,
    },
    envWarning: {
        textAlign: "center",
        marginTop: 8,
        fontFamily: "Poppins_400Regular",
        color: "#b00020",
        fontSize: 12,
    },
});