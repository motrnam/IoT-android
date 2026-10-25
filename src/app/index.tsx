import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';

import { ThemedText } from '@/components/themed-text';
import { connectToEsp, fetchData, isConnectedToEsp } from '@/lib/esp';
import { useCallback, useEffect, useState } from 'react';




// function getDevMenuHint() {
//   if (Platform.OS === 'web') {
//     return <ThemedText type="small">use browser devtools</ThemedText>;
//   }
//   if (Device.isDevice) {
//     return (
//       <ThemedText type="small">
//         shake device or press <ThemedText type="code">m</ThemedText> in terminal
//       </ThemedText>
//     );
//   }
//   const shortcut = Platform.OS === 'android' ? 'cmd+m (or ctrl+m)' : 'cmd+d';
//   return (
//     <ThemedText type="small">
//       press <ThemedText type="code">{shortcut}</ThemedText>
//     </ThemedText>
//   );
// }


// ---- Dummy data (replace with real API later) ----
const dummyData = {
  weather: { show: true, hour: '14:32', temperature: 23.4 },
  sensors: {
    pir: { presence: true, temperature: 22.8 },
    air: { temperature: 21.6, humidity: 47 },
    secondary: { presence: false, temperature: 23.1 },
  },
  messages: [
    { id: '1', text: 'Welcome home!', timestamp: '14:30' },
    { id: '2', text: 'Living room light turned on', timestamp: '14:31' },
    { id: '3', text: 'Motion detected in hallway', timestamp: '14:32' },
  ],
};


export default function HomeScreen() {
  const [status, setStatus] = useState('disconnected'); // disconnected | connecting | connected | error
  const [data, setData] = useState(null);

  const handleConnect = useCallback(async () => {
    try {
      setStatus('connecting');

      // Already on the AP? Skip join step.
      if (!(await isConnectedToEsp())) {
        await connectToEsp();
      }

      // Give the AP a moment to hand out DHCP lease
      await new Promise(r => setTimeout(r, 1500));

      const json = await fetchData();
      setData(json);
      setStatus('connected');
    } catch (e) {
      setStatus('error');
      Alert.alert('Connection failed');
    }
  }, []);

  // Poll every 5s once connected
  useEffect(() => {
    if (status !== 'connected') return;
    const id = setInterval(async () => {
      try { setData(await fetchData()); }
      catch { setStatus('error'); }
    }, 5000);
    return () => clearInterval(id);
  }, [status]);

  const show = data ?? {
    weather: { show: false, hour: '--:--', temperature: null },
    sensors: {
      pir: { presence: null, temperature: null },
      air: { temperature: null, humidity: null },
      secondary: { presence: null, temperature: null },
    },
    messages: [],
  };

  // ...render as before, using `show`...

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>Dashboard</ThemedText>

        {/* Connect button */}
        <Pressable
          onPress={handleConnect}
          disabled={status === 'connecting' || status === 'connected'}
          style={({ pressed }) => [
            styles.connectBtn,
            { opacity: pressed || status === 'connecting' ? 0.6 : 1 },
          ]}
        >
          {status === 'connecting'
            ? <ActivityIndicator color="#fff" />
            : <ThemedText type="smallBold" style={{ color: '#fff' }}>
              {status === 'connected' ? 'Connected' : 'Connect to ESP8266'}
            </ThemedText>}
        </Pressable>

        {status === 'connected' && (
          <ThemedText type="small" style={{ marginBottom: 12, opacity: 0.7 }}>
            Live data · updated every 5s
          </ThemedText>
        )}

        {/* ...existing rows using `show` instead of `dummyData`... */}
      </SafeAreaView>
    </ThemedView>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  title: {
    marginBottom: 16,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  card: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    gap: 6,
    justifyContent: 'center',
  },
  messages: {
    flex: 1,
    marginTop: 8,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  messagesTitle: {
    marginBottom: 4,
  },
  messageRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  messageTime: {
    opacity: 0.6,
    minWidth: 44,
  },
  messageText: {
    flex: 1,
  },
  connectBtn: {
    backgroundColor: '#0a84ff',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
});
