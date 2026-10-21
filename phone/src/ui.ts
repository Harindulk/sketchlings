// Tiny DOM helpers and our own hand-drawn SVG art (no external assets).
import {PLAYER_COLORS} from '../../shared/protocol';

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> | null;

/** Create an element. Props: `class`, `style`, `on<event>` handlers, other keys become attributes. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

/** Parse trusted, static SVG markup from this file. */
export function svg(markup: string, cls = ''): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  const el = t.content.firstElementChild as SVGSVGElement;
  if (cls) el.setAttribute('class', cls);
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  return el;
}

const INK = '#1F2A44';

export function logo(text = 'Sketchlings'): HTMLElement {
  const el = h('div', {class: 'logo', role: 'img', 'aria-label': text});
  [...text].forEach((ch, i) => {
    const s = h('span', {'aria-hidden': 'true'}, ch);
    s.style.setProperty('--c', PLAYER_COLORS[i % PLAYER_COLORS.length]);
    s.style.setProperty('--r', `${i % 2 ? 4 : -4}deg`);
    s.style.setProperty('--y', `${i % 3 === 1 ? -3 : 0}px`);
    s.style.setProperty('--d', `${-i * 0.18}s`);
    el.append(s);
  });
  return el;
}

export const mascot = (fill = '#ffc531') => `
<svg viewBox="0 0 160 150" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M66 38 Q58 18 44 12"/><path d="M98 38 Q108 18 124 14"/>
    <path d="M58 128 L54 144 L42 145"/><path d="M100 128 L104 144 L116 144"/>
    <path d="M30 86 Q12 78 10 62"/><path d="M134 84 Q150 74 150 58"/>
  </g>
  <circle cx="42" cy="11" r="8" fill="#ff5a5f" stroke="${INK}" stroke-width="4"/>
  <circle cx="126" cy="13" r="8" fill="#2bb3ff" stroke="${INK}" stroke-width="4"/>
  <path d="M30 92 C22 54 52 30 84 32 C118 34 142 58 134 96 C128 126 98 136 74 133 C46 130 34 116 30 92 Z" fill="${fill}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M44 104 C56 122 104 126 122 104 C116 124 96 132 76 130 C58 128 48 120 44 104 Z" fill="#000" opacity=".08"/>
  <circle cx="66" cy="72" r="15" fill="#fff" stroke="${INK}" stroke-width="4.5"/>
  <circle cx="102" cy="70" r="15" fill="#fff" stroke="${INK}" stroke-width="4.5"/>
  <circle cx="70" cy="75" r="6.5" fill="${INK}"/><circle cx="106" cy="73" r="6.5" fill="${INK}"/>
  <ellipse cx="52" cy="96" rx="8" ry="5" fill="#ff5a5f" opacity=".45"/><ellipse cx="118" cy="94" rx="8" ry="5" fill="#ff5a5f" opacity=".45"/>
  <path d="M68 100 Q86 116 104 98" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
  <path d="M80 106 L83 115 L88 106" fill="#fff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
</svg>`;

/** Plain paper (no lines: kids copy the picture, and ruled lines spoil the cutout) with a creature being drawn on by a marker. */
export const drawIllo = `
<svg viewBox="0 0 300 210" xmlns="http://www.w3.org/2000/svg">
  <g transform="rotate(-4 150 105)">
    <rect x="40" y="18" width="210" height="172" rx="6" fill="#fff" stroke="${INK}" stroke-width="4"/>
  </g>
  <path class="draw-on" d="M108 140 C96 100 120 64 152 66 C188 68 208 96 198 130 C190 156 160 162 140 160 C120 158 110 152 108 140 Z M132 100 a8 8 0 1 0 0.1 0 M168 98 a8 8 0 1 0 0.1 0 M136 128 Q152 142 170 126 M126 66 L114 40 M178 70 L192 44"
    fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <g class="pen">
    <g transform="translate(206 120) rotate(35)">
      <rect x="-11" y="-92" width="22" height="70" rx="6" fill="#ff5a5f" stroke="${INK}" stroke-width="4"/>
      <rect x="-11" y="-104" width="22" height="18" rx="5" fill="${INK}"/>
      <path d="M-9 -22 h18 l-4 16 h-10 z" fill="#fff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M-4 -6 h8 l-4 8 z" fill="${INK}"/>
    </g>
  </g>
</svg>`;

export const icons = {
  camera: `<svg viewBox="0 0 40 40"><path d="M6 13h7l3-5h8l3 5h7v19H6z" fill="#fff" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/><circle cx="20" cy="22" r="6.5" fill="#2bb3ff" stroke="${INK}" stroke-width="3.5"/></svg>`,
  pencil: `<svg viewBox="0 0 40 40"><path d="M8 32l3-9L27 7l6 6-16 16z" fill="#ffc531" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/><path d="M8 32l3-9 6 6z" fill="#fff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/></svg>`,
  sparkle: `<svg viewBox="0 0 40 40"><path d="M20 3c2 10 7 15 17 17-10 2-15 7-17 17-2-10-7-15-17-17C13 18 18 13 20 3z" fill="#ffc531" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/></svg>`,
  loop: `<svg viewBox="0 0 40 40"><path d="M8 26c-4-10 4-20 14-18 9 2 13 12 8 19-4 6-14 7-19 2" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M8 22l3 7 7-3" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  sun: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="8" fill="#ffc531" stroke="${INK}" stroke-width="3.5"/><path d="M20 3v5M20 32v5M3 20h5M32 20h5M8 8l3.5 3.5M28.5 28.5L32 32M8 32l3.5-3.5M28.5 11.5L32 8" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/></svg>`,
  frame: `<svg viewBox="0 0 40 40"><path d="M5 13V5h8M27 5h8v8M35 27v8h-8M13 35H5v-8" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><rect x="12" y="12" width="16" height="16" rx="2" fill="#fff" stroke="${INK}" stroke-width="3"/></svg>`,
  up: `<svg viewBox="0 0 40 40"><path d="M20 6L6 22h8v12h12V22h8z" fill="#3ddc84" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/></svg>`,
  roar: `<svg viewBox="0 0 40 40"><path d="M6 14c0-5 4-8 9-8h10c5 0 9 3 9 8v6c0 8-6 14-14 14S6 28 6 20z" fill="#fff" stroke="${INK}" stroke-width="3.5"/><path d="M11 16h18c0 8-4 13-9 13s-9-5-9-13z" fill="#ff5a5f" stroke="${INK}" stroke-width="3"/><path d="M13 16l2 4 2-4M23 16l2 4 2-4" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></svg>`,
  bolt: `<svg viewBox="0 0 20 20"><path d="M11 1L3 12h6l-1 7 8-11h-6z" fill="#ffc531" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  check: `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#3ddc84" stroke="${INK}" stroke-width="2.5"/><path d="M5.5 10.5l3 3 6-7" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  mic: `<svg viewBox="0 0 40 40"><rect x="14" y="5" width="12" height="20" rx="6" fill="#fff" stroke="${INK}" stroke-width="3.5"/><path d="M9 19c0 7 5 11 11 11s11-4 11-11M20 30v6" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/></svg>`,
  scissors: `<svg viewBox="0 0 140 140"><path class="dashes" d="M10 118 H130" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><g class="blade-a"><path d="M70 70 L126 44" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><circle cx="38" cy="96" r="16" fill="#ff5a5f" stroke="${INK}" stroke-width="5"/><path d="M50 86 L70 70" stroke="${INK}" stroke-width="7" stroke-linecap="round"/></g><g class="blade-b"><path d="M70 70 L126 96" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><circle cx="38" cy="44" r="16" fill="#2bb3ff" stroke="${INK}" stroke-width="5"/><path d="M50 54 L70 70" stroke="${INK}" stroke-width="7" stroke-linecap="round"/></g><circle cx="70" cy="70" r="5" fill="#ffc531" stroke="${INK}" stroke-width="3"/></svg>`,
  // Age pickers: a sprout, a sapling and a tree, drawn like doodles.
  little: `<svg viewBox="0 0 44 44"><path d="M22 40V24" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/><path d="M22 26c-8 0-12-5-12-11 7 0 12 4 12 11zM22 24c0-7 5-11 12-11 0 6-4 11-12 11z" fill="#3ddc84" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/></svg>`,
  big: `<svg viewBox="0 0 44 44"><path d="M22 41V20" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/><circle cx="22" cy="16" r="12" fill="#3ddc84" stroke="${INK}" stroke-width="3"/><circle cx="17" cy="13" r="2.5" fill="#ff5a5f"/><circle cx="26" cy="19" r="2.5" fill="#ff5a5f"/></svg>`,
  grownup: `<svg viewBox="0 0 44 44"><path d="M19 42V28h6v14" fill="#ff8a3d" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M22 3L8 22h7L6 31h32l-9-9h7z" fill="#3ddc84" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/></svg>`,
};

export function medal(place: number): string {
  const fill = place === 1 ? '#ffc531' : place === 2 ? '#d9e2ec' : place === 3 ? '#ff8a3d' : '#2bb3ff';
  const label = place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`;
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <path d="M60 6 L84 78 L104 74 L80 6 Z" fill="#ff5a5f" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M140 6 L116 78 L96 74 L120 6 Z" fill="#2bb3ff" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <circle cx="100" cy="128" r="62" fill="${fill}" stroke="${INK}" stroke-width="6"/>
    <circle cx="100" cy="128" r="46" fill="none" stroke="${INK}" stroke-width="3" stroke-dasharray="6 8" opacity=".5"/>
    <text x="100" y="146" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="52" fill="${INK}">${label}</text>
  </svg>`;
}

/** Short, kind haptic tick where supported (Android; iOS Safari ignores it). */
export function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}

export const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode / storage blocked: we just won't remember */
    }
  },
};
