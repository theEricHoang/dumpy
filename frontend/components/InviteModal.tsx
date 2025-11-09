import { getSupabase } from '@/lib/supabaseClient';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

interface User {
  user_id: number;
  username: string;
  profile_pic_url?: string;
}

interface InviteModalProps {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  onInvite: (userIds: number[]) => void;
}

export default function InviteModal({ visible, onClose, eventId, onInvite }: InviteModalProps) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) {
      // Reset state when modal closes
      setQuery('');
      setUsers([]);
      setSelectedUsers(new Set());
      return;
    }
  }, [visible]);

  useEffect(() => {
    if (query.trim().length === 0) {
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const fetchUsers = async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('users')
        .select('user_id, username, profile_pic_url')
        .ilike('username', `%${query}%`)
        .limit(20);
      
      if (!error && data) {
        setUsers(data);
      }
      setLoading(false);
    };

    const debounceTimeout = setTimeout(fetchUsers, 400);
    return () => clearTimeout(debounceTimeout);
  }, [query]);

  const toggleUserSelection = (userId: number) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const handleInvite = () => {
    if (selectedUsers.size === 0) return;
    onInvite(Array.from(selectedUsers));
    onClose();
  };

  const renderUser = ({ item }: { item: User }) => {
    const isSelected = selectedUsers.has(item.user_id);
    
    return (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => toggleUserSelection(item.user_id)}
      >
        <View style={styles.userInfo}>
          {item.profile_pic_url ? (
            <Image source={{ uri: item.profile_pic_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={24} color="#999" />
            </View>
          )}
          <Text style={styles.username}>{item.username}</Text>
        </View>
        
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Ionicons name="checkmark" size={18} color="white" />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Invite to Dump</Text>
          <TouchableOpacity
            onPress={handleInvite}
            disabled={selectedUsers.size === 0}
          >
            <Text style={[
              styles.inviteButton,
              selectedUsers.size === 0 && styles.inviteButtonDisabled
            ]}>
              Invite
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search input */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search users..."
            placeholderTextColor="#999"
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>

        {/* Selected count */}
        {selectedUsers.size > 0 && (
          <View style={styles.selectedBanner}>
            <Text style={styles.selectedText}>
              {selectedUsers.size} user{selectedUsers.size !== 1 ? 's' : ''} selected
            </Text>
          </View>
        )}

        {/* User list */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#6D9C91" />
          </View>
        ) : users.length === 0 && query.trim().length > 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons name="person-outline" size={48} color="#CCC" />
            <Text style={styles.emptyText}>No users found</Text>
          </View>
        ) : (
          <FlatList
            data={users}
            renderItem={renderUser}
            keyExtractor={(item) => item.user_id.toString()}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    color: '#333',
  },
  inviteButton: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    color: '#6D9C91',
  },
  inviteButtonDisabled: {
    color: '#CCC',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    margin: 16,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Poppins_400Regular',
    paddingVertical: 12,
    color: '#333',
  },
  selectedBanner: {
    backgroundColor: '#E8F5F1',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  selectedText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: '#6D9C91',
    textAlign: 'center',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Poppins_400Regular',
    color: '#999',
    marginTop: 12,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  username: {
    fontSize: 16,
    fontFamily: 'Poppins_400Regular',
    color: '#333',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#CCC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#6D9C91',
    borderColor: '#6D9C91',
  },
});
