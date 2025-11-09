import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';

export default function Index() {
  const { user, loading: authLoading } = useAuth();
  // null = unknown/loading, boolean once loaded
  const [isOnboarded, setIsOnboarded] = useState<null | boolean>(null);

  useEffect(() => {
    let mounted = true;
    const checkOnboarding = async () => {
      try {
        const value = await AsyncStorage.getItem('hasSeenOnboarding');
        if (mounted) setIsOnboarded(value === 'true');
      } catch (e) {
        // Fail safe: treat as not onboarded
        if (mounted) setIsOnboarded(false);
      }
    };
    checkOnboarding();
    return () => { mounted = false; };
  }, []);

  // Wait for both auth and onboarding checks
  if (authLoading || isOnboarded === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // If not onboarded, show onboarding
  if (!isOnboarded) {
    return <Redirect href="/onboarding" />;
  }

  // If onboarded but not authenticated, show login
  if (!user) {
    return <Redirect href="/onboarding/Login" />;
  }

  // If onboarded and authenticated, show app
  return <Redirect href="/(tabs)/feed" />;
}