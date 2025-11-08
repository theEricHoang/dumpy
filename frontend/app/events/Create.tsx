import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useFonts, Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold } from '@expo-google-fonts/poppins';
import { supabase } from '@/lib/supabaseClient';

export default function CreateEvent() {
    const router = useRouter();
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
            Alert.alert('Error', 'Please enter an event name');
            return;
        }

        setIsLoading(true);

        try {
            // TODO: uncomment to re-enable authentication once login/signup is implemented
            // const { data: { user }, error: userError } = await supabase.auth.getUser();
            // if (userError || !user) {
            //     Alert.alert('Error', 'You must be logged in to create an event');
            //     setIsLoading(false);
            //     return;
            // }

            const { data, error } = await supabase
                .from('events')
                .insert({
                    event_name: eventName,
                    event_description: eventDesc || null,
                    event_created_by: null, // will be replaced with user.id once auth is implemented
                })
                .select()
                .single();

            if (error) {
                console.error('Supabase error:', error);
                Alert.alert('Error', `Failed to create event: ${error.message}`);
                setIsLoading(false);
                return;
            }

            console.log('Event created successfully:', data);
            
            // TODO: handle invites
            if (invites.trim()) {
                console.log('Invites to process:', invites);
                // add invites logic here later
            }

            Alert.alert('Success', 'Event created successfully!', [
                { text: 'OK', onPress: () => router.replace('/(tabs)/feed') }
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
                <Text style={styles.header}>create event</Text>

                <Text style={styles.label}>event name</Text>
                <TextInput
                    style={[styles.input]}
                    placeholder="event name"
                    placeholderTextColor="#999"
                    value={eventName}
                    onChangeText={setEventName}
                />

                <Text style={styles.label}>event date</Text>
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
