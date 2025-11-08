import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SearchScreen() {
    return (
        <SafeAreaView style={styles.container}>
            <Text style={styles.text}>Search</Text>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#DADCE0',
    },
    text: {
        fontSize: 24,
        fontWeight: 'bold',
        fontFamily: 'Poppins',
    },
});
