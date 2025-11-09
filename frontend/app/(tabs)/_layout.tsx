import { Ionicons } from '@expo/vector-icons';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { View } from 'react-native';

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();

  // check if user is on dump page
  const isInDump = pathname.startsWith('/dumps/') && pathname.split('/').length === 3;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: 70,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          elevation: 10,
          paddingTop: 5,
        },
      }}>
      {/* feed tab */}
      <Tabs.Screen
        name="feed"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons size={size} name="home-outline" color={color} />
          ),
          tabBarActiveTintColor: '#6D9C91',
          tabBarInactiveTintColor: '#777',
        }}
      />
      {/* search tab */}
      <Tabs.Screen
        name="search"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons size={size} name="search-outline" color={color} />
          ),
          tabBarActiveTintColor: '#6D9C91',
          tabBarInactiveTintColor: '#777',
        }}
      />
      {/* upload button */}
      <Tabs.Screen
        name="upload"
        options={{
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: isInDump ? '#4A9B72' : '#C7D9CF',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 30,
              }}
            >
              <Ionicons
                name="add"
                size={36}
                color="white"
              />
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            if (isInDump) {
              router.push({
                pathname: '/upload',
                params: { returnTo: pathname }
              });
            }
          },
        }}
      />
      {/* dumps tab */}
      <Tabs.Screen
        name="dumps/index"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons size={size} name="albums-outline" color={color} />
          ),
          tabBarActiveTintColor: '#6D9C91',
          tabBarInactiveTintColor: '#777',
        }}
      />
      {/* dumps detail - hidden from tab bar */}
      <Tabs.Screen
        name="dumps/[id]"
        options={{
          href: null, // This hides it from the tab bar
        }}
      />
      {/* profile tab */}
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons size={size} name="person-outline" color={color} />
          ),
          tabBarActiveTintColor: '#6D9C91',
          tabBarInactiveTintColor: '#777',
        }}
      />
    </Tabs>
  );
}
