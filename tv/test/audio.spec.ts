// src/audio.ts against a fake w3cmedia: the player's source is set once per session, never swapped per clip
// (notes/tv.md F13: a srcObject swap per clip crashed libW3CMedia.so on the VVD).
const mockLog: string[] = [];
const mockOn: Record<string, () => void> = {};
let mockEnd = 0;

jest.mock('@amazon-devices/react-native-w3cmedia', () => {
  class SourceBuffer {
    timestampOffset = 0;
    done?: () => void;
    get buffered() {
      return {length: 1, end: () => mockEnd};
    }
    addEventListener(_: string, f: () => void) {
      this.done = f;
    }
    removeEventListener() {
      this.done = undefined;
    }
    appendBuffer() {
      mockLog.push(`append@${this.timestampOffset}`);
      mockEnd = this.timestampOffset + 1;
      this.done?.();
    }
  }
  class MediaSource {
    onsourceopen?: () => void;
    addSourceBuffer() {
      return new SourceBuffer();
    }
  }
  class AudioPlayer {
    initialize() {
      return Promise.resolve();
    }
    addEventListener(type: string, f: () => void) {
      mockOn[type] = f;
    }
    set srcObject(ms: MediaSource) {
      mockLog.push('srcObject');
      ms.onsourceopen?.();
    }
    set currentTime(t: number) {
      mockLog.push(`seek@${t}`);
    }
    play() {
      mockLog.push('play');
      return Promise.resolve();
    }
    pause() {
      mockLog.push('pause');
    }
  }
  return {AudioPlayer, MediaSource, AudioContentType: {}, AudioUsageType: {}};
});

import {hush, narrator} from '../src/audio';

const flush = () => new Promise<void>((r) => setImmediate(r));

describe('audio', () => {
  it('appends each clip after the last one on one source, and hush() pauses', async () => {
    jest.useFakeTimers({doNotFake: ['setImmediate']});
    for (const id of ['meet-sketchlings', 'winner-is']) {
      narrator(id);
      await flush();
      mockOn.playing();
      mockOn.waiting(); // ran out of data: the clip is over
      jest.advanceTimersByTime(400);
    }
    narrator('go');
    await flush();
    hush();
    expect(mockLog).toEqual([
      'srcObject',
      'append@0', 'seek@0', 'play', 'pause',
      'append@1', 'seek@1', 'play', 'pause',
      'append@2', 'seek@2', 'play', 'pause',
    ]);
    jest.useRealTimers();
  });
});
