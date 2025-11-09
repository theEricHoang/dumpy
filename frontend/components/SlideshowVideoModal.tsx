import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
    Modal,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';

interface SlideshowVideoModalProps {
  visible: boolean;
  onClose: () => void;
  videoUrl: string;
}

export default function SlideshowVideoModal({ 
  visible, 
  onClose, 
  videoUrl 
}: SlideshowVideoModalProps) {
  const player = useVideoPlayer(videoUrl, (player) => {
    player.loop = false;
    player.play();
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Close button */}
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={32} color="#fff" />
        </TouchableOpacity>

        {/* Video */}
        <VideoView 
          style={styles.video} 
          player={player} 
          contentFit="contain"
          nativeControls={true}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
  video: {
    flex: 1,
  },
});
