import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';

import { ThemedText } from '@/components/themed-text';
import { connectToEsp, fetchData, isConnectedToEsp } from '@/lib/esp';
import { useCallback, useEffect, useRef, useState } from 'react';

const DASH = '-';
const ESP_BASE = 'http://192.168.4.1';

const fmt = (v: unknown, unit = ''): string => {
  if (v === null || v === undefined) return DASH;
  if (typeof v === 'number' && Number.isNaN(v)) return DASH;
  if (typeof v === 'string' && v.trim() === '') return DASH;
  return `${v}${unit}`;
};

// For booleans (presence)
const fmtBool = (v: boolean | null | undefined): string => {
  if (v === null || v === undefined) return DASH;
  return v ? 'Yes' : 'No';
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <ThemedText type="small" style={styles.cardLabel}>{label}</ThemedText>
      <ThemedText type="default" style={styles.cardValue}>{value}</ThemedText>
    </View>
  );
}



export default function HomeScreen() {
  const [status, setStatus] = useState('disconnected'); // disconnected | connecting | connected | error
  const [data, setData] = useState(null);
  const [mins, setMins] = useState<number>(0);
  const [secs, setSecs] = useState<number>(30);
  const [message, setMessage] = useState('');
  const [draftMins, setDraftMins] = useState<string | null>(null);
  const [draftSecs, setDraftSecs] = useState<string | null>(null);
  const seededRef = useRef(false);


  // Seed ONCE from the first real server payload. Never again.
  useEffect(() => {
    if (seededRef.current) return;
    if (!data) return;
    const d = data as { minutes?: number; seconds?: number } | null | undefined;
    if (d?.minutes == null && d?.seconds == null) return; // wait for real values
    setDraftMins(String(d?.minutes ?? 0));
    setDraftSecs(String(d?.seconds ?? 30));
    seededRef.current = true;
  }, [data]);

  const relayCommand = useCallback(async (state: 'on' | 'off' | 'auto') => {
    try {
      const r = await fetch(`${ESP_BASE}/relay?state=${state}`, { method: 'POST' });
      const d = await r.json();
      setMessage(d.ok ? 'Command accepted.' : 'Command failed.');
      setData(await fetchData());
    } catch {
      setMessage('Command failed.');
    }
  }, []);

  const saveDelay = useCallback(async () => {
    const valid =
      Number.isInteger(mins) && Number.isInteger(secs) &&
      mins >= 0 && mins <= 1440 &&
      secs >= 0 && secs <= 59 &&
      !(mins === 0 && secs === 0);

    if (!valid) {
      setMessage(
        'Use 0-1440 minutes and 0-59 seconds. Delay must be greater than zero.'
      );
      return;
    }

    try {


      const r = await fetch(
        `${ESP_BASE}/delay?minutes=${draftMins}&seconds=${draftSecs}`,
        { method: 'POST' }
      );
      setMins(Number(draftMins));
      setSecs(Number(draftSecs));
      const d = await r.json();
      setMessage(d.ok ? 'Delay saved.' : 'Could not save delay.');
      setData(await fetchData());
    } catch {
      setMessage('Could not save delay.');
    }
  }, [mins, secs]);

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
      if (e instanceof Error) {
        Alert.alert(`Connection failed ${e.message}`);
      } else {
        Alert.alert(`Connection failed`);
      }
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



  useEffect(() => {
    if (data) {
      const d = data as { minutes?: number; seconds?: number } | null | undefined;
      setMins(d?.minutes ?? 0);
      setSecs(d?.seconds ?? 30);
    }
  }, [data]);

  const show = data ?? {
    weather: { show: false, hour: '--:--', temperature: null },
    sensors: {
      pir: { presence: null, temperature: null },
      air: { temperature: null, humidity: null },
      secondary: { presence: null, temperature: null },
      window: null,
      radar: null,
    },
    messages: [],
    // NEW:
    relay: null,
    mode: null,
    delayText: '--',
    minutes: 0,
    seconds: 30,
  };

  // ...render as before, using `show`...
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ThemedText type="title" style={styles.title}>Dashboard</ThemedText>

          {/* Connect button */}
          <Pressable
            onPress={handleConnect}
            disabled={status === 'connecting' || status === 'connected'}
            style={({ pressed }) => [
              styles.connectBtn,
              {
                opacity: pressed || status === 'connecting' ? 0.6 : 1,
                backgroundColor: status === 'connected' ? '#15803d' : '#0a84ff',
              },
            ]}
          >
            {status === 'connecting' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText type="smallBold" style={{ color: '#fff' }}>
                {status === 'connected' ? '✓ Connected' : 'Connect to ESP8266'}
              </ThemedText>
            )}
          </Pressable>

          {status === 'connected' && (
            <ThemedText type="small" style={styles.statusHint}>
              Live data · updated every 5s
            </ThemedText>
          )}

          {/* Sensor grid */}
          <View style={styles.card_half}>
            <StatCard label="Temperature" value={fmt(show.weather.temperature, '°C')} />
            <StatCard label="Presence (AI)" value={fmt(show.sensors.pir.temperature, '°C')} />
            <StatCard label="PIR Presence" value={fmtBool(show.sensors.pir.presence)} />
            <StatCard label="Radar Presence" value={fmtBool(show.sensors.radar)} />
            <StatCard label="Humidity" value={fmt(show.sensors.air.humidity, '%')} />
            <StatCard label="prob Temp" value={fmt(show.sensors.secondary.temperature, '°C')} />
            <StatCard label="Secondary Presence" value={fmtBool(show.sensors.secondary.presence)} />
            <StatCard label="Window" value={fmtBool(show.sensors.window)} />
          </View>

          {/* Relay Control Card */}
          <View style={styles.card}>
            <ThemedText type="subtitle" style={styles.cardTitle}>Relay Control</ThemedText>

            <View style={styles.infoRow}>
              <ThemedText type="small" style={styles.infoLabel}>Current state</ThemedText>
              <ThemedText type="default" style={styles.cardValue}>
                {show.relay ?? '--'}
              </ThemedText>
            </View>
            <View style={styles.infoRow}>
              <ThemedText type="small" style={styles.infoLabel}>Control mode</ThemedText>
              <ThemedText type="default" style={styles.cardValue}>
                {show.mode ?? '--'}
              </ThemedText>
            </View>

            <View style={styles.buttonRow}>
              <Pressable
                onPress={() => relayCommand('on')}
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.flexBtn,
                  { backgroundColor: '#15803d', opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <ThemedText type="smallBold" style={{ color: '#fff' }}>Turn ON</ThemedText>
              </Pressable>

              <Pressable
                onPress={() => relayCommand('off')}
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.flexBtn,
                  { backgroundColor: '#b91c1c', opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <ThemedText type="smallBold" style={{ color: '#fff' }}>Turn OFF</ThemedText>
              </Pressable>
            </View>

            <Pressable
              onPress={() => relayCommand('auto')}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: '#1d4ed8', opacity: pressed ? 0.6 : 1, marginTop: 8 },
              ]}
            >
              <ThemedText type="smallBold" style={{ color: '#fff' }}>Automatic Mode</ThemedText>
            </Pressable>

            <ThemedText type="small" style={styles.hint}>
              Manual commands remain active until Automatic Mode is selected.
            </ThemedText>
          </View>

          {/* Automatic OFF Delay Card */}
          <View style={styles.card}>
            <ThemedText type="subtitle" style={styles.cardTitle}>Automatic OFF Delay</ThemedText>

            <View style={styles.delayRow}>
              <View style={styles.delayField}>
                <ThemedText type="small" style={styles.infoLabel}>Minutes</ThemedText>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={draftMins ?? ''}
                  onChangeText={(t) => setDraftMins(t.replace(/[^0-9]/g, ''))}
                  placeholder="0"
                  placeholderTextColor="rgba(127,127,127,0.6)"
                />
              </View>

              <View style={styles.delayField}>
                <ThemedText type="small" style={styles.infoLabel}>Seconds</ThemedText>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={draftSecs ?? ''}
                  onChangeText={(t) => setDraftSecs(t.replace(/[^0-9]/g, ''))}
                  placeholder="30"
                  placeholderTextColor="rgba(127,127,127,0.6)"
                />
              </View>
            </View>

            <Pressable
              onPress={saveDelay}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: '#1d4ed8', opacity: pressed ? 0.6 : 1, marginTop: 12 },
              ]}
            >
              <ThemedText type="smallBold" style={{ color: '#fff' }}>Save Delay</ThemedText>
            </Pressable>

            <View style={[styles.infoRow, { marginTop: 12 }]}>
              <ThemedText type="small" style={styles.infoLabel}>Current delay</ThemedText>
              <ThemedText type="default" style={styles.cardValue}>
                {show.delayText ?? '--'}
              </ThemedText>
            </View>

            <ThemedText type="small" style={styles.hint}>
              In automatic mode, PIR motion turns the relay ON. After the PIR reports no
              motion for the selected time, it turns OFF.
            </ThemedText>

            {message ? (
              <ThemedText type="small" style={styles.message}>
                {message}
              </ThemedText>
            ) : null}
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
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
  scrollContent: {
    paddingBottom: 24,
  },
  title: {
    marginBottom: 16,
    marginTop: 8,
  },

  // --- Connect ---
  connectBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statusHint: {
    marginBottom: 12,
    opacity: 0.7,
  },

  // --- Sensor grid ---
  grid: {
    marginTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    marginBottom: 16,
  },

  // --- Full-width content card ---
  card: {
    width: '100%',
    borderRadius: 14,
    padding: 16,
    backgroundColor: 'rgba(127,127,127,0.12)',
    marginBottom: 16,
    gap: 4,
  },
  cardTitle: {
    marginBottom: 8,
  },

  // --- Info rows (label + value) ---
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  infoLabel: {
    opacity: 0.6,
  },

  // --- Buttons ---
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flexBtn: {
    flex: 1,
  },

  hint: {
    marginTop: 10,
    opacity: 0.6,
    lineHeight: 18,
  },

  // --- Delay inputs ---
  delayRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  delayField: {
    flex: 1,
    gap: 6,
  },
  input: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(127,127,127,0.4)',
    color: '#ffffff', // if you support light theme, make this dynamic
    backgroundColor: 'rgba(0,0,0,0.15)',
  },

  message: {
    marginTop: 10,
    color: '#b91c1c',
  },

  cardLabel: {
    opacity: 0.6,
  },
  cardValue: {
    marginTop: 2,
  },


  statCard: {
    width: '48%',
    borderRadius: 10,
    padding: 14,
    backgroundColor: 'rgba(127,127,127,0.12)',
  },

  card_half: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    marginBottom: 16,
  },
});