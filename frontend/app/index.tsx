import { Redirect } from 'expo-router';

export default function Index() {
  const [isOnboarded, setIsOnboarded] = useState(false);

  useEffect(() => {
    const checkOnboarding = async () => {
      const value = await AsyncStorage.getItem('hasSeenOnboarding');
      setIsOnboarded(value === 'true');
    };
    checkOnboarding();
  }, []);

  if (isOnboarded === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return isOnboarded
    ? <Redirect href="/(tabs)/feed" />
    : <Redirect href="/onboarding" />;
}