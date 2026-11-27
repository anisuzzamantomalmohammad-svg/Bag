// What the home screen widget shows, worked out from the saved data. Kept
// free of React and Android code so it can be tested and reused.
import { accountBalance, allFlows, balanceLine, comingUp, live, displayName, dueToAsk, incomeExpense, itemEffect, itemRecord, liveRecords, totalBalance, upcomingUntil } from '../lib/ledger';
import { addDays, addMonths, daysBetween, fmtDate, fmtShort, lastDayOfMonth, monthLabel, MONTHS, parseYmd, periodOf, today as todayYmd } from '../lib/dates';
import { fmt, round2 } from '../lib/money';
import { accountEmoji } from '../lib/look';
import { DOW, homeGroups, jars, marginOf, perDay, savedLine, toSpend } from '../lib/plan';
import { DRAW, lookById } from '../ui/looks';

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

  // This week or month with Upcoming in it: say where it ends up instead.
  if (view === 'week' || view === 'month') {
    const end = periodOf(now, view, { weekStart: weekStartOf(data), monthStart: data.monthStartDay || 1 }).to;
    const up = upcomingUntil(data, end, now);
    if (up.count) {
      const when = view === 'week' ? fmtDate(end, { weekday: true, long: true, year: false }).split(' ')[0] : fmtShort(end);
      verdict = `By ${when}: ${n(round2(balance + up.total))}`;
    }
  }

  // First what's waiting for a yes (with a Paid button), then what's next.
  const cats = data.categories || {};
  const asks = dueToAsk(data, now).filter((r) => (data.askLater || {})[r.id] !== now).map((r) => ({ key: r.id, date: r.date, record: r, kind: 'upcoming', ask: true }));
  const later = comingUp(data, { days: 14, now }).filter((it) => !(it.kind === 'upcoming' && it.date <= now));
  const coming = [...asks, ...later].slice(0, 2).map((it) => {
    const r = itemRecord(it);
    const c = cats[r.categoryId];
    const a = Number(r.amount) || 0;
    const eff = itemEffect(it);
    const d = parseYmd(it.date);
    const day = it.date === now ? 'Today' : it.date === addDays(now, 1) ? 'Tomorrow' : it.date <= addDays(now, 6) ? `${d.toLocaleDateString('en-NZ', { weekday: 'short' })} ${d.getDate()}` : d.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' });
    const income = r.type === 'income';
    return {
      key: it.key,
      name: it.kind === 'owedToMe' && r.who ? `${r.who} owes you` : it.kind === 'due' && r.who ? `You owe ${r.who}` : displayName(r, data) || 'Repeat',
      emoji: r.type === 'transfer' ? '🔀' : c && !c.deleted ? c.emoji : it.kind === 'owedToMe' || it.kind === 'due' ? '🤝' : '🏷️',
      sub: it.ask ? (income ? 'Did it arrive?' : 'Did you pay it?') : it.date < now ? `Overdue · ${fmtShort(it.date)}` : day,
      amount: `${eff > 0 ? '+' : eff < 0 ? '−' : ''}${n(a)}`,
      kind: eff > 0 ? 'in' : eff < 0 ? 'out' : 'neutral',
      link: it.record ? `bag://record/${it.record.id}` : `bag://repeat/${it.repeat.id}`,
      ask: !!it.ask,
      payLink: it.ask ? `bag://pay/${it.record.id}` : null,
      payWord: income ? 'Got it' : 'Paid',
    };
  });

  // The little line: the last 30 days, then dotted to the end of the month.
  const monthEnd = periodOf(now, 'month', { weekStart: weekStartOf(data), monthStart: data.monthStartDay || 1 }).to;
  let line = null;
  try { line = balanceLine(data, { flows, from: addDays(now, -30), now, until: monthEnd }); } catch (e) { line = null; }
  const byEnd = upcomingUntil(data, monthEnd, now);
  const accounts = live(data.accounts || {}).sort((x, y) => (x.order || 0) - (y.order || 0)).slice(0, 3).map((a) => {
    const b = accountBalance(data, a, { flows, homePerUnit });
    return { id: a.id, text: `${accountEmoji(a)} ${n(b.native)}`, negative: b.native < 0 };
  });

  // 2.2: Bank, Cash and 🫙 pills, what's free to spend, the gold jar line.
  const groups = homeGroups(data, { flows, homePerUnit }).filter((g) => !g.single).map((g) => ({ id: g.id, emoji: g.emoji, text: `${g.emoji} ${n(g.home, { decimals: 0 })}`, negative: g.home < 0, link: g.id === 'savings' ? 'bag://savings' : `bag://home?focus=group:${g.id}` }));
  const spend = toSpend(data, { flows, homePerUnit });
  let pd = null;
  try { pd = perDay(data, { flows, homePerUnit, now }); } catch (e) { pd = null; }
  const jarList = jars(data);
  const jarTotal = round2(jarList.reduce((t, a) => t + accountBalance(data, a, { flows, homePerUnit }).home, 0));
  let gold = null;
  if (jarList.length && jarTotal > 0) { try { gold = savedLine(data, { from: addDays(now, -30), now, flows }); } catch (e) { gold = null; } }
  const w = data.widget || {};
  const under = w.under || 'by';
  let underText = null;
  let underValue = null;
  if (under === 'by' && byEnd.count) { underText = `By ${fmtShort(monthEnd)}`; underValue = round2(balance + byEnd.total); }
  else if (under === 'spend' || (under === 'by' && !byEnd.count)) { underText = 'To spend'; underValue = spend; }
  else if (under === 'perday' && pd && pd.next) { underText = `a day · payday ${DOW[parseYmd(pd.next.date).getDay()]}`; underValue = pd.each; }
  const jarIds = new Set(jarList.map((a) => a.id));
  const jarGoal = round2(live(data.goals || {}).filter((g) => jarIds.has(g.accountId)).reduce((t, g) => t + (Number(g.target) || 0), 0));
  let savedMonth = 0;
  const mFrom = periodOf(now, 'month', { weekStart: weekStartOf(data), monthStart: data.monthStartDay || 1 }).from;
  flows.forEach((f) => { if (jarIds.has(f.accountId) && f.date >= mFrom && f.date <= now) savedMonth += f.home; });
  const look = lookById(data.lookNow);
  const margin = marginOf(data);

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
    line,
    accounts,
    groups,
    spend,
    spendText: n(spend),
    underText,
    underValue,
    underValueText: underValue === null ? null : under === 'perday' ? `≈ ${n(underValue, { decimals: 0 })}` : n(underValue),
    marginText: margin.on ? `🛡 ${n(margin.amount, { decimals: 0 })} aside` : null,
    gold,
    jarTotal,
    jarText: n(jarTotal),
    jarFill: jarGoal > 0 ? jarTotal / jarGoal : jarTotal > 0 ? 1 : 0,
    jarGoalText: jarGoal > 0 ? `of ${n(jarGoal, { decimals: 0 })}` : null,
    savedMonthText: `${savedMonth >= 0 ? '+' : '−'}${n(Math.abs(round2(savedMonth)), { decimals: 0 })} this month`,
    jars: jarList.map((a) => ({ id: a.id, name: a.name, text: n(accountBalance(data, a, { flows, homePerUnit }).native, { decimals: 0 }) })),
    look: { sym: look.sym, draw: look.draw.map((k) => DRAW[k]).filter(Boolean).slice(0, 4) },
    showComing: w.coming !== false,
    byText: byEnd.count ? `By ${fmtShort(monthEnd)}` : null,
    byValue: byEnd.count ? round2(balance + byEnd.total) : null,
    byValueText: byEnd.count ? n(round2(balance + byEnd.total)) : null,
  };
}

// The balance line as a small SVG: solid for what happened, dotted for what's coming.
export function sparkSvg(line, { ink, fut, neg, dot, width = 140, height = 44 }) {
  if (!line || !(line.pts.length + line.fut.length)) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"/>`;
  const all = [...line.pts, ...line.fut];
  const vs = all.map((p) => p.v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const sp = hi - lo || 1;
  const t0 = parseYmd(all[0].date).getTime();
  const span = Math.max(1, parseYmd(all[all.length - 1].date).getTime() - t0);
  const xy = (p) => [3 + ((parseYmd(p.date).getTime() - t0) / span) * (width - 6), 4 + ((hi - p.v) / sp) * (height - 8)];
  const d = (arr) => arr.map((p, k) => { const [x, y] = xy(p); return `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join(' ');
  const last = line.pts.length ? xy(line.pts[line.pts.length - 1]) : xy(line.fut[0]);
  const futColor = line.end < 0 || line.end < line.now ? neg : fut;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`
    + (line.pts.length > 1 ? `<path d="${d(line.pts)}" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` : '')
    + (line.fut.length > 1 ? `<path d="${d(line.fut)}" fill="none" stroke="${futColor}" stroke-width="1.8" stroke-dasharray="2 4" stroke-linecap="round"/>` : '')
    + `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.2" fill="${dot}"/></svg>`;
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

// B+ widget line: the balance across the bottom, with the jars as a smooth
// gold curve on their own scale under it. Fills the width it's given.
export function wideLineSvg(line, gold, { ink, fut, neg, goldColor, width = 320, height = 46 }) {
  const empty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"/>`;
  if (!line || !(line.pts.length + line.fut.length)) return empty;
  const all = [...line.pts, ...line.fut];
  const vs = all.map((p) => p.v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const sp = hi - lo || 1;
  const t0 = parseYmd(all[0].date).getTime();
  const span = Math.max(1, parseYmd(all[all.length - 1].date).getTime() - t0);
  const X = (date) => 2 + ((parseYmd(date).getTime() - t0) / span) * (width - 4);
  const xy = (p) => [X(p.date), 4 + ((hi - p.v) / sp) * (height * 0.62)];
  const d = (arr) => arr.map((p, k) => { const [x, y] = xy(p); return `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join(' ');
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`;
  if (gold && gold.length > 1) {
    const gv = gold.map((p) => p.v);
    const glo = Math.min(0, ...gv);
    const ghi = Math.max(1, ...gv);
    const gy = (v) => height - 2 - ((v - glo) / (ghi - glo || 1)) * (height * 0.4);
    let gd = `M${X(gold[0].date).toFixed(1)} ${gy(gold[0].v).toFixed(1)}`;
    for (let i = 1; i < gold.length; i++) {
      const x0 = X(gold[i - 1].date);
      const x1 = X(gold[i].date);
      const mx = (x0 + x1) / 2;
      gd += ` C${mx.toFixed(1)} ${gy(gold[i - 1].v).toFixed(1)} ${mx.toFixed(1)} ${gy(gold[i].v).toFixed(1)} ${x1.toFixed(1)} ${gy(gold[i].v).toFixed(1)}`;
    }
    const lx = X(gold[gold.length - 1].date);
    out += `<path d="${gd} L${lx.toFixed(1)} ${height} L${X(gold[0].date).toFixed(1)} ${height} Z" fill="${goldColor}" fill-opacity="0.14"/>`;
    out += `<path d="${gd}" fill="none" stroke="${goldColor}" stroke-width="1.8" stroke-linecap="round"/>`;
  }
  const last = line.pts.length ? xy(line.pts[line.pts.length - 1]) : xy(line.fut[0]);
  const futColor = line.end < 0 || line.end < line.now ? neg : fut;
  if (line.pts.length > 1) out += `<path d="${d(line.pts)}" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (line.fut.length > 1) out += `<path d="${d(line.fut)}" fill="none" stroke="${futColor}" stroke-width="1.8" stroke-dasharray="2 4" stroke-linecap="round"/>`;
  return `${out}<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.2" fill="${ink}"/></svg>`;
}

// Faint money drawings behind the widget (widgets can't move, so they sit still).
export function drawingsSvg(look, { color, coin, width = 320, height = 150 }) {
  const spots = [[0.06, 0.12, 22, -12], [0.86, 0.08, 26, 14], [0.9, 0.62, 20, -8], [0.03, 0.7, 24, 10], [0.5, 0.86, 16, 0]];
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`;
  spots.forEach(([fx, fy, size, rot], i) => {
    const x = fx * width;
    const y = fy * height;
    if (i % 2 === 1 || !look.draw.length) {
      out += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="none" stroke="${coin}" stroke-width="1.3"/><text x="${size / 2}" y="${size / 2 + size * 0.17}" font-size="${(size * 0.46).toFixed(1)}" text-anchor="middle" fill="${coin}" font-weight="700">${look.sym.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></g>`;
    } else {
      const p = look.draw[i % look.draw.length];
      out += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot} ${size / 2} ${size / 2}) scale(${(size / 24).toFixed(3)})"><path d="${p}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    }
  });
  return `${out}</svg>`;
}

// The 2x2 jar widget's ring: how full the jars are against a goal, or just a jar.
export function jarSvg(fill, { gold, track, size = 64 }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fill || 0));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="5"/>`
    + `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${gold}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}

// A small gold jar, drawn (Android widgets can't show the 🫙 emoji).
export function jarIconSvg(color, size = 14) {
  const w = size;
  const h = Math.round(size * 1.15);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 23" width="${w}" height="${h}">`
    + `<rect x="5" y="1" width="10" height="3" rx="1.2" fill="${color}"/>`
    + `<path d="M6 5 h8 v1.6 c2.4 1 3.6 2.8 3.6 5.4 v6.2 c0 2.2 -1.6 3.8 -3.8 3.8 h-7.6 c-2.2 0 -3.8 -1.6 -3.8 -3.8 v-6.2 c0 -2.6 1.2 -4.4 3.6 -5.4 z" fill="none" stroke="${color}" stroke-width="1.9" stroke-linejoin="round"/>`
    + `<path d="M4.4 14 h11.2" stroke="${color}" stroke-width="1.4" stroke-opacity="0.6"/></svg>`;
}
