import InviteModal from '@/components/InviteModal';
import { getSupabase } from '@/lib/supabaseClient';
import { Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold, useFonts } from '@expo-google-fonts/poppins';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
    // TODO: Implement backend call to add users to event
    console.log('Adding users to dump:', userIds, 'for event:', id);
    // Example: await supabase.from('event_participants').insert(userIds.map(userId => ({ event_id: id, user_id: userId })))
  };

  const handleFinishDump = async () => {
    // TODO: Call backend to generate AI slideshow
    console.log('Finish dump and generate slideshow');
  };

  const renderMediaItem = ({ item }: { item: Media }) => (
    <View style={styles.mediaItem}>
      <Image 
        source={{ uri: item.file_url }} 
        style={styles.mediaImage}
        resizeMode="cover"
      />
      {item.ai_caption && (
        <View style={styles.captionContainer}>
          <Text style={styles.caption}>{item.ai_caption}</Text>
        </View>
      )}
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
            style={[styles.finishButton, media.length === 0 && styles.disabledButton]} 
            onPress={handleFinishDump}
            disabled={media.length === 0}
          >
            <Ionicons name="checkmark-circle" size={20} color="white" />
            <Text style={styles.finishButtonText}>Finish</Text>
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
