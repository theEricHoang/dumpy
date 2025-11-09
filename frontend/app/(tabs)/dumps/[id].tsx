import InviteModal from '@/components/InviteModal';
import SlideshowVideoModal from '@/components/SlideshowVideoModal';
import ThemePromptModal from '@/components/ThemePromptModal';
import { apiClient } from '@/lib/apiClient';
import { getSupabase } from '@/lib/supabaseClient';
import { Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold, useFonts } from '@expo-google-fonts/poppins';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Event = {
  id: number;
  event_name: string;
  event_description: string;
  event_created_at: string;
};

type Media = {
  media_id: string;
  event_id: number;
  file_url: string;
  file_type: string;
  location: string;
  ai_caption?: string;
  uploaded_by: number;
  tagged_users: string[];
};

export default function DumpWorkspace() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [themePromptModalVisible, setThemePromptModalVisible] = useState(false);
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<'processing' | 'completed' | 'failed' | null>(null);
  const [jobMessage, setJobMessage] = useState<string>('');
  const [slideshowUrl, setSlideshowUrl] = useState<string | null>(null);
  const pollingInterval = useRef<number | null>(null);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold
  });

  useEffect(() => {
    if (id) {
      fetchEventData();
    }
  }, [id]);

  // Refresh media when screen comes into focus (after upload)
  useFocusEffect(
    useCallback(() => {
      if (id) {
        console.log('[Dump Workspace] Screen focused, refreshing media...');
        fetchEventData();
      }
    }, [id])
  );

  const fetchEventData = async () => {
    try {
      const supabase = getSupabase();
      
      // Fetch event details
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('event_id', id)
        .single();

      if (eventError) throw eventError;
      setEvent(eventData);

      // Fetch media for this event
      const { data: mediaData, error: mediaError } = await supabase
        .from('media')
        .select('*')
        .eq('event_id', id);

      if (mediaError) throw mediaError;
      setMedia(mediaData || []);

    } catch (err) {
      console.error('Error fetching event data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load event');
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = () => {
    setInviteModalVisible(true);
  };

  const handleInviteUsers = async (userIds: number[]) => {
    try {
      const supabase = getSupabase();
      
      // Create event_participants records for each user
      const participants = userIds.map(userId => ({
        event_id: parseInt(id!),
        user_id: userId,
      }));

      const { error } = await supabase
        .from('event_participants')
        .insert(participants);

      if (error) {
        console.error('Failed to invite users:', error);
        alert('Failed to invite users. Please try again.');
        return;
      }

      console.log(`Successfully added ${userIds.length} user(s) to event ${id}`);
      alert(`Successfully invited ${userIds.length} user${userIds.length > 1 ? 's' : ''} to the dump!`);
    } catch (error) {
      console.error('Error inviting users:', error);
      alert('An error occurred while inviting users.');
    }
  };

  const handleFinishDump = () => {
    if (media.length === 0) return;
    if (jobStatus === 'completed' && slideshowUrl) {
      setVideoModalVisible(true);
      return;
    }
    setThemePromptModalVisible(true);
  };

  const handleGenerateSlideshow = async (themePrompt: string) => {
    try {
      setIsGenerating(true);
      
      const response = await apiClient.generateSlideshow({
        event_id: parseInt(id!),
        theme_prompt: themePrompt,
      });

      setJobId(response.job_id);
      setJobStatus(response.status as 'processing' | 'completed' | 'failed');
      setJobMessage(response.message);
      setThemePromptModalVisible(false);

      // Start polling for status
      startPolling(response.job_id);
    } catch (error) {
      console.error('Failed to generate slideshow:', error);
      alert('Failed to start slideshow generation. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const startPolling = (jobId: string) => {
    // Clear any existing polling
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
    }

    // Poll every 5 seconds
    pollingInterval.current = setInterval(async () => {
      try {
        const status = await apiClient.getSlideshowStatus(jobId);
        setJobStatus(status.status as 'processing' | 'completed' | 'failed');
        setJobMessage(status.message);

        if (status.status === 'completed' && status.slideshow_url) {
          setSlideshowUrl(status.slideshow_url);
          stopPolling();
        } else if (status.status === 'failed') {
          alert(`Slideshow generation failed: ${status.error || 'Unknown error'}`);
          stopPolling();
        }
      } catch (error) {
        console.error('Failed to fetch slideshow status:', error);
      }
    }, 5000) as unknown as number;
  };

  const stopPolling = () => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  const renderMediaItem = ({ item }: { item: Media }) => (
    <View style={styles.mediaItem}>
      <Image 
        source={{ uri: item.file_url }} 
        style={styles.mediaImage}
        resizeMode="cover"
      />
      {/* {item.ai_caption && (
        <View style={styles.captionContainer}>
          <Text style={styles.caption}>{item.ai_caption}</Text>
        </View>
      )} */}
    </View>
  );

  if (!fontsLoaded || loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6D9C91" />
      </View>
    );
  }

  if (error || !event) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle" size={48} color="red" />
        <Text style={styles.errorText}>{error || 'Event not found'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with event info and action buttons */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons 
            name="arrow-back" 
            size={28} 
            color="#333" 
            onPress={() => router.push('/dumps')}
            style={styles.backButton}
          />
          <View>
            <Text style={styles.eventName}>{event.event_name}</Text>
            <Text style={styles.mediaCount}>{media.length} photos</Text>
          </View>
        </View>
        
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.inviteButton} onPress={handleInvite}>
            <Ionicons name="person-add" size={20} color="#6D9C91" />
            <Text style={styles.inviteButtonText}>Invite</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.finishButton, 
              (media.length === 0 || (jobStatus === 'processing')) && styles.disabledButton,
              jobStatus === 'completed' && styles.completedButton
            ]} 
            onPress={handleFinishDump}
            disabled={media.length === 0 || jobStatus === 'processing'}
          >
            {jobStatus === 'processing' ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons 
                name={jobStatus === 'completed' ? 'videocam' : 'checkmark-circle'} 
                size={20} 
                color="white" 
              />
            )}
            <Text style={styles.finishButtonText}>
              {jobStatus === 'processing' 
                ? jobMessage 
                : jobStatus === 'completed' 
                ? 'View Dumpy' 
                : 'Finish'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Media feed */}
      {media.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="images-outline" size={64} color="#CCC" />
          <Text style={styles.emptyStateText}>No photos yet</Text>
          <Text style={styles.emptyStateSubtext}>Tap the + button to add photos</Text>
        </View>
      ) : (
        <FlatList
          data={media}
          renderItem={renderMediaItem}
          keyExtractor={item => item.media_id}
          contentContainerStyle={styles.mediaFeed}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Invite Modal */}
      <InviteModal
        visible={inviteModalVisible}
        onClose={() => setInviteModalVisible(false)}
        eventId={id || ''}
        onInvite={handleInviteUsers}
      />

      {/* Theme Prompt Modal */}
      <ThemePromptModal
        visible={themePromptModalVisible}
        onClose={() => setThemePromptModalVisible(false)}
        onGenerate={handleGenerateSlideshow}
        isGenerating={isGenerating}
      />

      {/* Slideshow Video Modal */}
      {slideshowUrl && (
        <SlideshowVideoModal
          visible={videoModalVisible}
          onClose={() => setVideoModalVisible(false)}
          videoUrl={slideshowUrl}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  backButton: {
    marginRight: 12,
  },
  eventName: {
    fontSize: 20,
    fontFamily: 'Poppins_600SemiBold',
    color: '#333',
  },
  mediaCount: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: '#666',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  inviteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#6D9C91',
    gap: 6,
  },
  inviteButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    color: '#6D9C91',
  },
  finishButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#4A9B72',
    gap: 6,
  },
  disabledButton: {
    backgroundColor: '#C7D9CF',
  },
  completedButton: {
    backgroundColor: '#4A9B72',
  },
  finishButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    color: 'white',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyStateText: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    color: '#999',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: '#BBB',
    marginTop: 8,
  },
  mediaFeed: {
    paddingBottom: 20,
  },
  mediaItem: {
    width: '100%',
    marginBottom: 16,
    backgroundColor: '#F8F8F8',
  },
  mediaImage: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  captionContainer: {
    padding: 12,
    backgroundColor: 'white',
  },
  caption: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: '#333',
    lineHeight: 20,
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'Poppins_400Regular',
    color: '#666',
    marginTop: 12,
  },
});
