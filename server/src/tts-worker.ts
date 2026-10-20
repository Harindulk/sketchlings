// Child process that owns the Kokoro model (spawned by kokoro() in voice.ts). IPC in: {id, text, v, out}; out: {ready} once,
// then {id, ms} or {id, error} per clip.
import {loadKokoro, type VoiceProfile} from './voice';

// The parent is gone: stop without running onnxruntime's exit handlers (they abort Bun with a crash report).
process.on('disconnect', () => process.kill(process.pid, 'SIGKILL'));
try {
  const tts = await loadKokoro(process.argv[2]!);
  process.on('message', async (m: {id: number; text: string; v: VoiceProfile; out: string}) => {
    try {
      process.send!({id: m.id, ms: await tts.clip(m.text, m.v, m.out)});
    } catch (e) {
      process.send!({id: m.id, error: e instanceof Error ? e.message : String(e)});
    }
  });
  process.send!({ready: true});
} catch (e) {
  console.error('[voice] could not load Kokoro; creature voices are off:', e);
  process.send!({ready: false});
  process.kill(process.pid, 'SIGKILL');
}
