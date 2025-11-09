import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useState } from "react";
import { router, useRouter } from "expo-router";
import { useFonts, Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";
import { useAuth } from '@/contexts/AuthContext';

export default function Login() {
  const { signIn, loading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    const { error } = await signIn(username, password);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      router.replace('/(tabs)/feed');
    }
  };

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold
  });

  if (!fontsLoaded) return null;

  const isFormComplete = username.trim() !== "" && password.trim() !== "";

  return (
    <View style={styles.container}>
      <Text style={styles.header}>log in</Text>
        <View style={styles.formContainer}>
            {/* Username */}
            <Text style={styles.label}>username</Text>
            <TextInput
                style={styles.input}
                placeholder="username"
                placeholderTextColor="#555"
                value={username}
                onChangeText={setUsername}
            />

            {/* Password */}
            <Text style={styles.label}>password</Text>
            <TextInput
                style={styles.input}
                placeholder="password"
                placeholderTextColor="#555"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
            />
        </View>

      {/* Log In Button */}
      <TouchableOpacity 
        style={[styles.button, !isFormComplete && styles.buttonDisabled]}
        disabled={!isFormComplete}
        onPress={handleLogin}
      >
        <Text style={styles.buttonText}>log in</Text>
      </TouchableOpacity>

      {/* Not a member yet */}
      <Text style={styles.footer}>
        not a member?{" "}
        <Text
          style={styles.signupLink}
          onPress={() => router.replace("/onboarding/SignUp")}
        >
          create an account
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#DADCE0", // same light gray
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
});
