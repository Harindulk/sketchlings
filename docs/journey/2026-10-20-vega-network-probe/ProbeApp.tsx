import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

// Throwaway probe: which host addresses can the VVD reach over HTTP / WebSocket?
const HOSTS = ['127.0.0.1', '10.0.2.2', '192.168.1.3'];

export const App = () => {
  const [lines, setLines] = useState<string[]>([]);
  const log = (s: string) => setLines((l) => [...l, s]);

  useEffect(() => {
    HOSTS.forEach((h) => {
      fetch(`http://${h}:8787/probe`)
        .then((r) => r.text())
        .then((t) => log(`HTTP ${h}: ${t}`))
        .catch((e) => log(`HTTP ${h}: FAIL ${String(e)}`));
      try {
        const ws = new WebSocket(`ws://${h}:8787/ws`);
        ws.onopen = () => ws.send('ping-from-vega');
        ws.onmessage = (m) => log(`WS ${h}: ${m.data}`);
        ws.onerror = (e: any) => log(`WS ${h}: ERROR ${e?.message ?? ''}`);
      } catch (e) {
        log(`WS ${h}: THROW ${String(e)}`);
      }
    });
  }, []);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Vega network probe</Text>
      {lines.map((l, i) => (
        <Text key={i} style={styles.line}>
          {l}
        </Text>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#101820', padding: 60},
  title: {color: '#ff6a00', fontSize: 48, marginBottom: 24},
  line: {color: 'white', fontSize: 32, marginBottom: 8},
});
