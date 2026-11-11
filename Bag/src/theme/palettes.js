// Light and dark colours. Every colour keeps one meaning in both:
// green money in, red money out or a problem, amber a heads-up, the accent
// for what's selected. "Blue and orange" swaps the money colours for eyes
// that mix up red and green.
import { ACCENTS } from '../data/defaults';

// Slate and ice. Light is Deen's "Slate" palette; dark is deep slate with an
// ice-blue arch.
const LIGHT = {
  mode: 'light',
  bg: '#F1F3F6', card: '#FFFFFF', soft: '#E9EDF2', track: '#DDE2E9', line: '#E6EAF0', lineStrong: '#D3DAE3',
  ink: '#1A2230', muted: '#4A5768', faint: '#5D6B7D', faint2: '#8391A3', disabled: '#A6B1BE',
  warn: '#9A4D00', warnBar: '#D97706', danger: '#C0392B', dangerSoft: '#FBEFEE', catBar: '#A6B1BE',
  overlay: 'rgba(26,34,48,0.4)', statusBar: 'dark-content', tabBg: '#FFFFFF', chipOn: '#3B4B5E', chipOnInk: '#F1F3F6', segOn: '#FFFFFF',
  importSoft: '#E4F2EA', importInk: '#2E8A5E',
};

const DARK = {
  mode: 'dark',
  bg: '#121821', card: '#1A222D', soft: '#1E2733', track: '#1E2733', line: '#232C38', lineStrong: '#313C4A',
  ink: '#E8EDF3', muted: '#9AA8B8', faint: '#8494A6', faint2: '#6B7A8C', disabled: '#4E5B6B',
  warn: '#FBBF24', warnBar: '#F59E0B', danger: '#F2766F', dangerSoft: '#3A2226', catBar: '#4E5B6B',
  overlay: 'rgba(0,0,0,0.55)', statusBar: 'light-content', tabBg: '#161D27', chipOn: '#D6E3F0', chipOnInk: '#121821', segOn: '#2A3442',
  importSoft: '#16302A', importInk: '#4BBF8A',
};

const MONEY = {
  greenRed: { light: { in: '#2E8A5E', out: '#C0392B' }, dark: { in: '#4BBF8A', out: '#F2766F' } },
  blueOrange: { light: { in: '#1D4ED8', out: '#C2410C' }, dark: { in: '#8AB4FF', out: '#FB923C' } },
};

const PLANNED = {
  slate: ['#C9D3DF', '#33404F'],
  blue: ['#BFD0F8', '#2C3E6B'], teal: ['#A7E3D9', '#1F4D47'], purple: ['#D9CCF7', '#3B2F63'], pink: ['#F6C3D8', '#5A2A42'], ink: ['#D4D4CF', '#3A3A40'],
};

const FILL = {
  slate: ['#3B4B5E', '#D6E3F0', null],
  blue: ['#1D4ED8', '#2F5BEA', '#FFFFFF'], teal: ['#0F766E', '#0F766E', '#FFFFFF'], purple: ['#6D28D9', '#7C3AED', '#FFFFFF'],
  pink: ['#BE185D', '#DB2777', '#FFFFFF'], ink: ['#18181B', '#F4F4F5', null],
};

export function resolveTheme({ mode = 'light', accent = 'slate', money = 'greenRed', textSize = 1 } = {}) {
  const dark = mode === 'dark';
  const base = dark ? DARK : LIGHT;
  const a = ACCENTS[accent] || ACCENTS.slate;
  const m = (MONEY[money] || MONEY.greenRed)[dark ? 'dark' : 'light'];
  const p = PLANNED[accent] || PLANNED.slate;
  const f = FILL[accent] || FILL.slate;
  const fill = dark ? f[1] : f[0];
  const onFill = f[2] || (dark ? '#121821' : '#FFFFFF');
  return {
    ...base,
    accent: dark ? a.dark : a.light,
    accentSoft: dark ? a.softDark : a.soft,
    accentFill: fill,
    onAccent: onFill,
    // The arch behind the balance, like Deen's prayer card.
    arch: fill,
    archInk: onFill,
    archSub: accent === 'slate' ? (dark ? '#3B4B5E' : '#D6E3F0') : dark ? 'rgba(18,24,33,0.7)' : 'rgba(255,255,255,0.78)',
    planned: dark ? p[1] : p[0],
    in: m.in,
    out: m.out,
    textScale: textSize,
  };
}
