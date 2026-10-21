import './style.css';
import {
  AGE_BOOST,
  MAX_PLAYERS,
  PLAYER_COLORS,
  type AgeGroup,
  type InputKind,
  type Phase,
  type Player,
  type ServerMsg,
  type Sketchling,
} from '../../shared/protocol';
import {boostLabel, raceView} from './controller';
import {drawPad} from './drawpad';
import {Link, type LinkStatus} from './net';
import {debugImage, decodeImage, processImage, upload, type Sprite} from './scan';
import {buzz, drawIllo, h, icons, logo, mascot, medal, store, svg} from './ui';

type View = {el: HTMLElement; update?(): void; destroy?(): void};
type ScanStep = 'intro' | 'cutting' | 'preview' | 'empty' | 'pad' | 'alive' | 'failed';

const ROOM_RE = /^[A-Z]{4}$/;
const pathRoom = location.pathname.match(/^\/j\/([A-Za-z]{4})\/?$/)?.[1]?.toUpperCase() ?? '';
const storedAge = store.get('sketchlings.age');
const playerKey = (room: string) => `sketchlings.player.${room}`;

const S = {
  room: pathRoom,
  name: store.get('sketchlings.name') ?? '',
  age: storedAge && storedAge in AGE_BOOST ? (storedAge as AgeGroup) : null,
  playerId: pathRoom ? store.get(playerKey(pathRoom)) : null,
  joined: false,
  joining: false,
  color: PLAYER_COLORS[1],
  phase: 'lobby' as Phase,
  phaseData: {} as Record<string, unknown>,
  players: [] as Player[],
  sketchling: null as Sketchling | null,
  redraw: false, // drawing a replacement for an existing sketchling
  conn: 'closed' as LinkStatus,
  error: null as null | {code: string; message: string},
  step: 'intro' as ScanStep,
  source: 'camera' as 'camera' | 'pad',
  sprite: null as Sprite | null,
  scanMessage: '',
};

// ---------------------------------------------------------------- network

const link = new Link(
  () => ({t: 'hello', role: 'phone', room: S.room, name: S.name, ageGroup: S.age ?? 'grownup', ...(S.playerId ? {playerId: S.playerId} : {})}),
  onMessage,
  (status) => {
    S.conn = status;
    updateTopbar();
  },
);

function gotSketchling(sk: Sketchling) {
  if (sk.id === S.sketchling?.id) return;
  S.sketchling = sk;
  S.redraw = false;
  S.step = 'intro';
  buzz([20, 60, 20]);
}

let noRoomSince = 0;

function onMessage(m: ServerMsg) {
  switch (m.t) {
    case 'joined':
      if (S.playerId && m.playerId !== S.playerId) {
        // The server forgot us (it restarted), so we're a new player: the old champion isn't ours any more.
        S.sketchling = null;
        S.redraw = false;
        S.step = 'intro';
      }
      noRoomSince = 0;
      S.joined = true;
      S.joining = false;
      S.error = null;
      S.playerId = m.playerId;
      S.color = m.color;
      S.phase = m.phase;
      store.set(playerKey(S.room), m.playerId);
      break;
    case 'players': {
      S.players = m.players;
      const me = m.players.find((p) => p.id === S.playerId);
      if (me) {
        S.color = me.color;
        if (me.sketchling) gotSketchling(me.sketchling);
      }
      break;
    }
    case 'phase':
      S.phase = m.phase;
      S.phaseData = m.data ?? {};
      break;
    case 'sketchling':
      if (m.sketchling.playerId === S.playerId) gotSketchling(m.sketchling);
      break;
    case 'scan':
      if (m.playerId !== S.playerId) break;
      if (m.status === 'processing') S.step = 'alive';
      if (m.status === 'failed') {
        S.step = 'failed';
        S.scanMessage = m.message ?? '';
      }
      break;
    case 'error':
      if (m.code === 'bad_message') {
        console.warn('[sketchlings] server:', m.message);
        break;
      }
      if (m.code === 'no_room' && S.joined && Date.now() - (noRoomSince ||= Date.now()) < 30_000) {
        // We were in this room: the server restarted and the TV hasn't made the room again yet. Keep trying.
        link.stop();
        setTimeout(() => link.connect(), 3000);
        break;
      }
      S.error = {code: m.code, message: m.message};
      S.joining = false;
      S.joined = false;
      link.stop();
      break;
    default:
      return;
  }
  render();
}

function sendInput(kind: InputKind) {
  link.send({t: 'input', kind, at: Date.now()});
}

// ---------------------------------------------------------------- keep the phone awake and on this page

// Phones wait minutes between snapping and racing; a parent's phone that auto-locks can't be unlocked by a 5-year-old.
// Wake Lock exists only on secure pages (the HTTPS tunnel, localhost); on the plain-HTTP LAN page set Auto-Lock to Never.
let wake: WakeLockSentinel | null = null;
let waking = false;
let lastTry = 0;
function keepAwake() {
  if (waking || (wake && !wake.released) || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
  if (Date.now() - lastTry < 3000) return; // refused (battery saver, policy): don't ask again on every tap of a race
  lastTry = Date.now();
  waking = true;
  navigator.wakeLock
    .request('screen')
    .then((s) => void (wake = s))
    .catch((err) => console.info('[sketchlings] no wake lock:', err?.name))
    .finally(() => (waking = false));
}
document.addEventListener('visibilitychange', keepAwake); // the lock is released whenever the page is hidden (camera, lock)

// A tab opened from a QR scan has no history, so Android's back swipe (easy to hit from the pad's edge) closes it.
// Keep one extra entry to land on. Pushed during a tap, so Chrome doesn't skip it.
function guardBack() {
  if (!history.state?.sketchlings) history.pushState({sketchlings: 1}, '');
}
addEventListener('popstate', () => S.joined && guardBack());

// Android ignores -webkit-touch-callout: a long-press on the creature would open "Download image / Lens".
document.addEventListener('contextmenu', (e) => {
  if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
});
document.addEventListener(
  'pointerdown',
  () => {
    keepAwake(); // some browsers only grant it after a tap
    if (S.joined || S.joining) guardBack();
  },
  {passive: true},
);

// ---------------------------------------------------------------- scan pipeline

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function makeSprite(getImage: () => Promise<ImageData>) {
  S.step = 'cutting';
  S.scanMessage = '';
  render();
  try {
    // Keep the scissors on screen a moment: it reads as "magic" rather than a flicker.
    const t0 = performance.now();
    const [sprite] = await Promise.all([getImage().then(processImage).finally(() => console.info(`[sketchlings] decode + cutout ${Math.round(performance.now() - t0)} ms`)), delay(900)]);
    if (S.sprite) URL.revokeObjectURL(S.sprite.url);
    S.sprite = sprite;
    S.step = sprite ? 'preview' : 'empty';
  } catch (err) {
    console.error(err);
    S.step = 'empty';
    S.scanMessage = err instanceof Error ? err.message : '';
  }
  render();
}

async function sendSprite() {
  if (!S.sprite || !S.playerId) return;
  S.step = 'alive';
  S.scanMessage = '';
  render();
  try {
    const res = await upload(S.room, S.playerId, S.sprite);
    if (res.ok || res.status === 409) return; // 202 accepted; 409 = already being processed
    S.scanMessage =
      res.status === 404 ? 'The TV lost track of you. Reload the page to rejoin.' : res.status === 413 ? 'That picture is too big.' : 'The TV said no this time.';
  } catch {
    S.scanMessage = "Couldn't reach the TV. Is this phone on the same Wi-Fi?";
  }
  S.step = 'failed';
  render();
}

// ---------------------------------------------------------------- views

const title = (text: string, cls = '') => h('h1', {tabindex: '-1', class: cls || null}, text);

function homeView(heading = 'Got a room code?', sub = "It's on the TV screen.", code = ''): View {
  const input = h('input', {
    class: 'text-input code-input',
    value: code,
    maxlength: 4,
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    enterkeyhint: 'go',
    placeholder: 'ABCD',
    'aria-label': 'Room code',
  });
  const go = h('button', {class: 'btn', type: 'submit', disabled: !ROOM_RE.test(code)}, "Let's go!");
  input.addEventListener('input', () => {
    input.value = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    go.disabled = !ROOM_RE.test(input.value);
  });
  const form = h('form', {class: 'stack'}, input, go);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (ROOM_RE.test(input.value)) location.assign(`/j/${input.value}`);
  });
  return {
    el: h(
      'section',
      {class: 'screen'},
      logo(),
      svg(mascot(), 'mascot'),
      h('div', {class: 'card stack center'}, title(heading), h('p', {class: 'note'}, sub), form),
    ),
  };
}

const AGES: {id: AgeGroup; label: string; sub: string}[] = [
  {id: 'little', label: 'Little kid', sub: 'up to 7'},
  {id: 'big', label: 'Big kid', sub: '8 to 12'},
  {id: 'grownup', label: 'Grown-up', sub: '13 and up'},
];

const cleanName = (s: string) =>
  s
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}' -]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12);

function joinView(): View {
  let age = S.age;
  const name = h('input', {
    class: 'text-input',
    id: 'name',
    value: S.name,
    maxlength: 12,
    autocomplete: 'off',
    autocapitalize: 'words',
    enterkeyhint: 'done',
    placeholder: 'Mia',
  });
  const join = h('button', {class: 'btn go', type: 'submit'}, svg(icons.sparkle), 'Join!');
  const sync = () => (join.disabled = !cleanName(name.value) || !age);
  name.addEventListener('input', sync);
  const ages = h('div', {class: 'ages', role: 'group', 'aria-labelledby': 'age-legend'});
  for (const a of AGES) {
    const b = h(
      'button',
      {type: 'button', class: 'age', 'aria-pressed': String(a.id === age), 'aria-label': `${a.label}, ${a.sub}`},
      svg(icons[a.id]),
      h('span', null, h('b', null, a.label), h('small', null, a.sub)),
    );
    b.addEventListener('click', () => {
      age = a.id;
      ages.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      buzz(10);
      sync();
    });
    ages.append(b);
  }
  sync();
  const form = h(
    'form',
    {class: 'stack'},
    h('label', {class: 'field', for: 'name'}, h('span', null, 'Your first name'), name),
    h('span', {class: 'legend', id: 'age-legend'}, 'How old are you?'),
    ages,
    join,
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = cleanName(name.value);
    if (!n || !age) return;
    S.name = n;
    S.age = age;
    store.set('sketchlings.name', n);
    store.set('sketchlings.age', age);
    S.joining = true;
    link.connect();
    keepAwake();
    guardBack();
    render();
  });
  return {
    el: h(
      'section',
      {class: 'screen'},
      logo(),
      svg(mascot(), 'mascot'),
      h('div', {class: 'card stack'}, h('div', {class: 'row', style: 'align-items:center'}, title('Join the party!'), h('span', {class: 'chip', style: 'flex:none'}, S.room)), form),
    ),
  };
}

function connectingView(): View {
  return {
    el: h(
      'section',
      {class: 'screen center'},
      logo(),
      svg(mascot(S.color), 'mascot'),
      title('Finding your party...'),
      h('p', {class: 'note'}, `Room ${S.room}`),
      h(
        'button',
        {
          type: 'button',
          class: 'link-btn',
          onclick: () => {
            link.stop();
            S.joining = false;
            render();
          },
        },
        'Change my name',
      ),
    ),
  };
}

const seenPlayers = new Set<string>();
function playerChip(p: Player): HTMLElement {
  const dot = h('span', {class: 'dot'});
  dot.style.setProperty('--c', p.color);
  const li = h('li', {class: [p.connected ? '' : 'away', seenPlayers.has(p.id) ? 'seen' : ''].join(' ').trim() || null}, dot, p.id === S.playerId ? `${p.name} (you)` : p.name);
  if (p.sketchling) li.append(svg(icons.check, 'ok'));
  seenPlayers.add(p.id);
  return li;
}

function lobbyView(): View {
  const list = h('ul', {class: 'players', 'aria-label': 'Players'});
  const update = () => list.replaceChildren(...S.players.map(playerChip));
  update();
  return {
    el: h(
      'section',
      {class: 'screen'},
      h(
        'div',
        {class: 'card'},
        h(
          'div',
          {class: 'you'},
          h('span', {class: 'swatch', role: 'img', 'aria-label': 'Your colour'}),
          h('div', {class: 'stack', style: 'gap:6px'}, title(`You're in, ${S.name}!`), h('p', {class: 'note'}, 'That blob is your colour.')),
        ),
        h('p', {style: 'margin-top:12px'}, h('span', {class: 'boost'}, svg(icons.bolt), boostLabel(S.age ?? 'grownup'))),
      ),
      h('h2', null, "Who's playing"),
      list,
      h(
        'div',
        {class: 'card tilt-right stack center'},
        svg(drawIllo, 'illo'),
        h('p', {class: 'big-text'}, 'Grab paper and a ', h('strong', null, 'thick marker'), '. The game starts on the TV!'),
      ),
    ),
    update,
  };
}

// Android can kill the browser while its camera app is open (low memory); the tab then reloads without the photo.
// A flag set just before the camera opens tells the reloaded page what happened.
const SNAP_KEY = 'sketchlings.snapping';
const snapping = (on: boolean) => {
  try {
    if (on) sessionStorage.setItem(SNAP_KEY, '1');
    else sessionStorage.removeItem(SNAP_KEY);
  } catch {
    /* storage blocked */
  }
};
let photoLost = false;
try {
  photoLost = sessionStorage.getItem(SNAP_KEY) === '1';
} catch {
  /* storage blocked */
}
snapping(false);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && snapping(false));

function scanIntroView(): View {
  const pick = (id: string, capture: boolean) => {
    const input = h('input', {type: 'file', accept: 'image/*', capture: capture ? 'environment' : null, class: 'sr-only', id, tabindex: '-1'});
    input.addEventListener('cancel', () => snapping(false));
    input.addEventListener('change', () => {
      snapping(false);
      const f = input.files?.[0];
      input.value = '';
      if (!f) return;
      S.source = 'camera';
      void makeSprite(() => decodeImage(f));
    });
    return input;
  };
  // `capture` opens the camera straight away (without it, newer Android Chrome may show a picker with no camera).
  // The second input has no `capture`: it can pick a photo taken earlier with the Camera app.
  const file = pick('photo', true);
  const library = pick('library', false);
  const snap = h('label', {class: 'btn me', for: 'photo', role: 'button', tabindex: '0'}, svg(icons.camera), 'Snap my drawing');
  const pickBtn = h('label', {class: 'link-btn', for: 'library', role: 'button', tabindex: '0'}, 'Pick a photo you took');
  for (const [label, input] of [
    [snap, file],
    [pickBtn, library],
  ] as const) {
    label.addEventListener('click', () => {
      photoLost = false;
      snapping(true);
    });
    label.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });
  }
  if (new URLSearchParams(location.search).has('debugImage')) {
    snap.addEventListener('click', (e) => {
      e.preventDefault();
      snapping(false);
      S.source = 'camera';
      void makeSprite(async () => {
        const blob = await debugImage();
        if (!blob) throw new Error('debugImage must be "sample" or a same-origin path');
        return decodeImage(blob);
      });
    });
  }
  const tip = (icon: string, text: string) => h('li', null, svg(icon), text);
  const keep = S.sketchling;
  return {
    el: h(
      'section',
      {class: 'screen'},
      // 'Draw a new one' is one tap from the waiting card: give a way back that doesn't need a new photo.
      keep ? h('button', {type: 'button', class: 'link-btn', onclick: () => ((S.redraw = false), render())}, `Keep ${keep.name}`) : null,
      photoLost
        ? h('p', {class: 'card note', role: 'alert'}, 'Your phone needed its memory back, so the photo got lost. Close other apps and try again, or take the photo with the Camera app and use "Pick a photo you took".')
        : null,
      title('Draw your champion!'),
      h('div', {class: 'card no-tape', style: '--r:1deg;padding:10px'}, svg(drawIllo, 'illo')),
      h('p', {class: 'big-text'}, 'Draw your champion on paper with a ', h('strong', null, 'thick marker'), '. Make it ', h('strong', {class: 'marker'}, 'BIG!'), ' Leave white space around it.'),
      // What you draw changes how you play: tell them before they draw (matches the persona prompt).
      h('p', {class: 'big-text'}, 'Draw ', h('strong', null, 'wings'), ' to fly over ink, ', h('strong', null, 'wheels'), ' to roll, ', h('strong', null, 'long legs'), ' to hop, a ', h('strong', null, 'big body'), ' to ROAR!'),
      file,
      library,
      snap,
      h('div', {class: 'stack center', style: 'gap:0'}, pickBtn, h('button', {type: 'button', class: 'link-btn', onclick: () => ((S.step = 'pad'), render())}, 'Draw on screen instead')),
      h(
        'ul',
        {class: 'tips'},
        tip(icons.loop, 'Close the outline all the way round'),
        tip(icons.sun, 'Plain white paper, no lines, in good light'),
        // The cutout drops ink that touches the photo's edge: the whole sheet must be in the picture.
        tip(icons.frame, 'Get the whole sheet in the photo'),
      ),
    ),
  };
}

function cuttingView(): View {
  return {
    el: h('section', {class: 'screen center'}, title('Cutting it out...'), svg(icons.scissors, 'spinner-scissors'), h('p', {class: 'big-text'}, 'Snip, snip! Finding your drawing.')),
  };
}

function previewView(): View {
  const s = S.sprite!;
  const again = S.source === 'pad' ? 'Draw again' : 'Retake';
  return {
    el: h(
      'section',
      {class: 'screen'},
      title('Is this your champion?'),
      h('div', {class: 'checker'}, h('img', {class: 'sprite wiggle', src: s.url, alt: 'Your cut-out drawing'})),
      h('button', {type: 'button', class: 'btn go', onclick: () => void sendSprite()}, svg(icons.sparkle), 'Bring it to life!'),
      h('button', {type: 'button', class: 'btn secondary', onclick: () => ((S.step = S.source === 'pad' ? 'pad' : 'intro'), render())}, again),
    ),
  };
}

function emptyView(): View {
  const tip = (icon: string, text: string) => h('li', null, svg(icon), text);
  return {
    el: h(
      'section',
      {class: 'screen'},
      title("Hmm, I can't see a drawing"),
      h('p', {class: 'big-text'}, "Let's try again! These help a lot:"),
      h(
        'ul',
        {class: 'tips'},
        tip(icons.pencil, 'Go over the lines with a thick, dark marker'),
        tip(icons.loop, 'Close the outline all the way round'),
        tip(icons.sun, 'More light, and no shadow from the phone'),
        tip(icons.frame, 'Step back so the whole paper fits in the photo'),
      ),
      S.scanMessage ? h('p', {class: 'note'}, S.scanMessage) : null,
      h('button', {type: 'button', class: 'btn me', onclick: () => ((S.step = S.source === 'pad' ? 'pad' : 'intro'), render())}, 'Try again'),
      h('button', {type: 'button', class: 'link-btn', onclick: () => ((S.step = 'pad'), render())}, 'Draw on screen instead'),
    ),
  };
}

let pad: ReturnType<typeof drawPad> | null = null; // kept so a re-render doesn't wipe the drawing
function padView(): View {
  pad ??= drawPad(
    (img) => {
      S.source = 'pad';
      void makeSprite(async () => img);
    },
    () => {
      S.step = 'intro';
      render();
    },
  );
  return {el: pad.el};
}

const ALIVE_LINES = ['Giving it a name...', 'Teaching it to run...', 'Picking a catchphrase...', 'Tickling its toes...', 'Polishing its crayons...'];

function aliveView(): View {
  const line = h('p', {class: 'cycle note', 'aria-hidden': 'true'}, ALIVE_LINES[0]);
  const late = h('div', {class: 'stack center', hidden: true}, h('p', {class: 'note'}, 'Big imaginations take a moment...'), h('button', {type: 'button', class: 'btn secondary', onclick: () => void sendSprite()}, 'Send it again'));
  let i = 0;
  const timer = setInterval(() => (line.textContent = ALIVE_LINES[++i % ALIVE_LINES.length]), 1800);
  const lateTimer = setTimeout(() => (late.hidden = false), 30_000);
  const stage = h('div', {class: 'alive-stage'}, S.sprite ? h('img', {class: 'sprite bounce', src: S.sprite.url, alt: 'Your drawing'}) : svg(mascot(S.color), 'mascot'));
  for (const [x, y, d] of [
    [8, 12, 0],
    [80, 8, 0.5],
    [88, 70, 0.9],
    [4, 76, 0.3],
  ]) {
    const s = svg(icons.sparkle, 'sparkle');
    s.style.left = `${x}%`;
    s.style.top = `${y}%`;
    s.style.animationDelay = `${d}s`;
    stage.append(s);
  }
  return {
    el: h('section', {class: 'screen center'}, title("It's coming alive..."), stage, line, late),
    destroy() {
      clearInterval(timer);
      clearTimeout(lateTimer);
    },
  };
}

function failedView(): View {
  return {
    el: h(
      'section',
      {class: 'screen center'},
      svg(mascot('#d9e2ec'), 'mascot'),
      title('Oh no, the magic fizzled!'),
      h('p', {class: 'big-text'}, S.scanMessage || 'Something went wrong on the TV side.'),
      h('button', {type: 'button', class: 'btn go', onclick: () => void sendSprite()}, 'Try again'),
      h('button', {type: 'button', class: 'btn secondary', onclick: () => ((S.step = S.source === 'pad' ? 'pad' : 'intro'), render())}, S.source === 'pad' ? 'Draw again' : 'Retake'),
    ),
  };
}

const MOVES: Record<string, string> = {walk: 'Walker', hop: 'Hopper', fly: 'Flyer', roll: 'Roller'};

function cardView(): View {
  const sk = S.sketchling!;
  const banner = h('div', {class: 'banner', role: 'status'});
  const img = h('img', {src: sk.spriteUrl, alt: `${sk.name}, your drawing`});
  img.addEventListener('error', () => S.sprite && (img.src = S.sprite.url), {once: true});
  const stat = (label: string, v: number, i: number) => {
    const pips = h('span', {class: 'pips', role: 'img', 'aria-label': `${label} ${v} out of 5`});
    for (let k = 0; k < 5; k++) {
      const p = h('i', {class: k < v ? 'on' : null});
      p.style.animationDelay = `${0.35 + i * 0.15 + k * 0.06}s`;
      pips.append(p);
    }
    return h('div', {class: 'stat'}, h('span', null, label), pips);
  };
  const redraw = h('button', {type: 'button', class: 'link-btn', onclick: () => ((S.redraw = true), (S.step = 'intro'), render())}, 'Draw a new one');
  const update = () => {
    const text = S.phase === 'draw' ? 'Ready! Waiting for the others...' : S.phase === 'reveal' ? 'Look at the TV!' : '';
    banner.textContent = text;
    banner.hidden = !text;
    redraw.hidden = S.phase !== 'draw';
  };
  update();
  return {
    el: h(
      'section',
      {class: 'screen'},
      banner,
      h(
        'article',
        {class: 'card char-card'},
        h('div', {class: 'art'}, img),
        title(sk.name, 'char-name'),
        h('p', {class: 'char-title'}, sk.title),
        h('span', {class: 'tag'}, MOVES[sk.move] ?? sk.move),
        h('div', {class: 'stats'}, stat('Speed', sk.stats.speed, 0), stat('Jump', sk.stats.jump, 1), stat('Power', sk.stats.power, 2)),
        h('p', {class: 'bubble'}, `"${sk.catchphrase}"`),
        h('p', {class: 'byline'}, `Drawn by ${sk.artist || S.name}`),
      ),
      h('div', {class: 'center stack'}, redraw),
    ),
    update,
  };
}

function tvView(text = "Everyone's champions are showing up on the big screen."): View {
  return {el: h('section', {class: 'screen center'}, svg(mascot(S.color), 'mascot'), title('Look at the TV!'), h('p', {class: 'big-text'}, text))};
}

/** Our place from the results phase data: {placements: [{playerId, place}]} or {ranking: [playerId, ...]}. */
function myPlace(): number | null {
  const d = S.phaseData as {placements?: unknown; ranking?: unknown};
  if (Array.isArray(d.placements)) {
    const me = d.placements.find((p) => p && typeof p === 'object' && (p as {playerId?: unknown}).playerId === S.playerId) as {place?: unknown} | undefined;
    if (typeof me?.place === 'number') return me.place;
  }
  if (Array.isArray(d.ranking)) {
    const i = d.ranking.indexOf(S.playerId);
    if (i >= 0) return i + 1;
  }
  return null;
}

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < 36; i++) {
    const c = h('i', {class: 'confetti', 'aria-hidden': 'true'});
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = PLAYER_COLORS[i % PLAYER_COLORS.length];
    c.style.animationDuration = `${1.8 + Math.random() * 1.6}s`;
    c.style.animationDelay = `${Math.random() * 0.6}s`;
    c.style.setProperty('--spin', `${Math.random() * 720 - 360}deg`);
    c.addEventListener('animationend', () => c.remove());
    document.body.append(c);
  }
}

function resultsView(): View {
  const body = h('div', {class: 'stack center'});
  let shown = '';
  let celebrated: number | null = null;
  const update = () => {
    const place = myPlace();
    const sig = `${place}|${S.sketchling?.id}`; // the sketchling can arrive (via players) after the phase
    if (sig === shown) return;
    shown = sig;
    if (place) {
      const sk = S.sketchling;
      body.replaceChildren(
        svg(medal(place), 'medal'),
        title(place === 1 ? 'You won!' : `You came ${place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`}!`),
        sk ? h('img', {class: 'podium', src: sk.spriteUrl, alt: sk.name}) : '',
        h('p', {class: 'big-text'}, place === 1 ? `"${sk?.winLine ?? 'What a champion!'}"` : `${sk?.name ?? 'You'} ran a great race. Look at the TV!`),
      );
      if (place <= 3 && celebrated !== place) confetti();
      celebrated = place;
    } else {
      body.replaceChildren(svg(mascot(S.color), 'mascot'), title('Look at the TV!'), h('p', {class: 'big-text'}, 'Who won? Find out on the big screen.'));
    }
  };
  update();
  return {el: h('section', {class: 'screen center'}, body), update, destroy: () => document.querySelectorAll('.confetti').forEach((c) => c.remove())};
}

function errorView(code: string): View {
  if (code === 'no_room') return homeView(`We can't find room ${S.room}`, 'Check the 4 letters on the TV and type them here.', S.room);
  const msg = code === 'room_full' ? `Up to ${MAX_PLAYERS} players can join. Ask someone to swap with you!` : S.error?.message ?? 'Something went wrong.';
  return {
    el: h(
      'section',
      {class: 'screen center'},
      svg(mascot('#d9e2ec'), 'mascot'),
      title(code === 'room_full' ? 'This party is full!' : 'Uh oh!'),
      h('p', {class: 'big-text'}, msg),
      h('button', {type: 'button', class: 'btn', onclick: () => location.reload()}, 'Try again'),
    ),
  };
}

// ---------------------------------------------------------------- rendering

function screenKey(): string {
  if (S.error) return `error:${S.error.code}`;
  if (!S.room) return 'home';
  if (!S.joined) return S.joining ? 'connecting' : 'join';
  switch (S.phase) {
    case 'lobby':
      return 'lobby';
    case 'draw':
      return S.sketchling && !S.redraw ? 'card' : `scan:${S.step}`;
    case 'reveal':
      return S.sketchling ? 'card' : 'tv';
    case 'race': {
      // Only players who had a champion when the race started are in it; the TV ignores anyone else's taps.
      const racers = S.phaseData.racers;
      return Array.isArray(racers) && !racers.includes(S.playerId) ? 'watch' : 'race';
    }
    case 'results':
      return 'results';
  }
}

function build(key: string): View {
  if (key.startsWith('error:')) return errorView(key.slice(6));
  switch (key) {
    case 'home':
      return homeView();
    case 'join':
      return joinView();
    case 'connecting':
      return connectingView();
    case 'lobby':
      return lobbyView();
    case 'scan:intro':
      return scanIntroView();
    case 'scan:cutting':
      return cuttingView();
    case 'scan:preview':
      return previewView();
    case 'scan:empty':
      return emptyView();
    case 'scan:pad':
      return padView();
    case 'scan:alive':
      return aliveView();
    case 'scan:failed':
      return failedView();
    case 'card':
      return cardView();
    case 'tv':
      return tvView();
    case 'watch':
      return tvView(S.sketchling ? `Cheer them on! ${S.sketchling.name} joins the next race.` : 'Cheer them on!');
    case 'race':
      return raceView(
        () => ({name: S.name, color: S.color, ageGroup: S.age ?? 'grownup', spriteUrl: S.sketchling?.spriteUrl ?? S.sprite?.url}),
        sendInput,
      );
    default:
      return resultsView();
  }
}

const app = document.getElementById('app')!;
const topbar = h('header', {class: 'topbar'});
const host = h('main', {class: 'host'});
app.append(topbar, host);
let current: {key: string; view: View} | null = null;

function updateTopbar() {
  const k = current?.key ?? '';
  const bare = k === 'home' || k === 'join' || k === 'connecting' || k.startsWith('error');
  const offline = (S.joined || S.joining) && S.conn !== 'open';
  topbar.hidden = bare && !offline;
  topbar.replaceChildren(
    h('span', {class: 'mini-logo', hidden: bare}, 'Sketchlings'),
    offline ? h('span', {class: 'chip pill-offline', role: 'status'}, 'Reconnecting...') : S.room ? h('span', {class: 'chip'}, S.room) : '',
  );
}

function render() {
  document.documentElement.style.setProperty('--me', S.color);
  const key = screenKey();
  if (current?.key === key) {
    current.view.update?.();
    updateTopbar();
    return;
  }
  current?.view.destroy?.();
  const view = build(key);
  host.replaceChildren(view.el);
  current = {key, view};
  updateTopbar();
  window.scrollTo(0, 0);
  view.el.querySelector<HTMLElement>('h1')?.focus({preventScroll: true});
}

// Rejoin straight away after a reload if we've been in this room before.
if (S.room && S.playerId && S.name && S.age) {
  S.joining = true;
  link.connect();
  keepAwake();
}
render();
