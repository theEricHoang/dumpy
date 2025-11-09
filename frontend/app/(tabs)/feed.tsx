import { getSupabase } from '@/lib/supabaseClient';
import { Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold, useFonts } from '@expo-google-fonts/poppins';
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';

type Slideshow = {
  id: string;
  event_id: number;
  slideshow_url: string;
  theme_prompt: string;
  duration_seconds: number;
  status: string;
  created_at: string;
  event?: {
    event_name: string;
    event_description: string;
    event_created_at: string;
  };
};

function DumpVideo({ 
  src, 
  isActive, 
  eventName, 
  description, 
  timestamp 
}: { 
  src: string; 
  isActive: boolean;
  eventName?: string;
  description?: string;
  timestamp?: string;
}) {
  const player = useVideoPlayer(src, player => {
    player.loop = true;
    if (isActive) {
      player.play();
    }
  });

  useEffect(() => {
    if (isActive) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, player]);

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const [showIcon, setShowIcon] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (showIcon) {
      // Fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      // Fade out and hide after delay
      const timer = setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => setShowIcon(false));
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [showIcon, fadeAnim]);

  const togglePlayPause = () => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
    setShowIcon(true);
  };

  return (
    <View style={styles.contentContainer}>
      <Pressable style={styles.video} onPress={togglePlayPause}>
        <VideoView style={styles.video} player={player} contentFit="cover" nativeControls={false} />
        {showIcon && (
          <Animated.View style={[styles.iconOverlay, { opacity: fadeAnim }]}>
            <Ionicons 
              name={isPlaying ? 'play' : 'pause'} 
              size={80} 
              color="white" 
            />
          </Animated.View>
        )}
      </Pressable>
      
      {/* Event Info Overlay */}
      <View style={styles.eventInfoOverlay}>
        {eventName && (
          <Text style={styles.eventName}>{eventName}</Text>
        )}
        {description && (
          <Text style={styles.eventDescription}>{description}</Text>
        )}
        {timestamp && (
          <Text style={styles.eventTimestamp}>
            {new Date(timestamp).toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric', 
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })}
          </Text>
        )}
      </View>
    </View>
  );
}

export default function Feed() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold
  });

  const { height: windowHeight, width: SCREEN_WIDTH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  
  // Tab bar height from your _layout.tsx
  const TAB_BAR_HEIGHT = 70;
  
  // Calculate actual available height (excluding just the tab bar)
  const SCREEN_HEIGHT = windowHeight - TAB_BAR_HEIGHT;
  
  const [slideshows, setSlideshows] = useState<Slideshow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const hasInitiallyFetched = useRef(false);

  // Check authentication
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/onboarding/Login');
    }
  }, [user, authLoading]);

  useEffect(() => {
    // Only fetch on initial mount
    if (!hasInitiallyFetched.current && slideshows.length === 0) {
      hasInitiallyFetched.current = true;
      setLoading(true);
      fetchSlideshows();
    }
  }, []);

  const fetchSlideshows = async (isRefreshing = false) => {
    try {
      console.log('Fetching slideshows...');
      const supabase = getSupabase();
      const currentPage = isRefreshing ? 0 : page;
      
      const { data, error } = await supabase
        .from('slideshows')
        .select(`
          *,
          event:events!inner(
            event_name,
            event_description,
            event_created_at
          )
        `)
        // .eq('status', 'completed') // Temporarily removed to debug
        .order('created_at', { ascending: false })
        .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      console.log('Fetched slideshows:', data?.length);
      console.log('First slideshow:', data?.[0]);
      if (data) {
        if (isRefreshing) {
          setSlideshows(data);
          setPage(1);
        } else {
          setSlideshows(prev => currentPage === 0 ? data : [...prev, ...data]);
          setPage(prev => prev + 1);
        }
      }
    } catch (err) {
      console.error('Error fetching slideshows:', err);
      setError(err instanceof Error ? err.message : 'Failed to load slideshows');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setError(null);
    await fetchSlideshows(true);
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const getItemLayout = (_data: any, index: number) => ({
    length: SCREEN_HEIGHT,
    offset: SCREEN_HEIGHT * index,
    index,
  });

  const renderItem = ({ item, index }: { item: Slideshow; index: number }) => (
    <View style={[styles.videoContainer, { height: SCREEN_HEIGHT, width: SCREEN_WIDTH }]}>
      <DumpVideo 
        src={item.slideshow_url} 
        isActive={index === currentIndex}
        eventName={item.event?.event_name}
        description={item.event?.event_description}
        timestamp={item.event?.event_created_at}
      />
    </View>
  );

  if (authLoading || (loading && slideshows.length === 0)) {
    return (
      <View style={[styles.contentContainer, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }]}>
        <ActivityIndicator size="large" color="#4A9B72" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.contentContainer, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', padding: 20 }]}>
        <Ionicons name="alert-circle" size={48} color="red" />
        <Animated.Text style={{ color: 'white', marginTop: 10, textAlign: 'center' }}>{error}</Animated.Text>
      </View>
    );
  }

  if (slideshows.length === 0) {
    return (
      <View style={[styles.contentContainer, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }]}>
        <Ionicons name="videocam-off" size={48} color="white" />
        <Animated.Text style={{ color: 'white', marginTop: 10 }}>No videos available</Animated.Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={slideshows}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        snapToOffsets={slideshows.map((_, index) => index * SCREEN_HEIGHT)}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        getItemLayout={getItemLayout}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={() => {
          if (!loading && !refreshing) {
            fetchSlideshows();
          }
        }}
        onEndReachedThreshold={0.5}
        removeClippedSubviews
        maxToRenderPerBatch={3}
        windowSize={5}
        initialNumToRender={2}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    flex: 1,
  },
  videoContainer: {
    // Height and width set dynamically inline
  },
  video: {
    flex: 1,
  },
  controlsContainer: {
    padding: 10,
  },
  iconOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventInfoOverlay: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    zIndex: 10,
  },
  eventName: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
    color: 'white',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginBottom: 8,
  },
  eventDescription: {
    fontSize: 16,
    fontFamily: 'Poppins_400Regular',
    color: 'white',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginBottom: 6,
  },
  eventTimestamp: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: 'rgba(255, 255, 255, 0.8)',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
