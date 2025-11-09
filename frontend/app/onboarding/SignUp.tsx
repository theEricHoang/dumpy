import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useFonts, Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";

// Lightweight email shape check (let Supabase do final validation)
const EMAIL_REGEX = /\S+@\S+\.\S+/;

export default function SignUp() {
    const router = useRouter();
    const { signUp, user, loading } = useAuth();
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loadingSignUp, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    const [fontsLoaded] = useFonts({
        Poppins_400Regular,
        Poppins_600SemiBold,
        Poppins_700Bold
    });

    // Redirect to login if user is already logged in
    useEffect(() => {
        if (!loading && user) {
            router.replace('/(tabs)/feed');
        }
    }, [user, loading]);

    if (!fontsLoaded || loading) return <ActivityIndicator />;

    const passwordsMatch = password && confirmPassword && password === confirmPassword;
    const emailTrim = email.trim();
    const emailValid = EMAIL_REGEX.test(emailTrim);
    const passwordStrongEnough = password.length >= 6;
    // Do not block submit purely on our regex; allow backend to validate too.
    const canSubmit = !loadingSignUp && username && emailTrim.length > 3 && passwordStrongEnough && passwordsMatch;

    const handleSignUp = async () => {
        setError(null);
        setInfo(null);
        if (!canSubmit) return;
        setLoading(true);
        // Email + password sign up
        const { error: signUpError } = await signUp(
            emailTrim.toLowerCase(),
            password,
            username
        );
        if (signUpError) {
            setLoading(false);
            setError(signUpError.message);
            return;
        }

        setLoading(false);
        setInfo('Account created.');
        router.replace('/(tabs)/feed');
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
                        disabled={!canSubmit}
                        onPress={handleSignUp}
                        style={[styles.button, (!canSubmit) && styles.buttonDisabled]}
                    >
                        {loadingSignUp ? (
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
});