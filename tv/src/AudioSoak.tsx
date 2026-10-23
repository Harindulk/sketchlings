// Test-only root (AUDIOSOAK=1 tv/scripts/vbuild.sh): replays the Reveal and Results audio patterns back to back
// through the real src/audio.ts, forever, so a w3cmedia crash shows up in minutes instead of hours of races
// (notes/tv.md F13). tv/scripts/audio-soak.mjs launches it, reads the counters off the screen and counts crashes.
import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {audioStatus, hush, music, narrator, prefetch, say} from './audio';
import {HTTP_BASE} from './config';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const stats = {screens: 0, lines: 0};

async function loop() {
  const hall: {voice?: Record<string, string>}[] = await (
    await fetch(`${HTTP_BASE}/api/hall-of-fame`)
  ).json();
  const lines = hall.flatMap((s) => Object.values(s.voice ?? {}));
  stats.lines = lines.length;
  lines.forEach(prefetch);
  const pick = () => lines[Math.floor(Math.random() * lines.length)];
  for (;;) {
    // Reveal (screens/Reveal.tsx): narrator at mount; a card every 1.4 s (soak.mjs pace) says its intro 0.9 s in
    narrator('meet-sketchlings');
    for (let c = 0; c < 4; c++) {
      await sleep(900);
      say(pick());
      await sleep(500);
      stats.screens++;
    }
    hush(); // Race mounts (silent race)
    await sleep(3000);
    // Results (screens/Results.tsx): narrator at mount, the winner's winLine 1.8 s later
    narrator('winner-is');
    await sleep(1800);
    say(pick());
    await sleep(6000);
    stats.screens++;
  }
}

export const AudioSoak = () => {
  const [, tick] = useState(0);
  useEffect(() => {
    music(true); // the game plays music under every voice, so the soak does too
    loop();
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={{flex: 1, backgroundColor: 'white', padding: 60}}>
      <Text style={{fontSize: 40, color: 'black'}}>
        {`SOAK screens ${stats.screens} ended ${audioStatus.ended} lines ${stats.lines}\n${audioStatus.mode} ${audioStatus.state}`}
      </Text>
    </View>
  );
};
