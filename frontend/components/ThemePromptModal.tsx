import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

interface ThemePromptModalProps {
  visible: boolean;
  onClose: () => void;
  onGenerate: (themePrompt: string) => Promise<void>;
  isGenerating?: boolean;
}

export default function ThemePromptModal({ 
  visible, 
  onClose, 
  onGenerate,
  isGenerating = false 
}: ThemePromptModalProps) {
  const [themePrompt, setThemePrompt] = useState('');

  const handleGenerate = async () => {
    if (!themePrompt.trim()) return;
    await onGenerate(themePrompt.trim());
  };

  const handleClose = () => {
    setThemePrompt('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
      transparent={false}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} disabled={isGenerating}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Generate Dumpy</Text>
          <View style={{ width: 28 }} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.label}>Theme Prompt</Text>
          <TextInput
            style={styles.input}
            placeholder="make it super hype...."
            placeholderTextColor="#999"
            value={themePrompt}
            onChangeText={setThemePrompt}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            editable={!isGenerating}
            autoFocus
          />

          <TouchableOpacity
            style={[
              styles.generateButton,
              (!themePrompt.trim() || isGenerating) && styles.generateButtonDisabled
            ]}
            onPress={handleGenerate}
            disabled={!themePrompt.trim() || isGenerating}
          >
            {isGenerating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.generateButtonText}>Generate</Text>
            )}
          </TouchableOpacity>
        </View>
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
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  label: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    color: '#333',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: 'Poppins_400Regular',
    color: '#333',
    minHeight: 120,
    marginBottom: 24,
  },
  generateButton: {
    backgroundColor: '#6D9C91',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  generateButtonDisabled: {
    backgroundColor: '#CCC',
  },
  generateButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    color: '#fff',
  },
});
