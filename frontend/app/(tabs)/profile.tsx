import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Dimensions } from "react-native";
import { useFonts, Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";

const { width } = Dimensions.get("window");
const DUMP_SIZE = width / 3; // Perfect 3-wide flush grid

export default function ProfilePage() {
  // Temporary data
  const username = "test_user";
  const followers = 128;
  const following = 93;
  const dumps = Array.from({ length: 15 }, (_, i) => `https://picsum.photos/seed/${i}/300/300`);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scroll}>
      <View style={styles.container}>
        {/* Profile Info Section */}
        <View style={styles.profileBox}>
          {/* Profile Picture + Username */}
          <View style={styles.topBox}>
            <View style={styles.profilePlaceholder} />
            <Text style={styles.username}>{username}</Text>
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
