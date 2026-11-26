// Bag's money rules, in one place.
//
// A record is one thing that happened or will happen:
//   expense   Cash out. Paid, or Upcoming (status "pending") until you mark it paid.
//   income    Cash in. Received, or Upcoming until you mark it received.
//   transfer  Move: money between your own accounts, never cash in or out.
//   iowe      People, "I borrowed": money came in when borrowed, goes out when
//             repaid, and neither counts as cash in or out.
//   owed      People, "I lent" (also splits): money went out when lent, comes
//             back when repaid, never cash in or out.
// Upcoming counts for nothing until it's marked paid. Bills and payment for
// work from before 1.2 (iowe "bill", owed "work") turn into Cash out and
// Cash in by themselves: see upgradeRecords.
// Every amount is stored in its own currency with the rate to the home
// currency saved on the record, so old totals never change with today's rate.
import { round2 } from './money';
import { addDays, inRange, monthKeys, lastDayOfMonth, periodOf, today as todayYmd, weekStartOf } from './dates';
import { nextDates } from './repeats';

export const TYPES = ['expense', 'income', 'iowe', 'owed', 'transfer'];
export function isMoneyType(t) { return t === 'expense' || t === 'income' || t === 'transfer'; }
export const TYPE_LABEL = { expense: 'Cash out', income: 'Cash in', iowe: 'I borrowed', owed: 'I lent', transfer: 'Move' };
export const KIND_LABEL = { bill: 'Bill', borrowed: 'Borrowed money', lent: 'Lent or split', work: 'Payment for work' };
export const STATUS_LABEL = { paid: 'Paid', received: 'Received', pending: 'Upcoming', scheduled: 'Upcoming', open: 'Open', settled: 'Settled', skipped: 'Skipped' };

export const live = (coll) => Object.values(coll || {}).filter((x) => x && !x.deleted);
export const liveRecords = (data) => live(data.records);
// A record in another currency whose rate isn't known yet (saved offline)
// has rate null: it counts for nothing until the rate comes in, instead of
// counting 1 to 1 (4,000,000 taka is not 4,000,000 dollars).
export const rateOf = (r) => (r.rate === null ? 0 : Number(r.rate) || 1);
export const ratePending = (r) => !!r && r.rate === null;
export const homeOf = (r) => round2((Number(r.amount) || 0) * rateOf(r));

export const defaultKind = (type) => (type === 'iowe' ? 'bill' : type === 'owed' ? 'lent' : null);
export const kindOf = (r) => r.kind || defaultKind(r.type);
export const isOpen = (r) => (r.type === 'iowe' || r.type === 'owed') && r.status !== 'settled' && !r.deleted && r.status !== 'skipped';
// Upcoming: not paid yet, so it counts for nothing until you mark it paid.
export const isPending = (r) => (r.status === 'pending' || r.status === 'scheduled') && !r.deleted && isMoneyType(r.type);
export const isUpcoming = isPending;
export const isScheduled = (r) => r.status === 'scheduled' && !r.deleted;
const waiting = (r) => r.status === 'pending' || r.status === 'scheduled';

// What to call a record: its name, or its category when it has none.
export function displayName(r, data) {
  if (r && r.name && !(r.type === 'transfer' && r.name === 'Transfer')) return r.name;
  if (!r) return '';
  if (r.type === 'transfer') {
    // "Bank → Bank savings", so a move says where the money went.
    const acc = (data && data.accounts) || {};
    const a = acc[r.accountId];
    const b = acc[r.toAccountId];
    if (b && b.kind === 'savings' && a) return `Into ${b.name}`;
    if (a && a.kind === 'savings' && b) return `Out of ${a.name}`;
    return a && b ? `${a.name} → ${b.name}` : 'Move';
  }
  const c = data && data.categories ? data.categories[r.categoryId] : null;
  if (c && !c.deleted) return c.name;
  return r.who || TYPE_LABEL[r.type] || 'Record';
}

// Status shown for a record, including Overdue for open debts past their date.
export function statusOf(r, now = todayYmd()) {
  if (isOpen(r)) return r.dueDate && r.dueDate < now ? 'Overdue' : 'Open';
  if (isPending(r)) return r.date < now ? 'Overdue' : 'Upcoming';
  return STATUS_LABEL[r.status] || '';
}

// The cash movements a record causes. Each flow: { date, accountId, native,
// home, currency, count: 'income' | 'expense' | null, categoryId, record }.
export function flowsOf(r) {
  if (!r || r.deleted || r.status === 'skipped') return [];
  const amt = Number(r.amount) || 0;
  const home = homeOf(r);
  const base = { categoryId: r.categoryId, record: r, currency: r.currency };
  const flow = (date, accountId, sign, count, extra = {}) => ({ ...base, date, accountId, native: sign * amt, home: sign * home, count, ...extra });
  const settleAcc = r.settledAccountId || r.accountId;
  switch (r.type) {
    case 'expense':
      return waiting(r) ? [] : [flow(r.date, r.accountId, -1, 'expense')];
    case 'income':
      return waiting(r) ? [] : [flow(r.date, r.accountId, 1, 'income')];
    case 'transfer': {
      if (waiting(r)) return [];
      // Into an account in another currency: use what arrived if it was typed,
      // otherwise leave it in the sending currency so the balance converts it.
      const known = r.toAmount !== undefined && r.toAmount !== null && Number(r.toAmount) > 0;
      return [
        flow(r.date, r.accountId, -1, null),
        { ...base, date: r.date, accountId: r.toAccountId, native: known ? Number(r.toAmount) : amt, home, currency: known ? r.toCurrency || r.currency : r.currency, count: null },
      ];
    }
    case 'iowe': {
      const settled = r.status === 'settled';
      if (kindOf(r) === 'borrowed') {
        const out = [flow(r.date, r.accountId, 1, null)];
        if (settled) out.push(flow(r.settledDate || r.date, settleAcc, -1, null));
        return out;
      }
      return settled ? [flow(r.settledDate || r.date, settleAcc, -1, 'expense')] : [];
    }
    case 'owed': {
      const settled = r.status === 'settled';
      if (kindOf(r) === 'work') return settled ? [flow(r.settledDate || r.date, settleAcc, 1, 'income')] : [];
      const out = [flow(r.date, r.accountId, -1, null)];
      if (settled) out.push(flow(r.settledDate || r.date, settleAcc, 1, null));
      return out;
    }
    default:
      return [];
  }
}

export function allFlows(data) {
  const out = [];
  liveRecords(data).forEach((r) => { flowsOf(r).forEach((f) => out.push(f)); });
  return out;
}

// Income and spending between two dates (inclusive), in the home currency.
export function incomeExpense(data, from, to, flows = allFlows(data)) {
  let income = 0;
  let expense = 0;
  flows.forEach((f) => {
    if (!inRange(f.date, from, to)) return;
    if (f.count === 'income') income += f.home;
    else if (f.count === 'expense') expense += -f.home;
  });
  return { income: round2(income), expense: round2(expense), net: round2(income - expense) };
}

/* ------------------------------ Accounts ------------------------------ */

export const openingHome = (a) => round2((Number(a.opening) || 0) * (Number(a.openingRate) || 1));

// Balance of one account on a date (default: everything), in its own currency.
// homePerUnit(cur) gives today's rate for converting flows in other currencies.
export function accountBalance(data, account, { upTo, homePerUnit = () => 1, flows = allFlows(data) } = {}) {
  let native = upTo && account.openingDate && account.openingDate > upTo ? 0 : Number(account.opening) || 0;
  let home = upTo && account.openingDate && account.openingDate > upTo ? 0 : openingHome(account);
  flows.forEach((f) => {
    if (f.accountId !== account.id) return;
    if (upTo && f.date > upTo) return;
    home += f.home;
    if ((f.currency || account.currency) === account.currency) native += f.native;
    else {
      const r = homePerUnit(account.currency) || 1;
      native += f.home / r;
    }
  });
  return { native: round2(native), home: round2(home) };
}

export function totalBalance(data, opts = {}) {
  const flows = opts.flows || allFlows(data);
  return round2(live(data.accounts).reduce((s, a) => s + accountBalance(data, a, { ...opts, flows }).home, 0));
}

// What's still open on the debts, in the home currency.
export function openDebts(data) {
  let owedToMe = 0;
  let iOwe = 0;
  liveRecords(data).forEach((r) => {
    if (!isOpen(r)) return;
    if (r.type === 'owed') owedToMe += homeOf(r);
    else iOwe += homeOf(r);
  });
  return { owedToMe: round2(owedToMe), iOwe: round2(iOwe) };
}

export function netWorth(data, opts = {}) {
  const bal = totalBalance(data, opts);
  const { owedToMe, iOwe } = openDebts(data);
  return { accounts: bal, owedToMe, iOwe, total: round2(bal + owedToMe - iOwe) };
}

/* ------------------------------ Lists ------------------------------ */

// The date a record shows under in lists: when the money moved.
export function effectiveDate(r) {
  if ((r.type === 'iowe' || r.type === 'owed') && r.status === 'settled') return r.settledDate || r.date;
  return r.date;
}

export function byNewest(a, b) {
  const da = effectiveDate(a);
  const db = effectiveDate(b);
  if (da !== db) return da < db ? 1 : -1;
  return (b.createdAt || 0) - (a.createdAt || 0);
}

// Paid and received things only: Upcoming waits in the Upcoming tab.
export function recentRecords(data, n = 4) {
  return liveRecords(data)
    .filter((r) => flowsOf(r).length && !isPending(r))
    .sort(byNewest)
    .slice(0, n);
}

// Records list with filters. filter.type: 'all' | type; categoryId; accountId; q.
export function filterRecords(data, { from, to, type = 'all', categoryId, accountId, accountIds, q, transfers = true } = {}) {
  const want = accountIds ? new Set(accountIds) : null;
  const query = String(q || '').trim().toLowerCase();
  const cats = data.categories || {};
  return liveRecords(data)
    .filter((r) => {
      if (r.status === 'skipped') return false;
      if (type === 'people') { if (r.type !== 'iowe' && r.type !== 'owed') return false; } else if (type === 'upcoming') { if (!isPending(r)) return false; } else if (type !== 'all' && r.type !== type) return false;
      if (!transfers && r.type === 'transfer') return false;
      if (categoryId && r.categoryId !== categoryId) return false;
      if (accountId && r.accountId !== accountId && r.toAccountId !== accountId && r.settledAccountId !== accountId) return false;
      if (want && !want.has(r.accountId) && !want.has(r.toAccountId) && !want.has(r.settledAccountId)) return false;
      if (!inRange(effectiveDate(r), from, to)) return false;
      if (query) {
        const cat = cats[r.categoryId];
        const hay = `${r.name || ''} ${r.description || ''} ${r.who || ''} ${cat ? cat.name : ''} ${r.amount}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    })
    .sort(byNewest);
}

/* ------------------------------ Upcoming ------------------------------ */

// Everything not paid yet, soonest first: Upcoming records (overdue ones
// too, however old), the next dates of repeats that haven't been made yet
// (within `days`), and People who still owe or are owed.
// kind: 'upcoming' (a record) | 'repeat' (a date a repeat will make) |
//       'owedToMe' | 'due' (People).
export function comingUp(data, { days = 14, now = todayYmd(), people = true } = {}) {
  const until = addDays(now, days);
  const items = [];
  liveRecords(data).forEach((r) => {
    if (isOpen(r)) {
      if (!people) return;
      const d = r.dueDate || r.date;
      if (d <= until || !r.dueDate) items.push({ key: r.id, date: d, record: r, kind: r.type === 'iowe' ? 'due' : 'owedToMe' });
    } else if (isPending(r) && r.date <= until) {
      items.push({ key: r.id, date: r.date, record: r, kind: 'upcoming' });
    }
  });
  live(data.repeats).forEach((rep) => {
    if (rep.paused) return;
    const from = addDays(now, 1);
    nextDates(rep, from, until).forEach((d) => {
      if (data.records && data.records[`rep_${rep.id}_${d}`]) return;
      items.push({ key: `v_${rep.id}_${d}`, date: d, repeat: rep, kind: 'repeat' });
    });
  });
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// The record or repeat template behind an Upcoming item.
export const itemRecord = (it) => it.record || (it.repeat && it.repeat.template) || {};

// What an Upcoming item will do to the balance once paid: minus for cash
// out, plus for cash in, nothing for moves and People.
export function itemEffect(it) {
  if (it.kind !== 'upcoming' && it.kind !== 'repeat') return 0;
  const r = itemRecord(it);
  const home = round2((Number(r.amount) || 0) * rateOf(r));
  if (r.type === 'income' || (r.type === 'owed' && kindOf(r) === 'work')) return home;
  if (r.type === 'expense' || (r.type === 'iowe' && kindOf(r) === 'bill')) return -home;
  return 0;
}

// Upcoming money up to a date (overdue included), and what the balance
// will be once it's all paid: { items, total, out, in, count }.
export function upcomingUntil(data, until, now = todayYmd()) {
  const days = Math.max(0, Math.round((Date.parse(until) - Date.parse(now)) / 86400000));
  const items = comingUp(data, { days, now, people: false }).filter((it) => it.date <= until && itemEffect(it) !== 0);
  let total = 0;
  let outSum = 0;
  let inSum = 0;
  items.forEach((it) => { const e = itemEffect(it); total += e; if (e < 0) outSum -= e; else inSum += e; });
  return { items, total: round2(total), out: round2(outSum), in: round2(inSum), count: items.length };
}

// Upcoming records whose day has come (or gone): Home asks about these.
export function dueToAsk(data, now = todayYmd()) {
  return liveRecords(data).filter((r) => isPending(r) && r.date <= now).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
}

// "Rent 280.00", "Rent and Phone (310.00)", "3 payments (840.00)"
export function upcomingWords(up, data, money) {
  if (!up.count) return '';
  const names = [...new Set(up.items.map((it) => displayName(itemRecord(it), data)))];
  const sum = money(up.out + up.in);
  if (up.count === 1) return `${names[0]} ${sum}`;
  if (names.length === 1) return `${up.count} × ${names[0]} (${sum})`;
  if (names.length === 2) return `${names[0]} and ${names[1]} (${sum})`;
  return `${up.count} payments (${sum})`;
}

/* --------------------------- Older data (1.2) --------------------------- */

// Brings records from older versions into the 1.2 model. Safe to run any
// number of times: it only touches records that still use the old shapes.
//   scheduled          -> Upcoming
//   I owe, bill        -> Cash out (paid on the day it was settled, or Upcoming)
//   Owed to me, work   -> Cash in  (received on the day it arrived, or Upcoming)
// Repeats that made bills make Cash out from now on.
export function upgradeRecords(data) {
  const t = Date.now();
  const records = {};
  const repeats = {};
  liveRecords(data).forEach((r) => {
    if (r.status === 'scheduled') { records[r.id] = { ...r, status: 'pending', updatedAt: t }; return; }
    const k = kindOf(r);
    if ((r.type === 'iowe' && k === 'bill') || (r.type === 'owed' && k === 'work')) {
      const income = r.type === 'owed';
      const settled = r.status === 'settled';
      const skipped = r.status === 'skipped';
      records[r.id] = {
        ...r,
        type: income ? 'income' : 'expense',
        kind: null,
        status: skipped ? 'skipped' : settled ? (income ? 'received' : 'paid') : 'pending',
        date: settled ? r.settledDate || r.date : r.dueDate || r.date,
        accountId: settled ? r.settledAccountId || r.accountId : r.accountId,
        dueDate: null,
        settledDate: null,
        settledAccountId: null,
        updatedAt: t,
      };
    }
  });
  live(data.repeats).forEach((rep) => {
    const tp = rep.template || {};
    const k = tp.kind || defaultKind(tp.type);
    if ((tp.type === 'iowe' && k === 'bill') || (tp.type === 'owed' && k === 'work')) {
      repeats[rep.id] = { ...rep, template: { ...tp, type: tp.type === 'owed' ? 'income' : 'expense', kind: null }, updatedAt: t };
    }
  });
  return Object.keys(records).length || Object.keys(repeats).length ? { records, repeats } : null;
}

// Once, when 1.2 first opens: Cash out and Cash in that 1.0.1 counted by
// itself on their day (a future-dated record, or a repeat that didn't ask)
// go back to Upcoming if they're from the last 7 days, so Home can ask.
export function unpayAutoCounted(data, now = todayYmd()) {
  const since = addDays(now, -7);
  const out = {};
  liveRecords(data).forEach((r) => {
    if (r.type !== 'expense' && r.type !== 'income') return;
    if (r.status !== 'paid' && r.status !== 'received') return;
    if (r.date < since || r.date > now || r.imported) return;
    const made = r.createdAt ? new Date(r.createdAt) : null;
    const madeDay = made ? `${made.getFullYear()}-${String(made.getMonth() + 1).padStart(2, '0')}-${String(made.getDate()).padStart(2, '0')}` : null;
    const rep = r.repeatId ? (data.repeats || {})[r.repeatId] : null;
    // A repeat that asked first left it Pending, so paid means you said yes.
    if (r.confirmedAt || (rep && rep.confirm)) return;
    const fromRepeat = rep && r.id === `rep_${rep.id}_${r.date}` && r.date > rep.start;
    const madeAhead = madeDay && madeDay < r.date;
    if (fromRepeat || madeAhead) out[r.id] = { ...r, status: 'pending', updatedAt: Date.now() };
  });
  return Object.keys(out).length ? out : null;
}

/* ------------------------------ Budgets ------------------------------ */

export function budgetStatus(data, budget, { now = todayYmd(), flows = allFlows(data) } = {}) {
  const opts = { weekStart: data.weekStart === 0 ? 0 : data.weekStart || 1, monthStart: data.monthStartDay || 1 };
  const period = budget.period === 'week' ? 'week' : 'month';
  const { from, to } = periodOf(now, period, opts);
  const spentIn = (a, b) => round2(flows.reduce((s, f) => (f.count === 'expense' && f.categoryId === budget.categoryId && inRange(f.date, a, b) ? s - f.home : s), 0));
  const spent = spentIn(from, to);
  let limit = Number(budget.limit) || 0;
  if (data.budgetRollover) {
    const prev = periodOf(addDays(from, -1), period, opts);
    const left = limit - spentIn(prev.from, prev.to);
    if (left > 0) limit = round2(limit + left);
  }
  // Planned: open bills due this period, pending repeats, and repeats still to come.
  let planned = 0;
  let plannedCount = 0;
  liveRecords(data).forEach((r) => {
    if (r.categoryId !== budget.categoryId) return;
    if (r.type === 'expense' && isPending(r) && inRange(r.date, from, to)) { planned += homeOf(r); plannedCount += 1; }
  });
  live(data.repeats).forEach((rep) => {
    const t = rep.template || {};
    if (rep.paused || t.categoryId !== budget.categoryId || t.type !== 'expense') return;
    nextDates(rep, addDays(now, 1), to).forEach((d) => {
      if (data.records && data.records[`rep_${rep.id}_${d}`]) return;
      planned += round2((Number(t.amount) || 0) * rateOf(t));
      plannedCount += 1;
    });
  });
  const paidCount = flows.filter((f) => f.count === 'expense' && f.categoryId === budget.categoryId && inRange(f.date, from, to)).length;
  const pct = limit > 0 ? spent / limit : 0;
  const state = pct > 1 ? 'over' : pct >= 0.8 ? 'warn' : 'ok';
  return { from, to, limit, spent, planned: round2(planned), plannedCount, paidCount, left: round2(limit - spent), pct, state, period };
}

/* ------------------------------ Reports ------------------------------ */

export function monthlySeries(data, from, to, flows = allFlows(data)) {
  return monthKeys(from, to).map((key) => {
    const a = `${key}-01` < from ? from : `${key}-01`;
    const end = lastDayOfMonth(key);
    const b = end > to ? to : end;
    const { income, expense } = incomeExpense(data, a, b, flows);
    return { key, from: a, to: b, income, expense, partial: end > to };
  });
}

export function weeklySeries(data, weeks, { now = todayYmd(), weekStart = 1, flows = allFlows(data) } = {}) {
  const first = addDays(weekStartOf(now, weekStart), -7 * (weeks - 1));
  const out = [];
  for (let i = 0; i < weeks; i++) {
    const a = addDays(first, 7 * i);
    const b = addDays(a, 6);
    const { income, expense } = incomeExpense(data, a, b > now ? now : b, flows);
    out.push({ from: a, to: b, income, expense, current: b >= now });
  }
  return out;
}

export function balanceAtMonthEnds(data, from, to, opts = {}) {
  const flows = opts.flows || allFlows(data);
  return monthKeys(from, to).map((key) => {
    const end = lastDayOfMonth(key);
    const upTo = end > to ? to : end;
    return { key, date: upTo, balance: totalBalance(data, { ...opts, flows, upTo }), current: end > to };
  });
}

export function categoryTotals(data, from, to, count = 'expense', flows = allFlows(data)) {
  const map = {};
  flows.forEach((f) => {
    if (f.count !== count || !inRange(f.date, from, to)) return;
    const k = f.categoryId || 'none';
    if (!map[k]) map[k] = { categoryId: k, total: 0, count: 0 };
    map[k].total += count === 'expense' ? -f.home : f.home;
    map[k].count += 1;
  });
  return Object.values(map).map((x) => ({ ...x, total: round2(x.total) })).sort((a, b) => b.total - a.total);
}

/* ------------------------------ Suggestions ------------------------------ */

// Names typed before, most used first, with the category and account they last had.
export function nameSuggestions(data, typed, type) {
  const q = String(typed || '').trim().toLowerCase();
  const map = {};
  liveRecords(data).forEach((r) => {
    if (!r.name || (type && r.type !== type)) return;
    const k = r.name.trim().toLowerCase();
    if (q && !k.includes(q)) return;
    const m = map[k] || (map[k] = { name: r.name.trim(), count: 0, last: '', categoryId: null, accountId: null, amount: null });
    m.count += 1;
    if (r.date >= m.last) { m.last = r.date; m.categoryId = r.categoryId; m.accountId = r.accountId; m.amount = r.amount; }
  });
  return Object.values(map).sort((a, b) => (q && a.name.toLowerCase().startsWith(q) !== b.name.toLowerCase().startsWith(q) ? (a.name.toLowerCase().startsWith(q) ? -1 : 1) : b.count - a.count)).slice(0, 5);
}

export function peopleSuggestions(data, typed) {
  const q = String(typed || '').trim().toLowerCase();
  const map = {};
  liveRecords(data).forEach((r) => {
    if (!r.who) return;
    const k = r.who.trim();
    if (q && !k.toLowerCase().includes(q)) return;
    map[k] = (map[k] || 0) + 1;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
}

// Past descriptions, most used first. Ones used with the same name come first.
export function descriptionSuggestions(data, typed, name) {
  const q = String(typed || '').trim().toLowerCase();
  const nm = String(name || '').trim().toLowerCase();
  const map = {};
  liveRecords(data).forEach((r) => {
    const d = (r.description || '').trim();
    if (!d) return;
    const k = d.toLowerCase();
    if (q && (!k.includes(q) || k === q)) return;
    const m = map[k] || (map[k] = { text: d, count: 0, same: 0 });
    m.count += 1;
    if (nm && (r.name || '').trim().toLowerCase() === nm) m.same += 1;
  });
  return Object.values(map).sort((a, b) => b.same - a.same || b.count - a.count).slice(0, 4);
}

// "Countdown 45.20" or "45.20 Countdown" -> { name, amount }, else null.
export function splitNameAmount(text) {
  const s = String(text || '').trim();
  const word = /[A-Za-z\u0980-\u09FF]/;
  let m = /^(.*?\S)\s+\$?(\d+(?:[.,]\d{1,2})?)$/.exec(s);
  if (m && word.test(m[1])) return { name: m[1].trim(), amount: m[2].replace(',', '.') };
  // Number first only when it clearly is one ("45 Countdown"), so "7 Eleven" stays a name.
  m = /^\$?(\d{2,}(?:[.,]\d{1,2})?|\d+[.,]\d{1,2})\s+(.*\S)$/.exec(s);
  if (m && word.test(m[2])) return { name: m[2].trim(), amount: m[1].replace(',', '.') };
  return null;
}

// Money that moved but isn't cash in or cash out: lent, borrowed, paid back.
// Negative means more went out than came in.
export function otherMoves(from, to, flows) {
  let sum = 0;
  flows.forEach((f) => {
    if (f.count || !f.record || f.record.type === 'transfer') return;
    if (!inRange(f.date, from, to)) return;
    sum += f.home;
  });
  return round2(sum);
}

/* --------------------------- The balance line --------------------------- */

// Day by day balance for the line on Home, for all accounts or just one.
// pts: one per day from `from` to `now`, each with what happened that day.
// fut: the drops still to come up to `until`, from Upcoming (overdue ones
// land just after today). Opening balances count on their own day.
export function balanceLine(data, { flows = allFlows(data), from, now, until, accountId = null, accountIds = null } = {}) {
  const want = accountIds ? new Set(accountIds) : accountId ? new Set([accountId]) : null;
  const accs = live(data.accounts).filter((a) => !want || want.has(a.id));
  const ids = new Set(accs.map((a) => a.id));
  const cats = data.categories || {};
  const start = round2(accs.reduce((t, a) => t + accountBalance(data, a, { flows, upTo: addDays(from, -1) }).home, 0));
  const byDay = {};
  flows.forEach((f) => {
    if (!ids.has(f.accountId) || f.date < from || f.date > now) return;
    const r = f.record;
    // Moves between two accounts you're looking at cancel out: leave them off.
    if (r.type === 'transfer' && ids.has(r.accountId) && ids.has(r.toAccountId)) return;
    const d = (byDay[f.date] = byDay[f.date] || { total: 0, ev: [] });
    d.total += f.home;
    const c = cats[r.categoryId];
    d.ev.push({ emoji: r.type === 'transfer' ? '🔀' : c && !c.deleted ? c.emoji : '🏷️', name: displayName(r, data) || 'Record', amount: round2(f.home) });
  });
  // An opening balance set inside the stretch counts from its start: it's
  // money you already had, not a jump, and not part of "this month".
  const opened = accs.reduce((t, a) => t + (a.openingDate && a.openingDate >= from && a.openingDate <= now ? openingHome(a) : 0), 0);
  const pts = [];
  let v = start + opened;
  for (let d = from; d <= now; d = addDays(d, 1)) {
    if (byDay[d]) v += byDay[d].total;
    pts.push({ date: d, v: round2(v), ev: byDay[d] ? byDay[d].ev : [] });
    if (pts.length > 800) break;
  }
  const fut = [{ date: now, v: round2(v) }];
  if (until && until >= now) {
    const up = upcomingUntil(data, until, now);
    let f = v;
    up.items.forEach((it) => {
      const r = itemRecord(it);
      if (want && !want.has(r.accountId) && !want.has(r.toAccountId)) return;
      const e = r.type === 'transfer' && want ? (want.has(r.accountId) ? -1 : 0) * (Number(r.amount) || 0) + (want.has(r.toAccountId) ? 1 : 0) * (Number(r.amount) || 0) : itemEffect(it);
      if (!e) return;
      const c = cats[r.categoryId];
      const at = it.date < now ? now : it.date;
      fut.push({ date: at, v: round2(f) });
      f += e;
      fut.push({ date: at, v: round2(f), pin: c && !c.deleted ? c.emoji : '🔁', color: c ? c.color : null, amount: round2(e), name: displayName(r, data), late: it.date < now, due: it.date });
    });
    fut.push({ date: until, v: round2(f) });
  }
  return { pts, fut, start: round2(start + opened), now: round2(v), end: fut[fut.length - 1].v };
}

// Days from a to b (b later is positive).
export function daysUntil(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

// Reports' two climbing lines for [from, to]: money in (what you carried in,
// plus opening balances and every bit of cash in) and money out (every bit of
// cash out). Both only go up; the gap between them is what you have.
// carried: what you had the day before `from` (0 for Total, where openings count as money in).
export function moneyLines(data, { flows = allFlows(data), from, to, carried = 0 }) {
  const inDay = {};
  const outDay = {};
  flows.forEach((f) => {
    if (f.date < from || f.date > to) return;
    if (f.count === 'income') inDay[f.date] = (inDay[f.date] || 0) + f.home;
    else if (f.count === 'expense') outDay[f.date] = (outDay[f.date] || 0) - f.home;
  });
  live(data.accounts).forEach((a) => {
    if (a.openingDate && a.openingDate >= from && a.openingDate <= to) inDay[a.openingDate] = (inDay[a.openingDate] || 0) + openingHome(a);
  });
  const pts = [];
  let i = carried;
  let o = 0;
  let cross = null;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    i += inDay[d] || 0;
    o += outDay[d] || 0;
    if (!cross && o > i + 0.004 && i > 0) cross = d;
    pts.push({ date: d, in: round2(i), out: round2(o) });
  }
  return { pts, carried: round2(carried), in: round2(i), out: round2(o), gap: round2(i - o), cross };
}

// A record that looks like this new one: same kind, day, amount and name.
export function findDuplicate(data, draft) {
  if (!draft || draft.id) return null;
  const name = String(draft.name || '').trim().toLowerCase();
  const amt = Math.round((Number(draft.amount) || 0) * 100);
  return liveRecords(data).find((r) => r.type === draft.type && r.date === draft.date
    && Math.round((Number(r.amount) || 0) * 100) === amt
    && String(r.name || '').trim().toLowerCase() === name) || null;
}
