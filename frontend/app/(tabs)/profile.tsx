import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator } from "react-native";
import { useFonts, Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "expo-router";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

const { width } = Dimensions.get("window");
const DUMP_SIZE = width / 3; // Perfect 3-wide flush grid

interface UserProfile {
  username: string;
  profile_pic_url?: string;
  email: string;
}

export default function ProfilePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [dumps, setDumps] = useState<string[]>([]);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    if (!authLoading && !user) {
      // Redirect to login if not authenticated
      router.replace('/onboarding/Login');
      return;
    }

    if (user) {
      fetchUserProfile();
    }
  }, [user, authLoading]);

  const fetchUserProfile = async () => {
    if (!user) return;

    setLoading(true);

    // Fetch user profile from users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('username, profile_pic_url, email')
      .eq('email', user.email)
      .single();

    if (userError) {
      console.error('Error fetching user profile:', userError);
    } else if (userData) {
      setProfile(userData);
    }

    // TODO: Fetch followers count
    // TODO: Fetch following count
    // TODO: Fetch user's events/dumps

    // Placeholder data for now
    const dummyDumps = Array.from({ length: 15 }, (_, i) => `https://picsum.photos/seed/${i}/300/300`);
    setDumps(dummyDumps);
    setFollowers(128);
    setFollowing(93);

    setLoading(false);
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/onboarding/Login');
  };

  if (!fontsLoaded || authLoading || loading) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#4A9B72" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ fontFamily: 'Poppins_400Regular' }}>Unable to load profile</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scroll}>
      <View style={styles.container}>
        {/* Profile Info Section */}
        <View style={styles.profileBox}>
          {/* Profile Picture + Username */}
          <View style={styles.topBox}>
            {profile.profile_pic_url ? (
              <Image source={{ uri: profile.profile_pic_url }} style={styles.profileImage} />
            ) : (
              <View style={styles.profilePlaceholder} />
            )}
            <Text style={styles.username}>{profile.username}</Text>
          </View>

          {/* Stats Row */}
          <View style={styles.statsBox}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{dumps.length}</Text>
              <Text style={styles.statLabel}>Dumps</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{followers}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{following}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </View>
          </View>

          {/* Sign Out Button */}
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* User’s Dumps Grid */}
        <View style={styles.dumpsBox}>
          <View style={styles.grid}>
            {dumps.map((uri, index) => (
              <TouchableOpacity key={index} style={styles.dumpTile}>
                <Image source={{ uri }} style={styles.dumpImage} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#DADCE0",
  },
  scroll: {
    alignItems: "center",
    paddingBottom: 40,
  },
  container: {
    width: "100%",
    marginTop: 75, // Shift entire layout down 75px
  },
  profileBox: {
    backgroundColor: "#DADCE0",
    alignItems: "center",
    marginBottom: 20,
  },
  topBox: {
    alignItems: "center",
    marginBottom: 12,
  },
  profilePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#B0B0B0",
    marginBottom: 8,
    marginTop: -15, // Shift up 15px
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 8,
    marginTop: -15,
  },
  username: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: "#000",
  },
  statsBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "85%", // <-- Not full width now (was 100%)
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  statItem: {
    alignItems: "center",
  },
  statNumber: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: "#000",
  },
  statLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#555",
  },
  signOutButton: {
    marginTop: 16,
    backgroundColor: "#4A9B72",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 16,
  },
  signOutText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  dumpsBox: {
    flex: 1,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dumpTile: {
    width: DUMP_SIZE,
    height: DUMP_SIZE,
  },
  dumpImage: {
    width: "100%",
    height: "100%",
  },
});
