import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Index() {
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

  if (isOnboarded === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return isOnboarded ? (
    <Redirect href="/(tabs)/feed" />
  ) : (
    <Redirect href="/onboarding" />
  );
}