import * as Network from 'expo-network';
import { PermissionsAndroid, Platform } from 'react-native';

export const ESP_HOST = 'http://192.168.4.1';
export const ESP_SSID = 'ESP8266-AP';       // change to your AP SSID
export const ESP_PASSWORD = '12345678';     // AP password

let WifiManager = null;
try {
  // Only available on native (not web)
  WifiManager = require('react-native-wifi-reborn').default;
} catch { 
  console.warn('WiFi module unavailable. Build a dev client to enable it.');
}

async function ensureAndroidWifiPermissions() {
  if (Platform.OS !== 'android') return true;

  const perms = [
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    // Only exists on Android 13+; guard with a typeof check.
    ...(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES
      ? [PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES]
      : []),
  ];

  const results = await PermissionsAndroid.requestMultiple(perms);
  return Object.values(results).every(
    (r) => r === PermissionsAndroid.RESULTS.GRANTED
  );
}

export async function isConnectedToEsp() {
  const state = await Network.getNetworkStateAsync();
  // expo-network doesn't expose SSID directly; do a ping to the host instead.
  if (!state.isConnected) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    await fetch(`${ESP_HOST}/api/ping`, { signal: ctrl.signal });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

export async function connectToEsp() {
  if (Platform.OS === 'web') {
    throw new Error('Open this app on Android/iOS to connect to the device.');
  }
  if (!WifiManager) {
    throw new Error('WiFi module unavailable. Build a dev client.');
  }
  if (Platform.OS === 'android') {
    const ok = await ensureAndroidWifiPermissions();
    if (!ok) throw new Error('WiFi permissions denied. Enable them in Settings.');
  }
  await WifiManager.connectToProtectedSSID(
    ESP_SSID,
    ESP_PASSWORD,
    false,   // isWEP
    false    // isHidden
  );
  return true;
}

export async function fetchData() {
  const res = await fetch(`${ESP_HOST}/api/data`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}