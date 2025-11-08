import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

function DumpVideo({ src }: { src: string }) {
  const player = useVideoPlayer(src, player => {
    player.loop = true;
    player.play();
  });

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
  return (
    <DumpVideo src="https://dumpymediauploads.blob.core.windows.net/event-media/events/999/slideshow_bae7b7d8.mp4" />
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    flex: 1,
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
