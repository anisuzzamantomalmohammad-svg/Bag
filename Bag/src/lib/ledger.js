// Bag's money rules, in one place.
//
// A record is one thing that happened or will happen:
//   expense   money out, counts as spending (Paid, or Pending from a repeat)
//   income    money in, counts as income (Received, or Pending)
//   transfer  money moved between your own accounts: never income or spending
//   iowe      I owe. kind "bill": spending on the day it's marked paid.
//             kind "borrowed": money came in when borrowed, goes out when
//             repaid, and neither counts as income or spending.
//   owed      Owed to me. kind "lent" (also used for splits): money went out
//             when lent, comes back when repaid, never income or spending.
//             kind "work": income on the day it arrives.
// Every amount is stored in its own currency with the rate to the home
// currency saved on the record, so old totals never change with today's rate.
import { round2 } from './money';
import { addDays, inRange, monthKeys, lastDayOfMonth, periodOf, today as todayYmd, weekStartOf } from './dates';
import { nextDates } from './repeats';

export const TYPES = ['expense', 'income', 'iowe', 'owed', 'transfer'];
export const TYPE_LABEL = { expense: 'Expense', income: 'Income', iowe: 'I owe', owed: 'Owed to me', transfer: 'Transfer' };
export const KIND_LABEL = { bill: 'Bill', borrowed: 'Borrowed money', lent: 'Lent or split', work: 'Payment for work' };
export const STATUS_LABEL = { paid: 'Paid', received: 'Received', pending: 'Pending', open: 'Open', settled: 'Settled', skipped: 'Skipped' };

export const live = (coll) => Object.values(coll || {}).filter((x) => x && !x.deleted);
export const liveRecords = (data) => live(data.records);
export const homeOf = (r) => round2((Number(r.amount) || 0) * (Number(r.rate) || 1));

export const defaultKind = (type) => (type === 'iowe' ? 'bill' : type === 'owed' ? 'lent' : null);
export const kindOf = (r) => r.kind || defaultKind(r.type);
export const isOpen = (r) => (r.type === 'iowe' || r.type === 'owed') && r.status !== 'settled' && !r.deleted && r.status !== 'skipped';
export const isPending = (r) => r.status === 'pending' && !r.deleted;

// Status shown for a record, including Overdue for open debts past their date.
export function statusOf(r, now = todayYmd()) {
  if (isOpen(r)) return r.dueDate && r.dueDate < now ? 'Overdue' : 'Open';
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
      return r.status === 'pending' ? [] : [flow(r.date, r.accountId, -1, 'expense')];
    case 'income':
      return r.status === 'pending' ? [] : [flow(r.date, r.accountId, 1, 'income')];
    case 'transfer': {
      if (r.status === 'pending') return [];
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

// Paid and received things only: open bills and pending repeats wait in Coming up.
export function recentRecords(data, n = 4) {
  return liveRecords(data)
    .filter((r) => flowsOf(r).length && r.status !== 'pending')
    .sort(byNewest)
    .slice(0, n);
}

// Records list with filters. filter.type: 'all' | type; categoryId; accountId; q.
export function filterRecords(data, { from, to, type = 'all', categoryId, accountId, q, transfers = true } = {}) {
  const query = String(q || '').trim().toLowerCase();
  const cats = data.categories || {};
  return liveRecords(data)
    .filter((r) => {
      if (r.status === 'skipped') return false;
      if (type !== 'all' && r.type !== type) return false;
      if (!transfers && r.type === 'transfer') return false;
      if (categoryId && r.categoryId !== categoryId) return false;
      if (accountId && r.accountId !== accountId && r.toAccountId !== accountId && r.settledAccountId !== accountId) return false;
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

/* ------------------------------ Coming up ------------------------------ */

// Open debts (overdue first), pending repeats, and the next dates of repeats
// that haven't been made yet, within `days`.
export function comingUp(data, { days = 14, now = todayYmd() } = {}) {
  const until = addDays(now, days);
  const items = [];
  liveRecords(data).forEach((r) => {
    if (isOpen(r)) {
      const d = r.dueDate || r.date;
      if (d <= until) items.push({ key: r.id, date: d, record: r, kind: r.type === 'iowe' ? 'due' : 'owedToMe' });
    } else if (isPending(r)) {
      items.push({ key: r.id, date: r.date, record: r, kind: 'pending' });
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

/* ------------------------------ Budgets ------------------------------ */

export function budgetStatus(data, budget, { now = todayYmd(), flows = allFlows(data) } = {}) {
  const opts = { weekStart: data.weekStart || 1, monthStart: data.monthStartDay || 1 };
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
    if (r.type === 'iowe' && kindOf(r) === 'bill' && isOpen(r) && inRange(r.dueDate || r.date, from, to)) { planned += homeOf(r); plannedCount += 1; }
    if (r.type === 'expense' && isPending(r) && inRange(r.date, from, to)) { planned += homeOf(r); plannedCount += 1; }
  });
  live(data.repeats).forEach((rep) => {
    const t = rep.template || {};
    if (rep.paused || t.categoryId !== budget.categoryId || (t.type !== 'expense' && t.type !== 'iowe')) return;
    nextDates(rep, addDays(now, 1), to).forEach((d) => {
      if (data.records && data.records[`rep_${rep.id}_${d}`]) return;
      planned += round2((Number(t.amount) || 0) * (Number(t.rate) || 1));
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
