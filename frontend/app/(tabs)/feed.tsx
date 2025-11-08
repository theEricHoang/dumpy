import { getSupabase } from '@/lib/supabaseClient';
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Slideshow = {
  id: string;
  event_id: number;
  slideshow_url: string;
  theme_prompt: string;
  duration_seconds: number;
  status: string;
  created_at: string;
};

function DumpVideo({ src, isActive }: { src: string; isActive: boolean }) {
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
    </View>
  );
}

export default function Feed() {
  const { height: windowHeight, width: SCREEN_WIDTH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  
  // Calculate actual available height (excluding tab bar and safe areas)
  const SCREEN_HEIGHT = windowHeight - insets.top - insets.bottom;
  
  const [slideshows, setSlideshows] = useState<Slideshow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 10;

  useEffect(() => {
    fetchSlideshows();
  }, []);

  const fetchSlideshows = async () => {
    try {
      console.log('Fetching slideshows...');
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('slideshows')
        .select('*')
        // .eq('status', 'completed') // Temporarily removed to debug
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      console.log('Fetched slideshows:', data?.length);
      console.log('First slideshow:', data?.[0]);
      if (data) {
        setSlideshows(prev => page === 0 ? data : [...prev, ...data]);
        setPage(prev => prev + 1);
      }
    } catch (err) {
      console.error('Error fetching slideshows:', err);
      setError(err instanceof Error ? err.message : 'Failed to load slideshows');
    } finally {
      setLoading(false);
    }
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
      <DumpVideo src={item.slideshow_url} isActive={index === currentIndex} />
    </View>
  );

  if (loading && slideshows.length === 0) {
    return (
      <View style={[styles.contentContainer, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }]}>
        <Ionicons name="hourglass" size={48} color="white" />
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
        onEndReached={() => {
          if (!loading) {
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
});
