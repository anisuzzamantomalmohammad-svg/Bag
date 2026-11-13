// What the home screen widget shows, worked out from the saved data. Kept
// free of React and Android code so it can be tested and reused.
import { allFlows, comingUp, displayName, incomeExpense, liveRecords, totalBalance } from '../lib/ledger';
import { addDays, addMonths, daysBetween, fmtShort, lastDayOfMonth, monthLabel, MONTHS, parseYmd, periodOf, today as todayYmd } from '../lib/dates';
import { fmt, round2 } from '../lib/money';

const weekStartOf = (d) => (d.weekStart === 0 ? 0 : d.weekStart || 1);
const PERIOD_WORD = { week: 'week', month: 'month' };

// Running totals for the chart: one point per day (week, month) or per month (all time).
function series(flows, from, to, buckets) {
  const inc = new Array(buckets.length).fill(0);
  const out = new Array(buckets.length).fill(0);
  flows.forEach((f) => {
    if (!f.count || (from && f.date < from) || f.date > to) return;
    const i = buckets.findIndex((b) => f.date <= b);
    if (i < 0) return;
    if (f.count === 'income') inc[i] += f.home;
    if (f.count === 'expense') out[i] -= f.home;
  });
  let a = 0;
  let b = 0;
  return { i: inc.map((v) => round2((a += v))), o: out.map((v) => round2((b += v))) };
}

function firstDate(data, now) {
  let min = now;
  liveRecords(data).forEach((r) => { if (r.date < min) min = r.date; });
  return min;
}

export function widgetModel(data, { now = todayYmd(), view = 'month', homePerUnit = () => 1 } = {}) {
  const decimals = Number((data.numbers || {}).decimals ?? 2);
  const negative = (data.numbers || {}).negative || 'minus';
  const n = (v, o = {}) => fmt(v, { decimals, negative, ...o });
  const flows = allFlows(data);
  const balance = round2(totalBalance(data, { flows, homePerUnit }));
  const locked = !!(data.lock && data.lock.on && !data.lock.widgetNumbers);

  let from;
  let to = now;
  let buckets = [];
  let axis;
  let since;
  if (view === 'week' || view === 'month') {
    const p = periodOf(now, view, { weekStart: weekStartOf(data), monthStart: data.monthStartDay || 1 });
    from = p.from;
    const days = Math.max(1, daysBetween(from, now) + 1);
    for (let k = 0; k < days; k++) buckets.push(addDays(from, k));
    axis = [fmtShort(from), 'Today'];
  } else {
    const first = firstDate(data, now);
    from = null;
    since = first;
    let m = `${first.slice(0, 7)}-01`;
    while (m <= now) {
      buckets.push(lastDayOfMonth(m.slice(0, 7)));
      m = addMonths(m, 1);
    }
    buckets = buckets.slice(-12);
    if (buckets.length) buckets[buckets.length - 1] = now;
    axis = [monthLabel(since.slice(0, 7)), 'Now'];
  }
  const ie = incomeExpense(data, from || '0000-01-01', to, flows);
  const s = series(flows, view === 'total' ? null : from, to, buckets);
  const net = round2(ie.income - ie.expense);

  let verdict;
  if (view === 'total') {
    const mon = MONTHS[parseYmd(since).getMonth()];
    verdict = net >= 0 ? `Kept ${n(net, { decimals: 0 })} since ${mon}. Slow and steady.` : `Down ${n(-net, { decimals: 0 })} since ${mon}.`;
  } else if (!ie.income && !ie.expense) {
    verdict = `Quiet ${PERIOD_WORD[view]} so far.`;
  } else if (net >= 0) {
    verdict = `You're up ${n(net, { decimals: 0 })} this ${PERIOD_WORD[view]}. Nice.`;
  } else {
    verdict = `Down ${n(-net, { decimals: 0 })} this ${PERIOD_WORD[view]}. Easy does it.`;
  }

  // Next two things: bills due, money owed to you, repeats.
  const cats = data.categories || {};
  const coming = comingUp(data, { days: 14, now }).slice(0, 2).map((it) => {
    const r = it.record || (it.repeat && it.repeat.template) || {};
    const c = cats[r.categoryId];
    const a = Number(r.amount) || 0;
    const incoming = r.type === 'income' || it.kind === 'owedToMe';
    const d = parseYmd(it.date);
    const day = it.date === now ? 'Today' : it.date === addDays(now, 1) ? 'Tomorrow' : d.toLocaleDateString('en-NZ', { weekday: 'short' });
    return {
      key: it.key,
      name: it.kind === 'owedToMe' && r.who ? `${r.who} owes you` : displayName(r, data) || 'Repeat',
      emoji: r.type === 'transfer' ? '🔀' : c && !c.deleted ? c.emoji : it.kind === 'owedToMe' ? '🤝' : '🏷️',
      sub: it.date < now ? `Overdue · ${fmtShort(it.date)}` : day,
      amount: `${incoming ? '+' : '−'}${n(a)}`,
      kind: r.type === 'income' ? 'in' : it.kind === 'owedToMe' ? 'neutral' : 'out',
      link: it.record ? `bag://record/${it.record.id}` : `bag://repeat/${it.repeat.id}`,
    };
  });

  const sec = data.secondOn && (data.secondShow || {}).widget && data.secondCurrency && data.secondCurrency !== data.homeCurrency ? homePerUnit(data.secondCurrency) : null;

  return {
    locked,
    view,
    date: parseYmd(now).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' }),
    balance,
    balanceText: n(balance),
    second: sec ? `≈ ${fmt(balance / sec, { decimals: 0 })} ${data.secondCurrency}` : null,
    verdict,
    inText: `+${n(ie.income)}`,
    outText: `−${n(ie.expense)}`,
    series: s,
    axis,
    from: from || since,
    to,
    coming,
  };
}

// The chart as an SVG string: two smooth lines, a dot where each ends.
export function chartSvg({ i, o }, { inColor, outColor, dotRing, width = 300, height = 64 }) {
  const all = [...i, ...o];
  const max = Math.max(1, ...all);
  const pad = 6;
  const pts = (arr) => {
    const k = arr.length;
    return arr.map((v, idx) => [k <= 1 ? width / 2 : pad + (idx * (width - pad * 2)) / (k - 1), height - pad - (v / max) * (height - pad * 2)]);
  };
  const path = (p) => {
    if (!p.length) return '';
    if (p.length === 1) return `M${p[0][0] - 1},${p[0][1]} L${p[0][0] + 1},${p[0][1]}`;
    let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
    for (let k = 0; k < p.length - 1; k++) {
      const p0 = p[k - 1] || p[k];
      const p1 = p[k];
      const p2 = p[k + 1];
      const p3 = p[k + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1.map((x) => x.toFixed(1))} ${c2.map((x) => x.toFixed(1))} ${p2.map((x) => x.toFixed(1))}`;
    }
    return d;
  };
  const pi = pts(i);
  const po = pts(o);
  const end = (p, c) => (p.length ? `<circle cx="${p[p.length - 1][0].toFixed(1)}" cy="${p[p.length - 1][1].toFixed(1)}" r="4.5" fill="${c}" stroke="${dotRing}" stroke-width="2.5"/>` : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`
    + `<path d="${path(po)}" fill="none" stroke="${outColor}" stroke-width="3" stroke-linecap="round"/>`
    + `<path d="${path(pi)}" fill="none" stroke="${inColor}" stroke-width="3" stroke-linecap="round"/>`
    + `${end(po, outColor)}${end(pi, inColor)}</svg>`;
}
