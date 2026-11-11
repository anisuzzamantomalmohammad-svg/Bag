// Dates are stored as local "YYYY-MM-DD" strings, so a record never moves
// a day when the phone changes time zone.

const pad = (n) => String(n).padStart(2, '0');
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseYmd(s) {
  const [y, m, d] = String(s || '').split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}
export const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
export const today = () => ymd(new Date());

export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export const daysInMonth = (y, m0) => new Date(y, m0 + 1, 0).getDate();

// Adds months, keeping the day where it can (31 Jan + 1 month = 28/29 Feb).
export function addMonths(s, n, day) {
  const d = parseYmd(s);
  const want = day || d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  t.setDate(Math.min(want, daysInMonth(t.getFullYear(), t.getMonth())));
  return ymd(t);
}

export function daysBetween(a, b) {
  return Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
}

export const dow = (s) => parseYmd(s).getDay();

// Start of the week containing s. startDow: 1 = Monday.
export function weekStartOf(s, startDow = 1) {
  const back = (dow(s) - startDow + 7) % 7;
  return addDays(s, -back);
}

// Start of the budget month containing s. startDay lets a month run from payday.
export function monthStartOf(s, startDay = 1) {
  const d = parseYmd(s);
  const sd = Math.min(startDay, daysInMonth(d.getFullYear(), d.getMonth()));
  if (d.getDate() >= sd) return ymd(new Date(d.getFullYear(), d.getMonth(), sd));
  const p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  p.setDate(Math.min(startDay, daysInMonth(p.getFullYear(), p.getMonth())));
  return ymd(p);
}

// { from, to } inclusive for the week or month containing s.
export function periodOf(s, period, { weekStart = 1, monthStart = 1 } = {}) {
  if (period === 'week') {
    const from = weekStartOf(s, weekStart);
    return { from, to: addDays(from, 6) };
  }
  const from = monthStartOf(s, monthStart);
  const next = addMonths(from, 1, monthStart);
  return { from, to: addDays(next, -1) };
}

export const inRange = (s, from, to) => (!from || s >= from) && (!to || s <= to);

// "9 Nov 2026", "Mon 9 Nov", "Mon 9 Nov 2026", "9 Nov"
export function fmtDate(s, { weekday = false, year = true, long = false } = {}) {
  if (!isYmd(s)) return '';
  const d = parseYmd(s);
  const parts = [];
  if (weekday) parts.push(long ? DAY_LONG[d.getDay()] : DAY_NAMES[d.getDay()]);
  parts.push(String(d.getDate()));
  parts.push(long ? MONTHS_LONG[d.getMonth()] : MONTHS[d.getMonth()]);
  if (year) parts.push(String(d.getFullYear()));
  return parts.join(' ');
}

// Short form that drops the year when it's this year.
export function fmtShort(s, { weekday = false } = {}) {
  const thisYear = s && s.slice(0, 4) === today().slice(0, 4);
  return fmtDate(s, { weekday, year: !thisYear });
}

export function relative(s, from = today()) {
  const n = daysBetween(from, s);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1) return `in ${n} days`;
  return `${-n} days ago`;
}

export const monthKey = (s) => s.slice(0, 7);
export function monthLabel(key, long = false) {
  const [y, m] = key.split('-').map(Number);
  return `${(long ? MONTHS_LONG : MONTHS)[m - 1]}${long ? ` ${y}` : ''}`;
}

// Every month key from a to b inclusive ("2026-06" ... "2026-11").
export function monthKeys(fromYmd, toYmd) {
  const out = [];
  let [y, m] = fromYmd.slice(0, 7).split('-').map(Number);
  const [ty, tm] = toYmd.slice(0, 7).split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export const lastDayOfMonth = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${key}-${pad(daysInMonth(y, m - 1))}`;
};

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
