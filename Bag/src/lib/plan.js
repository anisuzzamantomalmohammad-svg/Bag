// 2.2's money ideas that sit on top of the ledger: account groups (one Bank
// pill for every bank), the two savings jars, the safety margin, paydays,
// "to spend" and "a day till payday", and what a check of an account expects.
import { round2 } from './money';
import { accountKind } from './look';
import { addDays, daysBetween, inRange, parseYmd, today as todayYmd } from './dates';
import { accountBalance, allFlows, comingUp, itemRecord, live, rateOf, upcomingUntil } from './ledger';

/* ------------------------------ Groups ------------------------------ */

export const GROUPS = {
  bank: { label: 'Bank', emoji: '🏦', color: '#7FB2F0' },
  cash: { label: 'Cash', emoji: '💵', color: '#5CC79A' },
  savings: { label: 'Savings', emoji: '🫙', color: '#F5C35B' },
};

// Which pill an account sits under. Banks share one, cash shares one, the
// jars are Savings; anything else (card, KiwiSaver, wallet app) is its own.
export function groupOf(acc) {
  const k = accountKind(acc);
  if (k === 'bank' || k === 'cash' || k === 'savings') return k;
  return `acc:${acc.id}`;
}

export const isJar = (a) => !!a && accountKind(a) === 'savings';

export function sortAccounts(list) {
  return [...list].sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name)));
}

// The pills on Home, in order: Bank, Cash, Savings, then accounts of other
// kinds that are set to show on Home. Each: { id, label, emoji, color,
// accounts, home } with home the total in the home currency.
export function homeGroups(data, { flows = allFlows(data), homePerUnit } = {}) {
  const accs = sortAccounts(live(data.accounts));
  const out = [];
  const bal = (a) => accountBalance(data, a, { flows, homePerUnit }).home;
  ['bank', 'cash', 'savings'].forEach((g) => {
    const list = accs.filter((a) => groupOf(a) === g);
    if (!list.length) return;
    out.push({ id: g, ...GROUPS[g], accounts: list, home: round2(list.reduce((s, a) => s + bal(a), 0)) });
  });
  accs.filter((a) => !GROUPS[groupOf(a)] && a.onHome !== false).forEach((a) => {
    out.push({ id: `acc:${a.id}`, label: a.name, emoji: a.emoji || null, kind: accountKind(a), accounts: [a], home: bal(a), single: true });
  });
  return out;
}

// The bank (or cash account) a new record uses when you pick the group:
// your default, else the one you used last, else the first.
export function defaultIn(data, group) {
  const list = sortAccounts(live(data.accounts)).filter((a) => groupOf(a) === group);
  if (!list.length) return null;
  const want = (data.defaultAccount || {})[group];
  if (want && list.some((a) => a.id === want)) return want;
  if (data.lastAccountId && list.some((a) => a.id === data.lastAccountId)) return data.lastAccountId;
  return list[0].id;
}

/* ------------------------------ Jars ------------------------------ */

export function jars(data) {
  return sortAccounts(live(data.accounts).filter(isJar));
}

// Saved in a stretch = put into jars - taken out - spent from jars. That's
// simply how much the jars changed, from every kind of record.
export function savedIn(data, from, to, flows = allFlows(data)) {
  const ids = new Set(jars(data).map((a) => a.id));
  let s = 0;
  flows.forEach((f) => { if (ids.has(f.accountId) && inRange(f.date, from, to)) s += f.home; });
  return round2(s);
}

// Day by day total in the jars, for the gold line.
export function savedLine(data, { from, now, flows = allFlows(data) }) {
  const list = jars(data);
  const ids = new Set(list.map((a) => a.id));
  let v = round2(list.reduce((t, a) => t + accountBalance(data, a, { flows, upTo: addDays(from, -1) }).home, 0));
  const byDay = {};
  flows.forEach((f) => { if (ids.has(f.accountId) && f.date >= from && f.date <= now) byDay[f.date] = (byDay[f.date] || 0) + f.home; });
  const pts = [];
  for (let d = from; d <= now; d = addDays(d, 1)) {
    v += byDay[d] || 0;
    pts.push({ date: d, v: round2(v) });
    if (pts.length > 800) break;
  }
  return pts;
}

/* ------------------------------ Margin ------------------------------ */

// Money you keep aside in an account and never count as spendable.
export function marginOf(data) {
  const m = data.margin || {};
  if (!m.on || !(Number(m.amount) > 0)) return { on: false, amount: 0, accountId: null };
  return { on: true, amount: round2(Number(m.amount)), accountId: m.accountId || null };
}

/* ------------------------------ To spend ------------------------------ */

// Everything outside the jars, less the safety margin.
export function toSpend(data, { flows = allFlows(data), homePerUnit } = {}) {
  const outside = live(data.accounts).filter((a) => !isJar(a));
  const sum = outside.reduce((t, a) => t + accountBalance(data, a, { flows, homePerUnit }).home, 0);
  return round2(sum - marginOf(data).amount);
}

/* ------------------------------ Paydays ------------------------------ */

// data.paydays: { how: 'weekly' | 'fortnightly' | 'monthly' | 'varies',
//   items: [{ id, dow (0 Sun..6 Sat) or dom (1..31), name, amount, unsure, accountId }],
//   anchor: a date in a pay week, for fortnightly }
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function occursOn(p, it, ymd) {
  const d = parseYmd(ymd);
  if (p.how === 'monthly') {
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return Math.min(Number(it.dom) || 1, last) === d.getDate();
  }
  if (Number(it.dow) !== d.getDay()) return false;
  if (p.how === 'fortnightly') {
    const anchor = p.anchor || ymd;
    const wk = Math.floor(daysBetween(anchor, ymd) / 7);
    return ((wk % 2) + 2) % 2 === 0;
  }
  return true;
}

export const paydayKey = (it, ymd) => `${it.id}_${ymd}`;

// Payday dates from `from` for `days` days: [{ date, item, key }].
export function paydaysBetween(data, from, to) {
  const p = data.paydays || {};
  const items = (p.items || []).filter(Boolean);
  if (!items.length || p.how === 'varies') return [];
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    items.forEach((it) => { if (occursOn(p, it, d)) out.push({ date: d, item: it, key: paydayKey(it, d) }); });
    if (out.length > 200) break;
  }
  return out;
}

// The next payday after today (or today if it's still to be confirmed).
// With "It varies": the next Salary in Upcoming.
export function nextPayday(data, now = todayYmd()) {
  const p = data.paydays || {};
  if (p.how === 'varies' || !(p.items || []).length) {
    const up = upcomingUntil(data, addDays(now, 62), now).items.filter((it) => {
      const r = it.record || (it.repeat && it.repeat.template) || {};
      return r.type === 'income' && r.categoryId === 'salary' && it.date > now;
    });
    return up.length ? { date: up[0].date, days: daysBetween(now, up[0].date), name: null } : null;
  }
  const done = data.paydayDone || {};
  const list = paydaysBetween(data, now, addDays(now, 62)).filter((x) => x.date > now || !done[x.key]);
  if (!list.length) return null;
  const x = list.find((y) => y.date > now) || list[0];
  return { date: x.date, days: daysBetween(now, x.date), name: x.item.name || null, item: x.item };
}

// Paydays from the last 3 days (today included) not yet confirmed or
// skipped, and not put off till later today: Home asks about these.
export function paydaysToConfirm(data, now = todayYmd()) {
  const done = data.paydayDone || {};
  const later = data.paydayLater || {};
  const since = (data.paydays || {}).since || '0000-01-01';
  return paydaysBetween(data, addDays(now, -3), now).filter((x) => x.date >= since && !done[x.key] && later[x.key] !== now);
}

// Spending money a day until the next payday: what's free now, less what's
// due before then (rent, bills, planned savings), shared over the days.
export function perDay(data, { flows = allFlows(data), homePerUnit, now = todayYmd() } = {}) {
  const next = nextPayday(data, now);
  if (!next || next.days < 1) return null;
  const free = toSpend(data, { flows, homePerUnit });
  const due = upcomingUntil(data, addDays(next.date, -1), now);
  const left = round2(free + due.total);
  return { next, left, days: next.days, each: round2(left / next.days) };
}

/* ------------------------------ Checks ------------------------------ */

// What a check of this account should find: its own balance, plus jars you
// said are kept inside it (your bank app shows them together).
export function expectedFor(data, accountId, { flows = allFlows(data), homePerUnit } = {}) {
  const a = (data.accounts || {})[accountId];
  if (!a) return 0;
  let v = accountBalance(data, a, { flows, homePerUnit }).native;
  jars(data).forEach((j) => {
    const inside = j.inside && (j.insideId === accountId || (!j.insideId && accountKind(a) === j.jar));
    if (inside && j.id !== accountId) v += accountBalance(data, j, { flows, homePerUnit }).native;
  });
  return round2(v);
}

/* ------------------------------ Looking ahead ------------------------------ */

// The account the warnings and the calendar watch: where the margin sits,
// else your default bank.
export function watchedAccount(data) {
  const m = marginOf(data);
  const id = (m.on && m.accountId) || defaultIn(data, 'bank') || defaultIn(data, 'cash');
  const a = id && data.accounts[id];
  return a && !a.deleted ? a : null;
}

// Your everyday spending from these accounts, a day: cash out over the last
// 4 weeks, leaving out repeats and debt payments (those are in the plan).
export function everydaySpend(data, accountIds, { flows = allFlows(data), now = todayYmd() } = {}) {
  const from = addDays(now, -28);
  const want = new Set(accountIds);
  let t = 0;
  flows.forEach((f) => {
    if (f.count !== 'expense' || !want.has(f.accountId) || f.date <= from || f.date > now) return;
    if (f.payment || (f.record && f.record.repeatId)) return;
    t += -f.home;
  });
  return round2(Math.max(0, t) / 28);
}

// What a planned thing does to one account (home currency), or 0.
function effectOn(r, accountId) {
  const amt = round2((Number(r.amount) || 0) * rateOf(r));
  if (r.type === 'transfer') return r.accountId === accountId ? -amt : r.toAccountId === accountId ? amt : 0;
  if (r.accountId !== accountId) return 0;
  if (r.type === 'income') return amt;
  if (r.type === 'expense') return -amt;
  return 0;
}

// Day by day, the end-of-day balance of one account: today as it is now,
// then each day's bills, pay and saves, less your everyday spending.
// { account, everyday, start, days: { ymd: { start, end, items } }, firstNeg }
export function forecast(data, { account, days = 70, flows = allFlows(data), homePerUnit, now = todayYmd() } = {}) {
  const acc = account || watchedAccount(data);
  if (!acc) return null;
  const start = accountBalance(data, acc, { flows, homePerUnit }).home;
  const everyday = everydaySpend(data, [acc.id], { flows, now });
  const until = addDays(now, days);
  const byDay = {};
  const push = (d, it) => { (byDay[d] = byDay[d] || []).push(it); };
  comingUp(data, { days, now, people: false }).forEach((it) => {
    if (it.date <= now || it.date > until) return;
    const r = itemRecord(it);
    const v = effectOn(r, acc.id);
    if (!v) return;
    const toJar = r.type === 'transfer' && isJar(data.accounts[r.toAccountId]);
    const cat = data.categories[r.categoryId];
    push(it.date, {
      key: it.key, date: it.date, amount: v, item: it,
      name: r.name || (cat && cat.name) || (r.type === 'transfer' ? 'Move' : 'Repeat'),
      emoji: toJar ? '🫙' : r.type === 'transfer' ? '⇄' : cat && !cat.deleted ? cat.emoji : '•',
      kind: toJar ? 'gold' : v > 0 ? 'in' : 'out', categoryId: r.categoryId,
    });
  });
  // Paydays you told Bag about, unless a repeat already brings the pay in.
  const p = data.paydays || {};
  const done = data.paydayDone || {};
  const payRepeat = live(data.repeats).some((rep) => !rep.paused && rep.template && rep.template.type === 'income' && rep.template.categoryId === 'salary' && rep.template.accountId === acc.id);
  if (!payRepeat && p.how !== 'varies') {
    paydaysBetween(data, addDays(now, 1), until).forEach((x) => {
      const where = x.item.accountId || defaultIn(data, 'bank');
      if (where !== acc.id || done[x.key] || !(Number(x.item.amount) > 0)) return;
      push(x.date, { key: x.key, date: x.date, amount: round2(Number(x.item.amount)), name: x.item.name || 'Pay', emoji: '💼', kind: 'in', payday: true });
    });
  }
  const out = { account: acc, everyday, start, days: {}, firstNeg: null };
  out.days[now] = { start: null, end: round2(start), items: [], today: true };
  if (start < 0) out.firstNeg = now;
  let bal = start;
  for (let d = addDays(now, 1); d <= until; d = addDays(d, 1)) {
    const items = byDay[d] || [];
    const s0 = round2(bal);
    items.forEach((it) => { bal += it.amount; });
    bal = round2(bal - everyday);
    out.days[d] = { start: s0, end: bal, items };
    if (bal < 0 && !out.firstNeg) out.firstNeg = d;
  }
  return out;
}

// The quick add line: "lunch 15 cash", "countdown 24.40", "15,50 coffee bank".
const QA_WORDS = {
  lunch: ['eating', 'food', 'dining'], dinner: ['eating', 'food', 'dining'], breakfast: ['eating', 'food'], coffee: ['eating', 'coffee', 'food'], cafe: ['eating', 'coffee', 'food'],
  countdown: ['groceries', 'grocery'], 'new world': ['groceries'], paknsave: ['groceries'], grocery: ['groceries'], groceries: ['groceries'],
  bus: ['transport'], snapper: ['transport'], uber: ['transport'], petrol: ['transport', 'fuel'], fuel: ['transport'], train: ['transport'],
  rent: ['rent', 'housing'], phone: ['phone', 'bills'], power: ['bills', 'power'],
};
export function parseQuick(data, text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const numAt = words.findIndex((w) => /^\d+([.,]\d{1,2})?$/.test(w));
  const amount = numAt >= 0 ? Number(words[numAt].replace(',', '.')) : null;
  const rest = words.filter((_, i) => i !== numAt);
  const accs = live(data.accounts);
  let accountId = null;
  const keep = [];
  rest.forEach((w) => {
    const l = w.toLowerCase();
    if (!accountId && (l === 'cash' || l === 'bank')) { accountId = defaultIn(data, l); return; }
    const byName = accs.find((a) => a.name.toLowerCase() === l);
    if (!accountId && byName) { accountId = byName.id; return; }
    keep.push(w);
  });
  const name = keep.join(' ');
  const lname = name.toLowerCase();
  // A name you've used before wins: same category as last time.
  let categoryId = null;
  const last = live(data.records).filter((r) => r.type === 'expense' && (r.name || '').toLowerCase() === lname).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (last) categoryId = last.categoryId;
  if (!categoryId) {
    const cats = live(data.categories).filter((c) => (c.kind || 'expense') === 'expense');
    const hit = (key) => cats.find((c) => c.id === key || c.name.toLowerCase().includes(key));
    const exact = cats.find((c) => c.name.toLowerCase() === lname);
    if (exact) categoryId = exact.id;
    else {
      const key = Object.keys(QA_WORDS).find((k) => lname.includes(k));
      if (key) { const c = QA_WORDS[key].map(hit).find(Boolean); if (c) categoryId = c.id; }
    }
  }
  if (!accountId) {
    const d = (data.typeDefaults || {}).expense;
    accountId = (d && data.accounts[d] && !data.accounts[d].deleted ? d : null) || (last && data.accounts[last.accountId] && !data.accounts[last.accountId].deleted ? last.accountId : null) || defaultIn(data, 'cash') || defaultIn(data, 'bank');
  }
  return { amount, name, categoryId, accountId };
}
