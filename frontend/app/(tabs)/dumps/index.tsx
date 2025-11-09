import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Dump {
    event_id: number;
    event_name: string;
    event_description: string;
    event_created_at: string;
}

export default function MyDumps() {
    const [dumps, setDumps] = useState<Dump[]>([]);
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

    // Check authentication
    useEffect(() => {
        if (!authLoading && !user) {
            router.replace('/onboarding/Login');
        }
    }, [user, authLoading]);

    const fetchDumps = async () => {
        if (!user?.email) return;

        // Get current user's user_id from users table
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('user_id')
            .eq('email', user.email)
            .single();

        if (userError || !userData) {
            console.error('Failed to get user ID:', userError);
            return;
        }

        // Fetch events where user is a participant
        const { data, error } = await supabase
            .from('event_participants')
            .select(`
                event_id,
                events (
                    event_id,
                    event_name,
                    event_description,
                    event_created_at
                )
            `)
            .eq('user_id', userData.user_id)
            .order('event_id', { ascending: false });

        if (!error && data) {
            // Extract the events from the nested structure
            const events = data
                .map(item => item.events as any)
                .filter(event => event !== null)
                .flat() as Dump[];
            setDumps(events);
        }
    };

    useEffect(() => {
        if (user) {
            fetchDumps();
        }
    }, [user]);

    // Refresh dumps when screen comes into focus (after creating an event)
    useFocusEffect(
        useCallback(() => {
            if (user) {
                console.log('[My Dumps] Screen focused, refreshing dumps...');
                fetchDumps();
            }
        }, [user])
    );

    if (authLoading) {
        return (
            <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#4A9B72" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.headerRow}>
                <Text style={styles.header}>my dumps</Text>
                <TouchableOpacity
                    style={styles.createButton}
                    onPress={() => router.push('/events/Create' as any)}
                >
                    <Text style={styles.createButtonText}>+ new</Text>
                </TouchableOpacity>
            </View>
            <FlatList
                data={dumps}
                keyExtractor={(item) => item.event_id.toString()}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={styles.dumpCard}
                        onPress={() => router.push(`/dumps/${item.event_id}` as any)}
                    >
                        <Text style={styles.dumpTitle}>{item.event_name}</Text>
                        <Text style={styles.dumpDesc}>{item.event_description}</Text>
                        <Text style={styles.dumpDate}>{new Date(item.event_created_at).toLocaleDateString()}</Text>
                    </TouchableOpacity>
                )}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#DADCE0',
        padding: 16,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        marginTop: 8,
    },
    header: {
        fontSize: 24,
        fontWeight: 'bold',
        color: 'black',
        marginBottom: 16,
        fontFamily: 'Poppins_700Bold',
    },
    createButton: {
        backgroundColor: '#4A9B72',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#BCE0D3',
    },
    createButtonText: {
        color: 'white',
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
    dumpCard: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderColor: '#BCE0D3',
        borderWidth: 1,
    },
    dumpTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: 'black',
    },
    dumpDesc: {
        color: '#555',
        marginTop: 6,
    },
    dumpDate: {
        color: '#555',
        fontSize: 12,
        marginTop: 4,
    },
});
