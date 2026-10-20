import React from 'react';
import {StyleSheet, View} from 'react-native';
import {C, H} from '../theme';

const LINES = Array.from(
  {length: Math.floor((H - 60) / 30) + 1},
  (_, i) => 60 + i * 30,
);
const HOLES = [110, 270, 430];

/** Static notebook page: ruled lines, red margin, binder holes. Never re-renders. */
export const Paper = React.memo(() => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    <View style={[StyleSheet.absoluteFill, {backgroundColor: C.paper}]} />
    {LINES.map((y) => (
      <View key={y} style={[styles.line, {top: y}]} />
    ))}
    <View style={styles.margin} />
    {HOLES.map((y) => (
      <View key={y} style={[styles.hole, {top: y - 11}]} />
    ))}
  </View>
));

const styles = StyleSheet.create({
  line: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: C.ruled,
  },
  margin: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 66,
    width: 2,
    backgroundColor: C.margin,
  },
  hole: {
    position: 'absolute',
    left: 18,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E9E2D2',
    borderWidth: 2,
    borderColor: '#DDD4C0',
  },
});
