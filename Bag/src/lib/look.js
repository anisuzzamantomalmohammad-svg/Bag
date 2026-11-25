// Colours and icons for categories and accounts, with sensible fallbacks
// for ones made before 1.2 (which had no colour).
import { ACCOUNT_KINDS, CATEGORY_COLORS, DEFAULT_CATEGORIES } from '../data/defaults';

const BY_ID = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, c]));

function hashColor(key) {
  let h = 0;
  for (let i = 0; i < String(key).length; i += 1) h = (h * 31 + String(key).charCodeAt(i)) >>> 0;
  return CATEGORY_COLORS[h % CATEGORY_COLORS.length];
}

export function catColor(cat) {
  if (!cat) return '#9AA7B6';
  return cat.color || (BY_ID[cat.id] && BY_ID[cat.id].color) || hashColor(cat.id || cat.name);
}

// What kind an account is: set on the account, or guessed from its name.
export function accountKind(acc) {
  if (!acc) return 'bank';
  if (acc.kind && ACCOUNT_KINDS[acc.kind]) return acc.kind;
  const n = String(acc.name || '').toLowerCase();
  if (/cash|wallet/.test(n)) return 'cash';
  if (/sav/.test(n)) return 'savings';
  if (/card|credit|visa|master/.test(n)) return 'card';
  return 'bank';
}
export const accountEmoji = (acc) => ACCOUNT_KINDS[accountKind(acc)].emoji;
export const accountColor = (acc) => (acc && acc.color) || ACCOUNT_KINDS[accountKind(acc)].color;

// Mix a hex colour with white (amount 0..1), for soft fills.
export function tint(hex, amount) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(n)) return hex;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (c) => Math.max(0, Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
// The same colour, see-through.
export function alpha(hex, a) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
