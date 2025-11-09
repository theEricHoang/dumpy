import { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, Image, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabaseClient';
import { useFonts, Poppins_400Regular, Poppins_600SemiBold } from '@expo-google-fonts/poppins';
import { useAuth } from '@/contexts/AuthContext';

interface User {
  user_id: number;
  username: string;
  profile_pic_url?: string;
}

export default function Search() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
  });

  // Check authentication
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/onboarding/Login');
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (query.trim().length === 0) {
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const fetchUsers = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('user_id, username, profile_pic_url')
        .ilike('username', `%${query}%`) // case-insensitive partial match
        .limit(20);
      if (!error) setUsers(data);
      setLoading(false);
    };

    const debounceTimeout = setTimeout(fetchUsers, 400);
    return () => clearTimeout(debounceTimeout);
  }, [query]);

  if (!fontsLoaded || authLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#4A9B72" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>search</Text>

      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchBar}
          placeholder="search for users..."
          placeholderTextColor="#555"
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <FlatList
        data={users}
        keyExtractor={(item) => item.user_id.toString()}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 80 }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4A9B72" />
              <Text style={styles.loadingText}>searching...</Text>
            </View>
          ) : query.length > 0 ? (
            <Text style={styles.noResults}>no users found.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.userCard}
            onPress={() => router.push(`/profile/${item.user_id}` as any)} // optional: navigate to user profile
          >
            <Image
              source={{ uri: item.profile_pic_url || 'https://placekitten.com/100/100' }}
              style={styles.userImage}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.username}>{item.username}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#DADCE0',
    paddingHorizontal: 16,
  },
  header: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 24,
    color: 'black',
    marginBottom: 16,
  },
  searchBarContainer: {
    marginBottom: 12,
  },
  searchBar: {
    backgroundColor: 'white',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BCE0D3',
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: 'black',
    fontFamily: 'Poppins_400Regular',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderColor: '#BCE0D3',
    borderWidth: 1,
  },
  userImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  username: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
    color: 'black',
  },
  fullName: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: '#555',
  },
  loadingContainer: {
    marginTop: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#555',
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
  },
  noResults: {
    textAlign: 'center',
    marginTop: 40,
    color: '#555',
    fontFamily: 'Poppins_400Regular',
  },
});
