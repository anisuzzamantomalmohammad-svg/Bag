// Light and dark colours. Every colour keeps one meaning in both:
// green money in, red money out or a problem, amber a heads-up, the accent
// for what's selected. "Blue and orange" swaps the money colours for eyes
// that mix up red and green.
import { ACCENTS } from '../data/defaults';

// Slate and ice. Light is Deen's "Slate" palette; dark is deep slate with an
// ice-blue arch.
const LIGHT = {
  mode: 'light',
  bg: '#F1F3F6', card: '#FFFFFF', soft: '#E7EBF0', track: '#E3E8EE', line: '#E3E8EE', lineStrong: '#D3DAE3',
  ink: '#18202B', muted: '#4A5768', faint: '#6B7888', faint2: '#8391A3', disabled: '#A6B1BE',
  warn: '#8A5300', warnSoft: '#FCEFD3', warnBorder: '#F0D9A0', warnBtn: '#E9A93A', warnBtnInk: '#2A1A00', warnBar: '#D97706', danger: '#C0392B', dangerSoft: '#FBEFEE', catBar: '#A6B1BE',
  overlay: 'rgba(26,34,48,0.4)', statusBar: 'dark-content', tabBg: 'rgba(255,255,255,0.94)', chipOn: '#3B4B5E', chipOnInk: '#F4F6F9', segOn: '#FFFFFF',
  importSoft: '#E4F2EA', importInk: '#2E8A5E',
  // A faint colour at the top of each tab, so you know where you are.
  tints: { Home: '#DCE8F6', Records: '#E2E4F7', Upcoming: '#F7E2E6', Reports: '#E9E2F7' },
  lineA: '#3B6EA8', lineB: '#2F3D4E', area: '#3B6EA8', dot: '#18202B', dotRing: '#F1F3F6',
  roseA: '#FBE9EA', roseB: '#F7F1F4', roseBorder: '#F0D3D6', plusA: '#55697F', plusB: '#2F3D4E', plusInk: '#FFFFFF',
  pinBg: '#FCEBD8', barA: '#D5DCE5', barB: '#E6EAF0', barOnA: '#55697F', barOnB: '#2F3D4E',
};

const DARK = {
  mode: 'dark',
  bg: '#0E131A', card: '#151C25', soft: '#1C2430', track: '#151C25', line: '#212A35', lineStrong: '#2A3441',
  ink: '#EEF2F6', muted: '#9AA7B6', faint: '#6F7D8D', faint2: '#5D6B7D', disabled: '#4E5B6B',
  warn: '#F5C35B', warnSoft: '#2E2615', warnBorder: '#4A3B17', warnBtn: '#F5C35B', warnBtnInk: '#2A2213', warnBar: '#F59E0B', danger: '#F0857E', dangerSoft: '#3A2226', catBar: '#4E5B6B',
  overlay: 'rgba(0,0,0,0.55)', statusBar: 'light-content', tabBg: 'rgba(21,28,37,0.94)', chipOn: '#D6E3F0', chipOnInk: '#0E131A', segOn: '#1C2430',
  importSoft: '#16302A', importInk: '#5CC79A',
  tints: { Home: '#18263A', Records: '#1A2338', Upcoming: '#2A1C22', Reports: '#20203A' },
  lineA: '#7FB2F0', lineB: '#D6E3F0', area: '#7FB2F0', dot: '#EEF2F6', dotRing: '#0E131A',
  roseA: '#2A1E22', roseB: '#17181F', roseBorder: '#3A2A2E', plusA: '#EEF4FA', plusB: '#A9C1DA', plusInk: '#0E131A',
  pinBg: '#2A2018', barA: '#2A3542', barB: '#1E2733', barOnA: '#EEF4FA', barOnB: '#9FB8D3',
};

const MONEY = {
  greenRed: { light: { in: '#2E8A5E', out: '#C0392B' }, dark: { in: '#5CC79A', out: '#F0857E' } },
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
