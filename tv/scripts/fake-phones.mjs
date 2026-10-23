// Simulates phones against the real server so the TV's live party can be tested without phones.
// Usage: node tv/scripts/fake-phones.mjs <ROOM> [count=3] [host=localhost:8787]
// Each fake player joins, uploads one of our sample drawings, and during the race taps ~5/s, jumps and shouts.
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const [room, count = '3', host = 'localhost:8787'] = process.argv.slice(2);
if (!room) {
  console.error('usage: node fake-phones.mjs <ROOM> [count] [host]');
  process.exit(1);
}
const ART = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'art');
const PLAYERS = [
  {name: 'Noah', ageGroup: 'little', art: 'dino.png'},
  {name: 'Zoe', ageGroup: 'big', art: 'star.png'},
  {name: 'Dad', ageGroup: 'grownup', art: 'hedgehog.png'},
  {name: 'Lily', ageGroup: 'little', art: 'cloud.png'},
  {name: 'Omar', ageGroup: 'big', art: 'frog.png'},
  {name: 'Gran', ageGroup: 'grownup', art: 'potato.png'},
];

function phone({name, ageGroup, art}, i) {
  const ws = new WebSocket(`ws://${host}/ws`);
  let racing = null;
  const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
  ws.onopen = () => send({t: 'hello', role: 'phone', room, name, ageGroup});
  ws.onmessage = async (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'joined') {
      console.log(`${name}: joined as ${m.playerId}`);
      await new Promise((r) => setTimeout(r, 1500 + i * 1200)); // "drawing"
      const res = await fetch(`http://${host}/api/rooms/${room}/players/${m.playerId}/sketch`, {
        method: 'POST',
        headers: {'content-type': 'image/png'},
        body: readFileSync(join(ART, art)),
      });
      console.log(`${name}: upload ${res.status}`);
    } else if (m.t === 'sketchling') {
      console.log(`${name}: sketchling ${m.sketchling.name}, ${m.sketchling.title} eyes=${JSON.stringify(m.sketchling.eyes)} voice=${JSON.stringify(m.sketchling.voice ?? null)}`);
    } else if (m.t === 'phase') {
      console.log(`${name}: phase ${m.phase} ${JSON.stringify(m.data ?? {})}`);
      clearInterval(racing);
      if (m.phase === 'race') {
        const start = Date.now() + (m.data?.countdownMs ?? 2700);
        let shouted = false;
        racing = setInterval(() => {
          if (Date.now() < start) return;
          if (Math.random() < 0.5) send({t: 'input', kind: 'tap', at: Date.now()});
          if (Math.random() < 0.012) send({t: 'input', kind: 'jump', at: Date.now()});
          if (!shouted && Date.now() - start > 8000 + i * 4000) {
            shouted = true;
            send({t: 'input', kind: 'shout', at: Date.now()});
          }
        }, 100);
      }
    } else if (m.t === 'hit') {
      console.log(`${name}: hit`); // our racer hit an ink blot (the soak counts these)
    } else if (m.t === 'error') {
      console.log(`${name}: error ${m.code} ${m.message}`);
    }
  };
  ws.onclose = () => console.log(`${name}: closed`);
}

PLAYERS.slice(0, Number(count)).forEach((p, i) => setTimeout(() => phone(p, i), i * 700));
