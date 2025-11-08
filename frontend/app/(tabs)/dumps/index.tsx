import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Dump {
    event_id: number;
    event_name: string;
    event_description: string;
    event_created_at: string;
}

export default function MyDumps() {
    const [dumps, setDumps] = useState<Dump[]>([]);
    const router = useRouter();

    useEffect(() => {
        const fetchDumps = async () => {
            const { data, error } = await supabase
                .from('events')
                .select('event_id, event_name, event_description, event_created_at')
                .order("event_created_at", { ascending: false });
            if (!error) {
                setDumps(data);
            }
        };
        fetchDumps();
    }, []);

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
                        onPress={() => router.push(`/dump/${item.event_id}` as any)}
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
