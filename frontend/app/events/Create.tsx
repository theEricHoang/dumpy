import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold, useFonts } from '@expo-google-fonts/poppins';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function CreateEvent() {
    const router = useRouter();
    const { user } = useAuth();
    const [eventName, setEventName] = useState('');
    const [eventDate, setEventDate] = useState('');
    const [eventDesc, setEventDesc] = useState('');
    const [invites, setInvites] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const [fontsLoaded] = useFonts({
        Poppins_400Regular,
        Poppins_600SemiBold,
        Poppins_700Bold,
    });

    if (!fontsLoaded) return null;

    const isFormComplete = eventName.trim() !== '' && eventDesc.trim() !== '';

    const handleCreateEvent = async () => {
        // Validate inputs
        if (!eventName.trim()) {
            Alert.alert('Error', 'Please enter a dump name');
            return;
        }

        // Check authentication
        if (!user?.email) {
            Alert.alert('Error', 'You must be logged in to create a dump');
            return;
        }

        setIsLoading(true);

        try {
            // Get current user's user_id from users table
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('user_id')
                .eq('email', user.email)
                .single();

            if (userError || !userData) {
                console.error('Failed to get user ID:', userError);
                Alert.alert('Error', 'Failed to get user information');
                setIsLoading(false);
                return;
            }

            // Create the event
            const { data: eventData, error: eventError } = await supabase
                .from('events')
                .insert({
                    event_name: eventName,
                    event_description: eventDesc || null,
                    event_created_by: userData.user_id,
                })
                .select()
                .single();

            if (eventError) {
                console.error('Supabase error:', eventError);
                Alert.alert('Error', `Failed to create event: ${eventError.message}`);
                setIsLoading(false);
                return;
            }

            console.log('Event created successfully:', eventData);
            
            // Add creator as a participant
            const { error: participantError } = await supabase
                .from('event_participants')
                .insert({
                    event_id: eventData.event_id,
                    user_id: userData.user_id,
                });

            if (participantError) {
                console.error('Failed to add creator as participant:', participantError);
                // Don't fail the whole operation, just log it
            }

            // TODO: handle invites
            if (invites.trim()) {
                console.log('Invites to process:', invites);
                // add invites logic here later
            }

            Alert.alert('Success', 'Event created successfully!', [
                { text: 'OK', onPress: () => router.replace('/(tabs)/dumps') }
            ]);

        } catch (err) {
            console.error('Unexpected error:', err);
            Alert.alert('Error', 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView 
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
            <ScrollView 
                contentContainerStyle={styles.scroll} 
                style={styles.screen}
                keyboardShouldPersistTaps="handled"
            >            
                <View style={styles.container}>
                <Text style={styles.header}>create dump</Text>

                <Text style={styles.label}>dump name</Text>
                <TextInput
                    style={[styles.input]}
                    placeholder="event name"
                    placeholderTextColor="#999"
                    value={eventName}
                    onChangeText={setEventName}
                />

                <Text style={styles.label}>dump date</Text>
                <TextInput
                    style={[styles.input]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#999"
                    value={eventDate}
                    onChangeText={setEventDate}
                />

                <Text style={styles.label}>description</Text>
                <TextInput
                    style={[styles.input]}
                    placeholder="add details about your event"
                    placeholderTextColor="#999"
                    value={eventDesc}
                    onChangeText={setEventDesc}
                />

                <Text style={styles.label}>invite friends</Text>
                <TextInput
                    style={[styles.input]}
                    placeholder="enter usernames, separated by commas"
                    placeholderTextColor="#999"
                    value={invites}
                    onChangeText={setInvites}
                />

                <TouchableOpacity 
                    style={[styles.button, (!isFormComplete || isLoading) && styles.disabledButton]} 
                    onPress={handleCreateEvent}
                    disabled={!isFormComplete || isLoading}
                >
                    <Text style={styles.buttonText}>
                        {isLoading ? 'creating...' : 'create event'}
                    </Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#DADCE0',
    },
    scroll: {
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        width: 253,
        backgroundColor: '#DADCE0',
        justifyContent: 'center',
    },
    header: {
        fontFamily: "Poppins_700Bold",
        fontSize: 32,
        color: "black",
        textAlign: "center",
        marginBottom: 36,
    },
    label: {
        fontFamily: "Poppins_400Regular",
        fontSize: 13,
        color: "#222",
        marginBottom: 4,
        marginLeft: 10,
    },
    input: {
        backgroundColor: "white",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#BCE0D3",
        paddingVertical: 10,
        paddingHorizontal: 14,
        fontSize: 15,
        fontFamily: "Poppins_400Regular",
        marginBottom: 16,
        color: "#666",
    },
    button: {
        backgroundColor: "#4A9B72",
        borderRadius: 16,
        paddingVertical: 14,
        marginTop: 10,
    },
    disabledButton: {
        backgroundColor: "#C7D9CF",
        opacity: 0.6,
    },
    buttonText: {
        color: "white",
        textAlign: "center",
        fontFamily: "Poppins_600SemiBold",
        fontSize: 16,
    },
});
