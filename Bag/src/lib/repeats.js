// Repeats: rent every week, salary every Wednesday, the SIM on the 15th.
//
// A repeat holds a template record and a rule. Each date the rule hits
// becomes a real record with the id rep_<repeat>_<date>, so a second phone
// making the same one ends up with the same record, never a copy. With
// "ask me to confirm" on, money in and out waits as Pending until you
// confirm it; bills you owe are made 14 days early as Open, so their
// reminder can go off.
import { addDays, addMonths, daysBetween, daysInMonth, dow, fmtDate, ordinal, parseYmd, today as todayYmd, weekStartOf, ymd, DAY_NAMES } from './dates';

export const FREQS = ['day', 'week', 'month', 'year'];

const monthIndex = (s) => {
  const d = parseYmd(s);
  return d.getFullYear() * 12 + d.getMonth();
};

function dayInMonth(y, m0, monthDay) {
  const last = daysInMonth(y, m0);
  const day = monthDay === 'last' ? last : Math.min(Number(monthDay) || 1, last);
  return ymd(new Date(y, m0, day));
}

// Every date the rule hits between from and to (inclusive), ignoring the end rule.
function rawDates(rep, from, to) {
  const start = rep.start;
  const every = Math.max(1, Number(rep.every) || 1);
  const lo = from > start ? from : start;
  if (lo > to) return [];
  const out = [];
  if (rep.freq === 'day') {
    const off = daysBetween(start, lo);
    let k = Math.ceil(off / every) * every;
    for (let d = addDays(start, k); d <= to; k += every, d = addDays(start, k)) out.push(d);
    return out;
  }
  if (rep.freq === 'week') {
    const days = rep.weekdays && rep.weekdays.length ? rep.weekdays : [dow(start)];
    const w0 = weekStartOf(start, 1);
    for (let d = lo; d <= to; d = addDays(d, 1)) {
      if (!days.includes(dow(d))) continue;
      const weeks = Math.floor(daysBetween(w0, weekStartOf(d, 1)) / 7);
      if (weeks % every === 0) out.push(d);
    }
    return out;
  }
  if (rep.freq === 'month') {
    const md = rep.monthDay || parseYmd(start).getDate();
    const s0 = monthIndex(start);
    for (let mi = monthIndex(lo); mi <= monthIndex(to); mi++) {
      if ((mi - s0) % every !== 0) continue;
      const d = dayInMonth(Math.floor(mi / 12), mi % 12, md);
      if (d >= lo && d <= to) out.push(d);
    }
    return out;
  }
  if (rep.freq === 'year') {
    const sd = parseYmd(start);
    for (let y = parseYmd(lo).getFullYear(); y <= parseYmd(to).getFullYear(); y++) {
      if ((y - sd.getFullYear()) % every !== 0) continue;
      const d = dayInMonth(y, sd.getMonth(), sd.getDate());
      if (d >= lo && d <= to) out.push(d);
    }
    return out;
  }
  return out;
}

// Dates in [from, to] after applying the end rule (a date, or a number of times).
export function nextDates(rep, from, to) {
  if (!rep || !rep.start || !rep.freq) return [];
  const end = rep.end || { type: 'never' };
  let hi = to;
  if (end.type === 'date' && end.date && end.date < hi) hi = end.date;
  if (hi < from) return [];
  if (end.type === 'count' && end.count) {
    // Count from the start; stop looking once the count is used up.
    const all = [];
    let cursor = rep.start;
    while (all.length < end.count && cursor <= hi) {
      const chunkEnd = addDays(cursor, 400) < hi ? addDays(cursor, 400) : hi;
      rawDates(rep, cursor, chunkEnd).forEach((d) => { if (all.length < end.count) all.push(d); });
      cursor = addDays(chunkEnd, 1);
    }
    return all.filter((d) => d >= from && d <= hi);
  }
  return rawDates(rep, from, hi);
}

export function nextDate(rep, after = todayYmd()) {
  const d = nextDates(rep, addDays(after, 1), addDays(after, 800));
  return d[0] || null;
}

// Quick choices on the Add record screen, built from the record's date.
export function presetRule(preset, date) {
  if (preset === 'weekly') return { freq: 'week', every: 1, weekdays: [dow(date)] };
  if (preset === 'fortnightly') return { freq: 'week', every: 2, weekdays: [dow(date)] };
  if (preset === 'monthly') return { freq: 'month', every: 1, monthDay: parseYmd(date).getDate() };
  if (preset === 'yearly') return { freq: 'year', every: 1 };
  return null;
}

export function describe(rep) {
  if (!rep || !rep.freq) return 'Never';
  const n = Math.max(1, Number(rep.every) || 1);
  let s = '';
  if (rep.freq === 'day') s = n === 1 ? 'Every day' : `Every ${n} days`;
  else if (rep.freq === 'week') {
    const days = (rep.weekdays && rep.weekdays.length ? rep.weekdays : [dow(rep.start)]).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    s = `${n === 1 ? 'Every week' : n === 2 ? 'Fortnightly' : `Every ${n} weeks`} · ${days.map((d) => DAY_NAMES[d]).join(', ')}`;
  } else if (rep.freq === 'month') {
    const md = rep.monthDay || parseYmd(rep.start).getDate();
    s = `${n === 1 ? 'Monthly' : `Every ${n} months`} · ${md === 'last' ? 'last day' : ordinal(Number(md))}`;
  } else if (rep.freq === 'year') s = `${n === 1 ? 'Yearly' : `Every ${n} years`} · ${fmtDate(rep.start, { year: false })}`;
  const end = rep.end || {};
  if (end.type === 'date' && end.date) s += ` · until ${fmtDate(end.date)}`;
  if (end.type === 'count' && end.count) s += ` · ${end.count} times`;
  return s;
}

// Last confirmed amount of a repeat, for "Last amount" repeats like salary.
export function lastAmount(data, rep) {
  let best = null;
  Object.values(data.records || {}).forEach((r) => {
    if (!r || r.deleted || r.repeatId !== rep.id || r.status === 'pending' || r.status === 'skipped') return;
    if (!best || r.date > best.date) best = r;
  });
  return best ? best.amount : (rep.template || {}).amount;
}

// New records due from every repeat up to today (14 days ahead for debts).
// Returns { records, repeats } to merge into data, or null if nothing's new.
export function materialise(data, now = todayYmd()) {
  const records = {};
  const repeats = {};
  const stamp = Date.now();
  Object.values(data.repeats || {}).forEach((rep) => {
    if (!rep || rep.deleted || rep.paused) return;
    const t = rep.template || {};
    const debt = t.type === 'iowe' || t.type === 'owed';
    const horizon = debt ? addDays(now, 14) : now;
    let from = rep.lastMade ? addDays(rep.lastMade, 1) : rep.start;
    const floor = addDays(now, -62);
    if (from < floor) from = floor;
    if (from > horizon) return;
    const dates = nextDates(rep, from, horizon);
    dates.forEach((d) => {
      const id = `rep_${rep.id}_${d}`;
      if ((data.records || {})[id]) return; // already made, or made and deleted
      const amount = rep.amountMode === 'last' ? lastAmount({ records: { ...data.records, ...records } }, rep) : t.amount;
      const rec = { ...t, id, amount, date: d, repeatId: rep.id, createdAt: stamp, updatedAt: stamp };
      if (debt) {
        rec.status = 'open';
        rec.dueDate = d;
      } else if (rep.confirm) rec.status = 'pending';
      else rec.status = t.type === 'income' ? 'received' : 'paid';
      records[id] = rec;
    });
    repeats[rep.id] = { ...rep, lastMade: horizon };
  });
  const changed = Object.keys(records).length || Object.keys(repeats).some((id) => (data.repeats[id] || {}).lastMade !== repeats[id].lastMade);
  return changed ? { records, repeats } : null;
}

export { addMonths };
