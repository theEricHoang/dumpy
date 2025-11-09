import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AuthProvider } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {/*
          Do not force-anchor to (tabs). Let the index route decide whether to redirect
          to onboarding or to the tab group based on AsyncStorage.
        */}
        <Stack initialRouteName="onboarding/index" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding/index" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding/SignUp" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding/Login" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding/Selfie" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}
